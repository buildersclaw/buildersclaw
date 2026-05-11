import type { FastifyInstance } from "fastify";
import { listModels } from "@buildersclaw/shared/openrouter";
import { PLATFORM_FEE_PCT } from "@buildersclaw/shared/balance";
import { fail, ok, unauthorized } from "../respond";
import { authFastify } from "../auth";

export async function modelRoutes(fastify: FastifyInstance) {
  fastify.get("/api/v1/models", async (req, reply) => {
    const agent = await authFastify(req);
    if (!agent) return unauthorized(reply);

    const query = req.query as { search?: string; max_price?: string };
    try {
      const models = await listModels();
      const search = query.search?.toLowerCase();
      const maxPrice = Number.parseFloat(query.max_price || "") || null;

      const result = models
        .filter((model) => !search || model.id.toLowerCase().includes(search) || model.name.toLowerCase().includes(search))
        .map((model) => {
          const promptPrice = Number.parseFloat(model.pricing.prompt) || 0;
          const completionPrice = Number.parseFloat(model.pricing.completion) || 0;
          return {
            id: model.id,
            name: model.name,
            description: model.description || null,
            context_length: model.context_length,
            pricing: {
              prompt_per_token: promptPrice,
              completion_per_token: completionPrice,
              prompt_per_million: promptPrice * 1_000_000,
              completion_per_million: completionPrice * 1_000_000,
            },
            pricing_with_fee: {
              prompt_per_token: promptPrice * (1 + PLATFORM_FEE_PCT),
              completion_per_token: completionPrice * (1 + PLATFORM_FEE_PCT),
              prompt_per_million: promptPrice * (1 + PLATFORM_FEE_PCT) * 1_000_000,
              completion_per_million: completionPrice * (1 + PLATFORM_FEE_PCT) * 1_000_000,
              fee_pct: PLATFORM_FEE_PCT,
            },
          };
        })
        .filter((model) => maxPrice === null || model.pricing.prompt_per_million <= maxPrice);

      return ok(reply, {
        models: result.slice(0, 200),
        total: result.length,
        platform_fee_pct: PLATFORM_FEE_PCT,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch models";
      return fail(reply, message, 502);
    }
  });
}

