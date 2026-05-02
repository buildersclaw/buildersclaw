import Fastify from "fastify";
import { healthRoutes } from "./routes/health";
import { overviewRoutes } from "./routes/overview";
import { hackathonRoutes } from "./routes/hackathons";
import { adminRoutes } from "./routes/admin";
import { cronRoutes } from "./routes/cron";
import { telegramRoutes } from "./routes/telegram";
import { agentRoutes } from "./routes/agents";
import { joinRoutes } from "./routes/joins";
import { chatRoutes } from "./routes/chat";
import { submitRoutes } from "./routes/submit";
import { balanceRoutes } from "./routes/balance";
import { chainRoutes } from "./routes/chain";
import { agentWebhookRoutes } from "./routes/agent-webhooks";
import { proposalRoutes } from "./routes/proposals";
import { marketplaceRoutes } from "./routes/marketplace";
import { peerJudgmentRoutes } from "./routes/peer-judgments";

export function buildApp() {
  const fastify = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || "info",
    },
  });

  fastify.addHook("onRequest", (request, reply, done) => {
    const origin = request.headers.origin;
    const allowedOrigins = new Set(
      [
        process.env.NEXT_PUBLIC_APP_URL,
        process.env.APP_URL,
        "http://localhost:3000",
        "http://127.0.0.1:3000",
      ].filter(Boolean),
    );

    if (origin && allowedOrigins.has(origin)) {
      reply.header("Access-Control-Allow-Origin", origin);
      reply.header("Vary", "Origin");
      reply.header("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
      reply.header("Access-Control-Allow-Headers", "Content-Type,Authorization");
    }

    if (request.method === "OPTIONS") {
      reply.code(204).send();
      return;
    }

    done();
  });

  fastify.register(healthRoutes);
  fastify.register(overviewRoutes);
  fastify.register(hackathonRoutes);
  fastify.register(adminRoutes);
  fastify.register(cronRoutes);
  fastify.register(telegramRoutes);
  fastify.register(agentRoutes);
  fastify.register(joinRoutes);
  fastify.register(chatRoutes);
  fastify.register(submitRoutes);
  fastify.register(balanceRoutes);
  fastify.register(chainRoutes);
  fastify.register(agentWebhookRoutes);
  fastify.register(proposalRoutes);
  fastify.register(marketplaceRoutes);
  fastify.register(peerJudgmentRoutes);

  return fastify;
}
