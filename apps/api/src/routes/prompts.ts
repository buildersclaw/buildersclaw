import { randomUUID } from "crypto";
import type { FastifyInstance } from "fastify";
import { and, count, desc, eq } from "drizzle-orm";
import { canAfford, chargeForPrompt, InsufficientBalanceError, PLATFORM_FEE_PCT } from "@buildersclaw/shared/balance";
import { getDb, schema } from "@buildersclaw/shared/db";
import { parseHackathonMeta } from "@buildersclaw/shared/hackathons";
import { chatCompletion, estimateCost, type ChatMessage } from "@buildersclaw/shared/openrouter";
import { sanitizeGeneratedOutput, sanitizePrompt } from "@buildersclaw/shared/prompt-security";
import { fail, notFound, ok, unauthorized } from "../respond";
import { authFastify } from "../auth";

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100);
}

function buildSystemPrompt(
  hackathon: {
    title: string;
    brief: string;
    description?: string | null;
    rules?: string | null;
    judging_criteria?: string | null;
    ends_at?: string | null;
    team_slug?: string;
  },
  personality: string,
  strategy: string,
  teamName: string,
  challengeType: string,
  previousCode: string,
  roundNumber: number,
): string {
  const projectFormat = challengeType === "landing_page"
    ? `OUTPUT FORMAT:
Output a SINGLE self-contained HTML file.
- ALL CSS in a <style> tag
- ALL JavaScript in a <script> tag
- NO external dependencies (except Google Fonts via @import)
- Must be responsive (mobile + desktop)
- Include smooth animations and micro-interactions`
    : `OUTPUT FORMAT:
Output a COMPLETE PROJECT with multiple files.
Use this exact format for EACH file:

===FILE: path/to/file.ext===
(file content here)
===END_FILE===

One file MUST be named "demo.html" — a self-contained HTML file showcasing the project.`;

  const iterationContext = previousCode
    ? `\nYou are on ROUND ${roundNumber}. The agent is iterating on their previous submission.\nThe previous code is provided in the user message. Apply the agent's new instructions to improve it.\nDo NOT start from scratch — build on the existing code.`
    : "";

  const hackathonContext = [
    `HACKATHON: ${hackathon.title}`,
    "",
    "CHALLENGE BRIEF:",
    hackathon.brief,
    hackathon.description ? `\nDESCRIPTION:\n${hackathon.description}` : "",
    hackathon.rules ? `\nRULES:\n${hackathon.rules}` : "",
    hackathon.judging_criteria ? `\nJUDGING CRITERIA:\n${hackathon.judging_criteria}` : "",
    hackathon.ends_at ? `\nDEADLINE: ${hackathon.ends_at}` : "",
    "\nREPOSITORY RULE: You are generating files only. The agent must create and manage its own GitHub repository outside this prompt flow.",
  ].filter(Boolean).join("\n");

  return `You are building a project for team "${teamName}" in a hackathon competition.

AGENT PROFILE:
${personality ? `- Personality: ${personality}` : "- No personality defined"}
${strategy ? `- Strategy: ${strategy}` : "- No strategy defined"}

${hackathonContext}

${projectFormat}
${iterationContext}

Output ONLY code. No explanations, no markdown fences around the entire output.`;
}

function buildUserPrompt(agentPrompt: string, roundNumber: number, previousCode: string): string {
  if (roundNumber === 1) return agentPrompt;
  return `PREVIOUS CODE:\n${previousCode.substring(0, 20000)}\n\n---\n\nAGENT INSTRUCTIONS FOR ROUND ${roundNumber}:\n${agentPrompt}`;
}

function extractHTML(text: string): string | null {
  const codeBlockMatch = text.match(/```html\s*([\s\S]*?)```/);
  if (codeBlockMatch) return codeBlockMatch[1].trim();
  const htmlMatch = text.match(/(<!DOCTYPE html[\s\S]*<\/html>)/i);
  if (htmlMatch) return htmlMatch[1].trim();
  const htmlMatch2 = text.match(/(<html[\s\S]*<\/html>)/i);
  if (htmlMatch2) return htmlMatch2[1].trim();
  if (text.trim().startsWith("<!DOCTYPE") || text.trim().startsWith("<html")) return text.trim();
  return null;
}

function langToExt(lang: string): string {
  const map: Record<string, string> = {
    typescript: "ts",
    javascript: "js",
    python: "py",
    html: "html",
    css: "css",
    json: "json",
    markdown: "md",
    sql: "sql",
    shell: "sh",
  };
  return map[lang] || lang;
}

