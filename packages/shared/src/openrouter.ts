import OpenAI from "openai";

export interface OpenRouterModel {
  id: string;
  name: string;
  description: string;
  context_length: number;
  pricing: {
    prompt: string;
    completion: string;
    request: string;
    image: string;
  };
  top_provider: {
    context_length: number;
    max_completion_tokens: number;
    is_moderated: boolean;
  } | null;
  architecture: {
    modality: string;
    tokenizer: string;
    instruct_type: string | null;
  } | null;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface PromptResult {
  id: string;
  model: string;
  text: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cost_usd: number;
  finish_reason: string | null;
  duration_ms: number;
}

let cachedClient: OpenAI | null = null;
let modelsCache: { data: OpenRouterModel[]; fetchedAt: number } | null = null;
const MODELS_CACHE_TTL = 5 * 60 * 1000;

function getClient(): OpenAI {
  if (cachedClient) return cachedClient;

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("Missing OPENROUTER_API_KEY environment variable");

  cachedClient = new OpenAI({
    apiKey,
    baseURL: "https://openrouter.ai/api/v1",
    defaultHeaders: {
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "https://buildersclaw.com",
      "X-Title": "BuildersClaw",
    },
  });
  return cachedClient;
}

export async function listModels(): Promise<OpenRouterModel[]> {
  if (modelsCache && Date.now() - modelsCache.fetchedAt < MODELS_CACHE_TTL) return modelsCache.data;

  const res = await fetch("https://openrouter.ai/api/v1/models", {
    headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY || ""}` },
  });
  if (!res.ok) throw new Error(`Failed to fetch OpenRouter models: ${res.status}`);

  const json = await res.json() as { data?: OpenRouterModel[] };
  const models = (json.data || []).filter((model) => {
    return model.pricing && (Number.parseFloat(model.pricing.prompt) > 0 || Number.parseFloat(model.pricing.completion) > 0);
  });

  modelsCache = { data: models, fetchedAt: Date.now() };
  return models;
}

export async function getModelPricing(modelId: string): Promise<{ prompt_per_token: number; completion_per_token: number; found: boolean }> {
  const models = await listModels();
  const model = models.find((candidate) => candidate.id === modelId);
  if (!model) return { prompt_per_token: 0, completion_per_token: 0, found: false };
  return {
    prompt_per_token: Number.parseFloat(model.pricing.prompt) || 0,
    completion_per_token: Number.parseFloat(model.pricing.completion) || 0,
    found: true,
  };
}

export async function chatCompletion(options: {
  model: string;
  messages: ChatMessage[];
  max_tokens?: number;
  temperature?: number;
}): Promise<PromptResult> {
  const client = getClient();
  const pricing = await getModelPricing(options.model);
  const startMs = Date.now();

  const response = await client.chat.completions.create({
    model: options.model,
    messages: options.messages,
    max_tokens: options.max_tokens ?? 4096,
    temperature: options.temperature ?? 0.7,
  });

  const choice = response.choices?.[0];
  const usage = response.usage;
  const inputTokens = usage?.prompt_tokens ?? 0;
  const outputTokens = usage?.completion_tokens ?? 0;

  return {
    id: response.id || "",
    model: response.model || options.model,
    text: choice?.message?.content || "",
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    total_tokens: inputTokens + outputTokens,
    cost_usd: inputTokens * pricing.prompt_per_token + outputTokens * pricing.completion_per_token,
    finish_reason: choice?.finish_reason || null,
    duration_ms: Date.now() - startMs,
  };
}

export async function estimateCost(options: {
  model: string;
  messages: ChatMessage[];
  max_tokens?: number;
}): Promise<{
  estimated_input_tokens: number;
  max_output_tokens: number;
  estimated_cost_usd: number;
  pricing: { prompt_per_token: number; completion_per_token: number };
}> {
  const pricing = await getModelPricing(options.model);
  if (!pricing.found) throw new Error(`Model not found: ${options.model}`);

  const estimatedInputTokens = Math.ceil(options.messages.reduce((sum, message) => sum + message.content.length, 0) / 4);
  const maxOutputTokens = options.max_tokens ?? 4096;

  return {
    estimated_input_tokens: estimatedInputTokens,
    max_output_tokens: maxOutputTokens,
    estimated_cost_usd: estimatedInputTokens * pricing.prompt_per_token + maxOutputTokens * pricing.completion_per_token,
    pricing,
  };
}

