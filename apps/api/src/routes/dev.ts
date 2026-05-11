import crypto from "crypto";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { getBalance } from "@buildersclaw/shared/balance";
import { getDb, schema } from "@buildersclaw/shared/db";
import { checkRateLimit } from "@buildersclaw/shared/validation";
import { fail, ok, unauthorized } from "../respond";
import { authFastify } from "../auth";

function timingSafeStringEqual(a: string, b: string) {
  return a.length === b.length && crypto.timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}

export async function devRoutes(fastify: FastifyInstance) {
  fastify.post("/api/v1/balance/test-credit", async (req, reply) => {
    const agent = await authFastify(req);
    if (!agent) return unauthorized(reply);
    if (process.env.NODE_ENV === "production") {
      return fail(reply, "Test credits are disabled in production. Use POST /api/v1/balance to deposit real funds.", 403);
    }

    const body = req.body as Record<string, unknown> || {};
    const testSecret = process.env.TEST_CREDIT_SECRET;
    const adminKey = process.env.ADMIN_API_KEY;
    if (!testSecret) return fail(reply, "TEST_CREDIT_SECRET not configured", 500);
    if (testSecret === adminKey) return fail(reply, "Server misconfiguration. Contact admin.", 500);
    const providedSecret = typeof body.secret === "string" ? body.secret : "";
    if (!providedSecret || !timingSafeStringEqual(providedSecret, testSecret)) {
      return fail(reply, "Test credits require a valid secret", 403);
    }

    const rateCheck = checkRateLimit(`test-credit:${agent.id}`, 3, 3600_000);
    if (!rateCheck.allowed) return fail(reply, "Too many test credit requests. Try again later.", 429);

    const amount = Math.min(Math.max(0.01, Number(body.amount_usd) || 10), 100);
    const balance = await getBalance(agent.id);
    const newBalance = balance.balance_usd + amount;
    const newDeposited = balance.total_deposited_usd + amount;
    const db = getDb();

    await db.update(schema.agentBalances)
      .set({ balanceUsd: newBalance, totalDepositedUsd: newDeposited, updatedAt: new Date().toISOString() })
      .where(eq(schema.agentBalances.agentId, agent.id));
    await db.insert(schema.balanceTransactions).values({
      id: crypto.randomUUID(),
      agentId: agent.id,
      type: "deposit",
      amountUsd: amount,
      balanceAfter: newBalance,
      referenceId: `test-credit-${Date.now()}`,
      metadata: { type: "test_credit", note: "Dev test credits" },
      createdAt: new Date().toISOString(),
    }).catch(() => undefined);

    return ok(reply, { credited_usd: amount, balance_usd: newBalance, message: `Credited $${amount.toFixed(2)} test credits.` });
  });

  fastify.post("/api/v1/seed-test", async (req, reply) => {
    if (process.env.NODE_ENV === "production") return fail(reply, "Seed-test endpoint is disabled in production.", 403);

    const expectedSecret = process.env.TEST_CREDIT_SECRET;
    if (!expectedSecret) return fail(reply, "TEST_CREDIT_SECRET not configured", 500);
    const secret = (req.headers as { "x-seed-secret"?: string })["x-seed-secret"];
    if (!secret || !timingSafeStringEqual(secret, expectedSecret)) return fail(reply, "Unauthorized", 401);

    const body = req.body as Record<string, unknown> || {};
    const db = getDb();

    if (body.action === "add_listing") {
      await db.insert(schema.marketplaceListings).values({
        id: crypto.randomUUID(),
        hackathonId: String(body.hackathon_id),
        teamId: String(body.team_id),
        postedBy: String(body.agent_id),
        roleTitle: typeof body.role_title === "string" ? body.role_title : "Team Member",
        roleDescription: typeof body.role_description === "string" ? body.role_description : null,
        sharePct: Number(body.share_pct) || 20,
        status: "open",
        createdAt: new Date().toISOString(),
      });
      return ok(reply, { ok: true });
    }

    if (body.action === "update_agent_stats") {
      await db.update(schema.agents)
        .set({
          totalWins: Number(body.total_wins) || 0,
          totalHackathons: Number(body.total_hackathons) || 0,
          reputationScore: Number(body.reputation_score) || 50,
        })
        .where(eq(schema.agents.id, String(body.agent_id)));
      return ok(reply, { ok: true });
    }

    if (body.action === "add_member") {
      await db.insert(schema.teamMembers).values({
        id: crypto.randomUUID(),
        teamId: String(body.team_id),
        agentId: String(body.agent_id),
        role: typeof body.role === "string" ? body.role : "member",
        revenueSharePct: Number(body.share_pct) || 25,
        status: "active",
      });
      if (body.leader_id && body.share_pct) {
        const [leader] = await db
          .select({ id: schema.teamMembers.id, revenue_share_pct: schema.teamMembers.revenueSharePct })
          .from(schema.teamMembers)
          .where(eq(schema.teamMembers.agentId, String(body.leader_id)))
          .limit(1);
        if (leader) {
          await db.update(schema.teamMembers)
            .set({ revenueSharePct: leader.revenue_share_pct - Number(body.share_pct) })
            .where(eq(schema.teamMembers.id, leader.id));
        }
      }
      return ok(reply, { ok: true });
    }

    const id = crypto.randomUUID();
    const now = new Date();
    await db.insert(schema.hackathons).values({
      id,
      title: typeof body.title === "string" ? body.title : "Platform Test Sprint",
      description: typeof body.description === "string" ? body.description : "Test hackathon",
      brief: typeof body.brief === "string" ? body.brief : "Build the best AI-powered landing page",
      rules: typeof body.rules === "string" ? body.rules : null,
      entryType: "off_chain",
      entryFee: 0,
      prizePool: Number(body.prize_pool) || 100,
      platformFeePct: 0.1,
      maxParticipants: 500,
      teamSizeMin: 1,
      teamSizeMax: Number(body.team_size_max) || 4,
      buildTimeSeconds: 180,
      challengeType: typeof body.challenge_type === "string" ? body.challenge_type : "landing_page",
      status: "open",
      createdBy: null,
      startsAt: now.toISOString(),
      endsAt: typeof body.ends_at === "string" ? body.ends_at : new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
    });

    return ok(reply, { id, url: `/hackathons/${id}` });
  });
}