function parseGeneratedFiles(text: string, challengeType: string): { path: string; content: string }[] {
  const files: { path: string; content: string }[] = [];
  const fileRegex = /===FILE:\s*(.+?)===\s*\n([\s\S]*?)===END_FILE===/g;
  let match;
  while ((match = fileRegex.exec(text)) !== null) {
    const filePath = match[1].trim();
    const content = match[2].trim();
    if (filePath && content) files.push({ path: filePath, content });
  }
  if (files.length > 0) return files;

  const html = extractHTML(text);
  if (html) return [{ path: challengeType === "landing_page" ? "index.html" : "demo.html", content: html }];

  let idx = 0;
  for (const block of text.matchAll(/```(\w+)?\s*\n([\s\S]*?)```/g)) {
    const lang = block[1] || "txt";
    const content = block[2].trim();
    if (content.length > 20) {
      files.push({ path: `file_${idx}.${langToExt(lang)}`, content });
      idx++;
    }
  }
  return files;
}

export async function promptRoutes(fastify: FastifyInstance) {
  fastify.post("/api/v1/hackathons/:id/teams/:teamId/prompt", async (req, reply) => {
    const agent = await authFastify(req);
    if (!agent) return unauthorized(reply);

    const { id: hackathonId, teamId } = req.params as { id: string; teamId: string };
    const body = req.body as { prompt?: string; model?: string; max_tokens?: number; temperature?: number } || {};
    const modelId = body.model?.trim() || "google/gemini-2.5-flash-lite";
    const maxTokens = Math.min(Math.max(1, body.max_tokens || 4096), 32000);
    const temperature = Math.min(Math.max(0, body.temperature ?? 0.7), 2);

    if (!body.prompt || !body.prompt.trim()) {
      return fail(reply, "prompt is required", 400, "Send a text prompt describing what to build or improve.");
    }
    if (body.prompt.length > 10000) return fail(reply, "Prompt too long. Max 10,000 characters.", 400);

    const sanitized = sanitizePrompt(body.prompt);
    if (!sanitized.safe) {
      return fail(reply, `Prompt rejected: ${sanitized.blocked_reason}`, 400, "Send a clear description of what to build. No meta-instructions.");
    }
    const promptText = sanitized.cleaned;

    const db = getDb();
    const [hackathon] = await db.select().from(schema.hackathons).where(eq(schema.hackathons.id, hackathonId)).limit(1);
    if (!hackathon) return notFound(reply, "Hackathon");

    if (!["open", "in_progress"].includes(hackathon.status)) {
      return fail(reply, "Hackathon is not accepting prompts", 400, `Current status: ${hackathon.status}`);
    }
    if (hackathon.startsAt && new Date(hackathon.startsAt).getTime() > Date.now()) {
      return fail(reply, "Hackathon has not started yet", 400, `Starts at: ${hackathon.startsAt}`);
    }
    if (hackathon.endsAt && new Date(hackathon.endsAt).getTime() <= Date.now()) {
      return fail(reply, "Hackathon deadline has passed", 400, `Deadline was: ${hackathon.endsAt}. No more prompts accepted.`);
    }

    const [team] = await db.select().from(schema.teams).where(and(eq(schema.teams.id, teamId), eq(schema.teams.hackathonId, hackathonId))).limit(1);
    if (!team) return notFound(reply, "Team");

    const [membership] = await db.select().from(schema.teamMembers).where(and(eq(schema.teamMembers.teamId, teamId), eq(schema.teamMembers.agentId, agent.id))).limit(1);
    if (!membership) return fail(reply, "You are not a member of this team", 403);

    const [recentPrompt] = await db
      .select({ createdAt: schema.promptRounds.createdAt })
      .from(schema.promptRounds)
      .where(eq(schema.promptRounds.agentId, agent.id))
      .orderBy(desc(schema.promptRounds.createdAt))
      .limit(1);
    if (recentPrompt) {
      const cooldownMs = 10_000;
      const elapsed = Date.now() - new Date(recentPrompt.createdAt).getTime();
      if (elapsed < cooldownMs) {
        return fail(reply, `Rate limited. Wait ${Math.ceil((cooldownMs - elapsed) / 1000)} more second(s) before sending another prompt.`, 429, "Max 1 prompt every 10 seconds.");
      }
    }

    const [existingRoundsRow] = await db
      .select({ count: count() })
      .from(schema.promptRounds)
      .where(and(eq(schema.promptRounds.teamId, teamId), eq(schema.promptRounds.hackathonId, hackathonId)));
    const roundNumber = (existingRoundsRow?.count || 0) + 1;

    let previousCode = "";
    if (roundNumber > 1) {
      const [prevRound] = await db
        .select({ files: schema.promptRounds.files })
        .from(schema.promptRounds)
        .where(and(eq(schema.promptRounds.teamId, teamId), eq(schema.promptRounds.hackathonId, hackathonId)))
        .orderBy(desc(schema.promptRounds.roundNumber))
        .limit(1);
      if (Array.isArray(prevRound?.files)) {
        previousCode = prevRound.files
          .map((file) => {
            const item = file as { path?: unknown; content?: unknown };
            return typeof item.path === "string" && typeof item.content === "string" ? `--- ${item.path} ---\n${item.content}` : "";
          })
          .filter(Boolean)
          .join("\n\n");
      }
    }

    const hackathonMeta = parseHackathonMeta(hackathon.judgingCriteria);
    const systemPrompt = buildSystemPrompt(
      {
        title: hackathon.title,
        brief: hackathon.brief,
        description: hackathon.description || null,
        rules: hackathon.rules || null,
        judging_criteria: hackathonMeta.criteria_text,
        ends_at: hackathon.endsAt || null,
        team_slug: slugify(team.name),
      },
      agent.personality || "",
      agent.strategy || "",
      team.name,
      hackathon.challengeType || "landing_page",
      previousCode,
      roundNumber,
    );
    const messages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: buildUserPrompt(promptText, roundNumber, previousCode) },
    ];

    let estimate;
    try {
      estimate = await estimateCost({ model: modelId, messages, max_tokens: maxTokens });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown model";
      return fail(reply, message, 400, "Use GET /api/v1/models to see available models.");
    }

    const affordCheck = await canAfford(agent.id, estimate.estimated_cost_usd);
    if (!affordCheck.can_afford) {
      return fail(reply, `Insufficient balance. Estimated cost: $${affordCheck.estimated_total.toFixed(6)} (includes ${PLATFORM_FEE_PCT * 100}% fee). Your balance: $${affordCheck.balance_usd.toFixed(6)}`, 402, "Deposit USDC via POST /api/v1/balance to fund your account.");
    }

    if (hackathon.status === "open") {
      await db.update(schema.hackathons).set({ status: "in_progress", updatedAt: new Date().toISOString() }).where(eq(schema.hackathons.id, hackathonId));
    }

    let result;
    try {
      result = await chatCompletion({ model: modelId, messages, max_tokens: maxTokens, temperature });
    } catch (err) {
      const message = err instanceof Error ? err.message : "LLM call failed";
      return fail(reply, `Code generation failed: ${message}`, 502, "Try a different model or try again.");
    }

    const roundId = randomUUID();
    let charge;
    try {
      charge = await chargeForPrompt({
        agentId: agent.id,
        modelCostUsd: result.cost_usd,
        referenceId: roundId,
        metadata: {
          model: result.model,
          input_tokens: result.input_tokens,
          output_tokens: result.output_tokens,
          hackathon_id: hackathonId,
          team_id: teamId,
          round_number: roundNumber,
        },
      });
    } catch (err) {
      if (err instanceof InsufficientBalanceError) {
        return fail(reply, err.message, 402, "Deposit more USDC via POST /api/v1/balance");
      }
      throw err;
    }

    const files = parseGeneratedFiles(result.text, hackathon.challengeType || "landing_page").map((file) => ({
      path: file.path,
      content: sanitizeGeneratedOutput(file.content),
    }));

    await db.insert(schema.promptRounds).values({
      id: roundId,
      teamId,
      hackathonId,
      agentId: agent.id,
      roundNumber,
      promptText,
      llmProvider: "openrouter",
      llmModel: result.model,
      files,
      commitSha: null,
      costUsd: result.cost_usd,
      feeUsd: charge.fee,
      inputTokens: result.input_tokens,
      outputTokens: result.output_tokens,
      createdAt: new Date().toISOString(),
    });

    await db.update(schema.teams).set({ status: "building" }).where(eq(schema.teams.id, teamId));
    await db.insert(schema.activityLog).values({
      id: randomUUID(),
      hackathonId,
      teamId,
      agentId: agent.id,
      eventType: "prompt_submitted",
      eventData: {
        round: roundNumber,
        model: result.model,
        input_tokens: result.input_tokens,
        output_tokens: result.output_tokens,
        cost_usd: result.cost_usd,
        fee_usd: charge.fee,
        total_charged_usd: charge.total_charged,
        balance_after_usd: charge.balance_after,
        duration_ms: result.duration_ms,
        file_count: files.length,
        prompt_length: promptText.length,
      },
    });

    return ok(reply, {
      round: roundNumber,
      model: result.model,
      billing: {
        model_cost_usd: result.cost_usd,
        fee_usd: charge.fee,
        fee_pct: PLATFORM_FEE_PCT,
        total_charged_usd: charge.total_charged,
        balance_after_usd: charge.balance_after,
        input_tokens: result.input_tokens,
        output_tokens: result.output_tokens,
      },
      files: files.map((file) => ({ path: file.path, size: file.content.length })),
      file_contents: files.map((file) => ({ path: file.path, content: file.content })),
      github: null,
      duration_ms: result.duration_ms,
      hint: roundNumber === 1
        ? "Round 1 complete. Push these files to your own GitHub repo, then submit that repo URL when you are ready."
        : `Round ${roundNumber} complete. Push the updated files to your own GitHub repo, then resubmit when ready.`,
      next_steps: [
        "Create or update your own public GitHub repository locally.",
        "Commit and push these generated files to that repository.",
        `Call POST /api/v1/hackathons/${hackathonId}/teams/${teamId}/submit with {"repo_url":"https://github.com/owner/repo"}.`,
      ],
    });
  });
}

