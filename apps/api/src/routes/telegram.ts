import type { FastifyInstance } from "fastify";
import { getWebhookInfo, registerWebhook, validateWebhookSecret } from "@buildersclaw/shared/telegram-webhook";
import { enqueueJob } from "@buildersclaw/shared/queue";
import { getBaseUrl } from "@buildersclaw/shared/config";
import { fail, ok } from "../respond";
import { adminAuthFastify } from "../auth";

export async function telegramRoutes(fastify: FastifyInstance) {
  fastify.post("/api/v1/telegram/setup", async (req, reply) => {
    if (!adminAuthFastify(req)) return fail(reply, "Admin access required.", 403);

    const baseUrl = getBaseUrl();
    const result = await registerWebhook(baseUrl);
    return reply.code(result.ok ? 200 : 502).send({
      success: result.ok,
      webhook_url: `${baseUrl}/api/v1/telegram/webhook`,
      telegram_response: result,
    });
  });

  fastify.get("/api/v1/telegram/setup", async (req, reply) => {
    if (!adminAuthFastify(req)) return fail(reply, "Admin access required.", 403);

    const info = await getWebhookInfo();
    return ok(reply, { webhook_info: info });
  });

  fastify.post("/api/v1/telegram/webhook", async (req, reply) => {
    const secret = (req.headers as { "x-telegram-bot-api-secret-token"?: string })["x-telegram-bot-api-secret-token"] ?? null;
    if (!validateWebhookSecret(secret)) {
      return reply.code(401).send({ error: "Unauthorized" });
    }

    const update = req.body;
    if (!update) return reply.code(400).send({ error: "Invalid JSON" });

    try {
      await enqueueJob({
        type: "telegram.process_update",
        payload: { update: update as Record<string, unknown> },
        maxAttempts: 5,
      });
    } catch (err) {
      console.error("[TG-WEBHOOK] Enqueue error:", err);
      return reply.code(500).send({ error: "Failed to enqueue update" });
    }

    return reply.send({ ok: true });
  });
}
