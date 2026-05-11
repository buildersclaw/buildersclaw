import { randomUUID } from "crypto";
import type { FastifyInstance } from "fastify";
import { and, asc, count, countDistinct, desc, eq, gt, inArray } from "drizzle-orm";
import { getDb, schema } from "@buildersclaw/shared/db";
import { getUsdcDecimals, getUsdcSymbol } from "@buildersclaw/shared/chain";
import { telegramHackathonCreated } from "@buildersclaw/shared/telegram";
import { createSingleAgentTeam, formatHackathon, loadHackathonLeaderboard, calculatePrizePool, parseHackathonMeta, sanitizeString, sanitizeUrl, serializeHackathonMeta, toInternalHackathonStatus, toPublicHackathonStatus } from "@buildersclaw/shared/hackathons";
import { createOrReuseJudgingRun } from "@buildersclaw/shared/judging-runs";
import { ok, created, fail, notFound, unauthorized } from "../respond";
import { adminAuthFastify, authFastify } from "../auth";

function hasDbConfig() {
  return Boolean(process.env.DATABASE_URL);
}

const hackathonSelect = {
  id: schema.hackathons.id,
  title: schema.hackathons.title,
  description: schema.hackathons.description,
  brief: schema.hackathons.brief,
  rules: schema.hackathons.rules,
  entry_type: schema.hackathons.entryType,
  entry_fee: schema.hackathons.entryFee,
  prize_pool: schema.hackathons.prizePool,
  platform_fee_pct: schema.hackathons.platformFeePct,
  max_participants: schema.hackathons.maxParticipants,
  team_size_min: schema.hackathons.teamSizeMin,
  team_size_max: schema.hackathons.teamSizeMax,
  build_time_seconds: schema.hackathons.buildTimeSeconds,
  challenge_type: schema.hackathons.challengeType,
  status: schema.hackathons.status,
  created_by: schema.hackathons.createdBy,
  starts_at: schema.hackathons.startsAt,
  ends_at: schema.hackathons.endsAt,
  judging_criteria: schema.hackathons.judgingCriteria,
  github_repo: schema.hackathons.githubRepo,
  created_at: schema.hackathons.createdAt,
  updated_at: schema.hackathons.updatedAt,
};

function getConfiguredChainId(): number | null {
  const raw = process.env.CHAIN_ID;
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseNumber(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function parseInteger(value: unknown, fallback: number, min: number, max: number) {
  return Math.round(parseNumber(value, fallback, min, max));
}

function parseDate(value: unknown, fallback: Date): Date | null {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getConfiguredUsdcDecimals() {
  try {
    return getUsdcDecimals();
  } catch {
    return Number.parseInt(process.env.USDC_DECIMALS || "18", 10);
  }
}

export async function hackathonRoutes(fastify: FastifyInstance) {
  // POST /api/v1/hackathons
  fastify.post("/api/v1/hackathons", async (req, reply) => {
    const isAdmin = adminAuthFastify(req);
    const agent = isAdmin ? null : await authFastify(req);
    if (!isAdmin && !agent) return unauthorized(reply, "Admin or agent authentication required");

    const body = req.body as Record<string, unknown> || {};
    const title = sanitizeString(body.title, 200);
    const brief = sanitizeString(body.brief, 5000);
    if (!title || !brief) return fail(reply, "title and brief are required", 400);

    const now = new Date();
    const startsAt = parseDate(body.starts_at, now);
    const endsAt = parseDate(body.ends_at, new Date(now.getTime() + 24 * 60 * 60 * 1000));
    if (!startsAt) return fail(reply, "starts_at must be a valid date string", 400);
    if (!endsAt) return fail(reply, "ends_at must be a valid date string", 400);
    if (endsAt.getTime() <= startsAt.getTime()) return fail(reply, "ends_at must be after starts_at", 400);

    const rawStatus = sanitizeString(body.status, 32) || "open";
    const status = ["draft", "scheduled", "open", "in_progress", "judging", "completed"].includes(rawStatus) ? rawStatus : "open";
    const contractAddress = sanitizeString(body.contract_address, 128);
    const teamSizeMin = parseInteger(body.team_size_min, 1, 1, 20);
    const teamSizeMax = Math.max(teamSizeMin, parseInteger(body.team_size_max, 5, 1, 20));
    const platformFeePct = parseNumber(body.platform_fee_pct, Number.parseFloat(process.env.PLATFORM_FEE_PCT || "0.1"), 0, 1);
    const chainId = Number.isInteger(Number(body.chain_id)) ? Number(body.chain_id) : getConfiguredChainId();
    const id = randomUUID();

    try {
      const [hackathon] = await getDb().insert(schema.hackathons).values({
        id,
        title,
        description: sanitizeString(body.description, 2000) || null,
        brief,
        rules: sanitizeString(body.rules, 4000),
        entryType: contractAddress ? "on_chain" : "off_chain",
        entryFee: parseInteger(body.entry_fee, 0, 0, 1_000_000),
        prizePool: parseNumber(body.prize_pool, 0, 0, 100_000_000),
        platformFeePct,
        maxParticipants: parseInteger(body.max_participants, 100, 1, 10_000),
        teamSizeMin,
        teamSizeMax,
        buildTimeSeconds: parseInteger(body.build_time_seconds, 180, 30, 86_400),
        challengeType: sanitizeString(body.challenge_type, 50) || "other",
        status,
        createdBy: agent?.id ?? null,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        judgingCriteria: serializeHackathonMeta({
          chain_id: chainId,
          contract_address: contractAddress,
          sponsor_address: sanitizeString(body.sponsor_address, 128),
          token_address: sanitizeString(body.token_address, 128) || process.env.USDC_ADDRESS || null,
          token_symbol: sanitizeString(body.token_symbol, 32) || getUsdcSymbol(),
          token_decimals: Number.isInteger(Number(body.token_decimals)) ? Number(body.token_decimals) : getConfiguredUsdcDecimals(),
          criteria_text: sanitizeString(body.judging_criteria ?? body.rules, 4000),
          judge_method: sanitizeString(body.judge_method, 64),
          genlayer_contract: sanitizeString(body.genlayer_contract, 128),
        }),
        githubRepo: sanitizeUrl(body.github_repo),
      }).returning(hackathonSelect);

      if (status === "open") {
        telegramHackathonCreated({ id, title, prize_pool: Number(hackathon.prize_pool || 0), challenge_type: String(hackathon.challenge_type || "other") }).catch(() => {});
      }

      return created(reply, { ...formatHackathon(hackathon as Record<string, unknown>), url: `/hackathons/${id}` });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown database error";
      return fail(reply, `Failed to create hackathon: ${message}`, 500);
    }
  });

  // GET /api/v1/hackathons
  fastify.get("/api/v1/hackathons", async (req, reply) => {
    if (!hasDbConfig()) return ok(reply, []);

    const db = getDb();

    const query = req.query as { status?: string; challenge_type?: string };

    const where = query.challenge_type ? eq(schema.hackathons.challengeType, query.challenge_type.slice(0, 50)) : undefined;
    const hackathons = await db
      .select(hackathonSelect)
      .from(schema.hackathons)
      .where(where)
      .orderBy(desc(schema.hackathons.createdAt))
      .limit(50);

    const hackathonIds = hackathons.map((h) => h.id);
    const [teamCounts, agentCounts] = hackathonIds.length
      ? await Promise.all([
          db
            .select({ hackathon_id: schema.teams.hackathonId, total: count() })
            .from(schema.teams)
            .where(inArray(schema.teams.hackathonId, hackathonIds))
            .groupBy(schema.teams.hackathonId),
          db
            .select({ hackathon_id: schema.teams.hackathonId, total: countDistinct(schema.teamMembers.agentId) })
            .from(schema.teamMembers)
            .innerJoin(schema.teams, eq(schema.teamMembers.teamId, schema.teams.id))
            .where(inArray(schema.teams.hackathonId, hackathonIds))
            .groupBy(schema.teams.hackathonId),
        ])
      : [[], []];

    const teamCountByHackathon = new Map(teamCounts.map((row) => [row.hackathon_id, row.total]));
    const agentCountByHackathon = new Map(agentCounts.map((row) => [row.hackathon_id, row.total]));

    const enriched = hackathons.map((h) => ({
      ...formatHackathon(h as Record<string, unknown>),
      total_teams: teamCountByHackathon.get(h.id) || 0,
      total_agents: agentCountByHackathon.get(h.id) || 0,
    }));

    const filtered = query.status
      ? enriched.filter((h) => h.status === query.status)
      : enriched;

    return ok(reply, filtered);
  });

  // GET /api/v1/hackathons/:id
  fastify.get("/api/v1/hackathons/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const db = getDb();

    const [hackathon] = await db.select(hackathonSelect).from(schema.hackathons).where(eq(schema.hackathons.id, id)).limit(1);

    if (!hackathon) return notFound(reply, "Hackathon");

    const teams = await db
      .select({
        id: schema.teams.id,
        hackathon_id: schema.teams.hackathonId,
        name: schema.teams.name,
        color: schema.teams.color,
        floor_number: schema.teams.floorNumber,
        status: schema.teams.status,
        telegram_chat_id: schema.teams.telegramChatId,
        created_by: schema.teams.createdBy,
        created_at: schema.teams.createdAt,
      })
      .from(schema.teams)
      .where(eq(schema.teams.hackathonId, id))
      .orderBy(asc(schema.teams.floorNumber));

    const enrichedTeams = await Promise.all(
      teams.map(async (team) => {
        const flatMembers = await db
          .select({
            id: schema.teamMembers.id,
            team_id: schema.teamMembers.teamId,
            agent_id: schema.teamMembers.agentId,
            role: schema.teamMembers.role,
            revenue_share_pct: schema.teamMembers.revenueSharePct,
            joined_via: schema.teamMembers.joinedVia,
            status: schema.teamMembers.status,
            joined_at: schema.teamMembers.joinedAt,
            agent_name: schema.agents.name,
            agent_display_name: schema.agents.displayName,
            agent_avatar_url: schema.agents.avatarUrl,
          })
          .from(schema.teamMembers)
          .innerJoin(schema.agents, eq(schema.teamMembers.agentId, schema.agents.id))
          .where(eq(schema.teamMembers.teamId, team.id))
          .orderBy(asc(schema.teamMembers.role));

        return { ...team, members: flatMembers };
      }),
    );

    const totalAgents = enrichedTeams.reduce((sum, t) => sum + t.members.length, 0);
    const prize = await calculatePrizePool(id);

    return ok(reply, {
      ...formatHackathon(hackathon as Record<string, unknown>),
      teams: enrichedTeams,
      total_teams: teams.length,
      total_agents: totalAgents,
      prize_pool_dynamic: prize,
    });
  });

  // GET /api/v1/hackathons/:id/activity
  fastify.get("/api/v1/hackathons/:id/activity", async (req, reply) => {
    const { id: hackathonId } = req.params as { id: string };
    const query = req.query as { since?: string; limit?: string };
    const db = getDb();

    const [hackathon] = await db.select({ id: schema.hackathons.id }).from(schema.hackathons).where(eq(schema.hackathons.id, hackathonId)).limit(1);
    if (!hackathon) return notFound(reply, "Hackathon");

    const limit = Math.min(Math.max(Number.parseInt(query.limit || "50", 10) || 50, 1), 200);
    const where = query.since
      ? and(eq(schema.activityLog.hackathonId, hackathonId), gt(schema.activityLog.createdAt, query.since))
      : eq(schema.activityLog.hackathonId, hackathonId);

    const events = await db
      .select({
        id: schema.activityLog.id,
        hackathon_id: schema.activityLog.hackathonId,
        team_id: schema.activityLog.teamId,
        agent_id: schema.activityLog.agentId,
        event_type: schema.activityLog.eventType,
        event_data: schema.activityLog.eventData,
        created_at: schema.activityLog.createdAt,
        agent_name: schema.agents.name,
        agent_display_name: schema.agents.displayName,
        team_name: schema.teams.name,
        team_color: schema.teams.color,
      })
      .from(schema.activityLog)
      .leftJoin(schema.agents, eq(schema.activityLog.agentId, schema.agents.id))
      .leftJoin(schema.teams, eq(schema.activityLog.teamId, schema.teams.id))
      .where(where)
      .orderBy(desc(schema.activityLog.createdAt))
      .limit(limit);

    return ok(reply, events);
  });

  // POST /api/v1/hackathons/:id/check-deadline
  fastify.post("/api/v1/hackathons/:id/check-deadline", async (req, reply) => {
    const agent = await authFastify(req);
    if (!agent) return unauthorized(reply);

    const { id: hackathonId } = req.params as { id: string };
    const [hackathon] = await getDb()
      .select({ id: schema.hackathons.id, status: schema.hackathons.status, ends_at: schema.hackathons.endsAt })
      .from(schema.hackathons)
      .where(eq(schema.hackathons.id, hackathonId))
      .limit(1);

    if (!hackathon) return notFound(reply, "Hackathon");
    if (hackathon.status === "completed") return ok(reply, { status: "finalized", already: true });
    if (hackathon.status === "judging") return ok(reply, { status: "judging", already: true });
    if (!hackathon.ends_at) return fail(reply, "Hackathon has no deadline set", 400);

    const deadline = new Date(hackathon.ends_at).getTime();
    if (Date.now() < deadline) {
      return ok(reply, { status: "open", remaining_seconds: Math.ceil((deadline - Date.now()) / 1000) });
    }

    try {
      const { run, created } = await createOrReuseJudgingRun(hackathonId);
      return ok(reply, { status: "judging", queued: created, judging_run_id: run.id }, 202);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return fail(reply, `Failed to judge hackathon: ${message}`, 500);
    }
  });

  // GET /api/v1/hackathons/:id/building
  fastify.get("/api/v1/hackathons/:id/building", async (req, reply) => {
    const { id: hackathonId } = req.params as { id: string };
    const db = getDb();

    const [hackathon] = await db.select().from(schema.hackathons).where(eq(schema.hackathons.id, hackathonId)).limit(1);
    if (!hackathon) return notFound(reply, "Hackathon");

    const teams = await db.select().from(schema.teams).where(eq(schema.teams.hackathonId, hackathonId)).orderBy(asc(schema.teams.floorNumber));
    const leaderboard = await loadHackathonLeaderboard(hackathonId);
    const scoreByTeamId = new Map((leaderboard || []).map((entry) => [entry.team_id, entry.total_score]));

    const floors = await Promise.all(teams.map(async (team) => {
      const members = await db
        .select({
          agent_id: schema.teamMembers.agentId,
          role: schema.teamMembers.role,
          revenue_share_pct: schema.teamMembers.revenueSharePct,
          agent_name: schema.agents.name,
          agent_display_name: schema.agents.displayName,
        })
        .from(schema.teamMembers)
        .leftJoin(schema.agents, eq(schema.teamMembers.agentId, schema.agents.id))
        .where(eq(schema.teamMembers.teamId, team.id))
        .orderBy(desc(schema.teamMembers.revenueSharePct));

      const lobsters = members.map((member) => {
        const sharePct = member.revenue_share_pct;
        return {
          agent_id: member.agent_id,
          agent_name: member.agent_name || "",
          display_name: member.agent_display_name || null,
          role: member.role,
          share_pct: sharePct,
          size: sharePct >= 50 ? "large" : sharePct >= 20 ? "medium" : "small",
        };
      });

      return {
        floor_number: team.floorNumber,
        team_id: team.id,
        team_name: team.name,
        color: team.color,
        lobsters,
        empty_seats: Math.max(0, (hackathon.teamSizeMax || 1) - lobsters.length),
        status: team.status,
        score: scoreByTeamId.get(team.id) ?? null,
      };
    }));

    return ok(reply, {
      hackathon_id: hackathonId,
      hackathon_title: hackathon.title,
      status: hackathon.status,
      total_floors: floors.length,
      floors,
    });
  });

  // GET /api/v1/hackathons/:id/teams
  fastify.get("/api/v1/hackathons/:id/teams", async (req, reply) => {
    const { id: hackathonId } = req.params as { id: string };
    const db = getDb();

    const [hackathon] = await db.select({ id: schema.hackathons.id }).from(schema.hackathons).where(eq(schema.hackathons.id, hackathonId)).limit(1);
    if (!hackathon) return notFound(reply, "Hackathon");

    const teams = await db
      .select({
        id: schema.teams.id,
        hackathon_id: schema.teams.hackathonId,
        name: schema.teams.name,
        color: schema.teams.color,
        floor_number: schema.teams.floorNumber,
        status: schema.teams.status,
        telegram_chat_id: schema.teams.telegramChatId,
        created_by: schema.teams.createdBy,
        created_at: schema.teams.createdAt,
      })
      .from(schema.teams)
      .where(eq(schema.teams.hackathonId, hackathonId))
      .orderBy(asc(schema.teams.floorNumber));

    const enriched = await Promise.all(teams.map(async (team) => {
      const members = await db
        .select({
          id: schema.teamMembers.id,
          team_id: schema.teamMembers.teamId,
          agent_id: schema.teamMembers.agentId,
          role: schema.teamMembers.role,
          revenue_share_pct: schema.teamMembers.revenueSharePct,
          joined_via: schema.teamMembers.joinedVia,
          status: schema.teamMembers.status,
          joined_at: schema.teamMembers.joinedAt,
          agent_name: schema.agents.name,
          agent_display_name: schema.agents.displayName,
          agent_avatar_url: schema.agents.avatarUrl,
          reputation_score: schema.agents.reputationScore,
        })
        .from(schema.teamMembers)
        .leftJoin(schema.agents, eq(schema.teamMembers.agentId, schema.agents.id))
        .where(eq(schema.teamMembers.teamId, team.id));

      return { ...team, members };
    }));

    return ok(reply, enriched);
  });

  // POST /api/v1/hackathons/:id/teams
  fastify.post("/api/v1/hackathons/:id/teams", async (req, reply) => {
    const agent = await authFastify(req);
    if (!agent) return unauthorized(reply);

    const { id: hackathonId } = req.params as { id: string };
    const [hackathon] = await getDb()
      .select({ status: schema.hackathons.status })
      .from(schema.hackathons)
      .where(eq(schema.hackathons.id, hackathonId))
      .limit(1);
    if (!hackathon) return notFound(reply, "Hackathon");
    if (toPublicHackathonStatus(hackathon.status) !== "open") return fail(reply, "Hackathon is not open for registration", 400);

    const body = req.body as Record<string, unknown> || {};
    const { team, existed } = await createSingleAgentTeam({
      hackathonId,
      agent,
      name: typeof body.name === "string" ? body.name : undefined,
      color: typeof body.color === "string" ? body.color : undefined,
      wallet: typeof body.wallet === "string" ? body.wallet : typeof body.wallet_address === "string" ? body.wallet_address : undefined,
      txHash: typeof body.tx_hash === "string" ? body.tx_hash : undefined,
    });
    if (!team) return fail(reply, "Failed to create participant team", 500);

    return created(reply, {
      team,
      message: existed ? "You were already registered for this hackathon." : "Participant team created. Teams are single-agent in the MVP.",
    });
  });

  // POST /api/v1/hackathons/:id/teams/:teamId/join — disabled in single-agent MVP
  fastify.post("/api/v1/hackathons/:id/teams/:teamId/join", async (req, reply) => {
    const agent = await authFastify(req);
    if (!agent) return unauthorized(reply);
    return fail(reply, "Team joining is disabled in the MVP. Each hackathon entry is a single-agent team.", 410, "Use POST /api/v1/hackathons/:id/join instead.");
  });

  // PATCH /api/v1/hackathons/:id
  fastify.patch("/api/v1/hackathons/:id", async (req, reply) => {
    const agent = await authFastify(req);
    if (!agent) return unauthorized(reply);

    const { id } = req.params as { id: string };
    const db = getDb();

    const [hackathon] = await db.select(hackathonSelect).from(schema.hackathons).where(eq(schema.hackathons.id, id)).limit(1);

    if (!hackathon) return notFound(reply, "Hackathon");
    if (hackathon.created_by !== agent.id) {
      return fail(reply, "Only the hackathon creator can update it", 403);
    }

    const body = req.body as Record<string, unknown>;
    const updates: Partial<typeof schema.hackathons.$inferInsert> = { updatedAt: new Date().toISOString() };
    const meta = parseHackathonMeta(hackathon.judging_criteria);

    if (body.title !== undefined) updates.title = body.title as string;
    if (body.description !== undefined) updates.description = body.description as string;
    if (body.brief !== undefined) updates.brief = body.brief as string;
    if (body.rules !== undefined) updates.rules = body.rules as string;
    if (body.starts_at !== undefined) updates.startsAt = body.starts_at as string;
    if (body.ends_at !== undefined) updates.endsAt = body.ends_at as string;
    if (body.entry_fee !== undefined) updates.entryFee = Number(body.entry_fee);
    if (body.prize_pool !== undefined) updates.prizePool = Number(body.prize_pool);
    if (body.max_participants !== undefined) updates.maxParticipants = Number(body.max_participants);

    if (body.status !== undefined) {
      const mappedStatus = toInternalHackathonStatus(body.status as string);
      if (!mappedStatus) return fail(reply, "status must be open, closed, or finalized", 400);
      updates.status = mappedStatus;
    }

    if (body.contract_address !== undefined || body.judging_criteria !== undefined) {
      updates.judgingCriteria = serializeHackathonMeta({
        ...meta,
        chain_id: meta.chain_id ?? getConfiguredChainId(),
        contract_address: body.contract_address !== undefined ? sanitizeString(body.contract_address as string, 128) : meta.contract_address,
        criteria_text: body.judging_criteria !== undefined ? sanitizeString(body.judging_criteria as string, 4000) : meta.criteria_text,
      });
    }

    const [updated] = await db.update(schema.hackathons).set(updates).where(eq(schema.hackathons.id, id)).returning(hackathonSelect);
    if (!updated) return fail(reply, "Update failed", 500);
    return ok(reply, formatHackathon(updated as Record<string, unknown>));
  });

  // GET /api/v1/hackathons/:id/leaderboard
  fastify.get("/api/v1/hackathons/:id/leaderboard", async (req, reply) => {
    const { id: hackathonId } = req.params as { id: string };
    const leaderboard = await loadHackathonLeaderboard(hackathonId);
    if (!leaderboard) return notFound(reply, "Hackathon");
    const prize = await calculatePrizePool(hackathonId);
    return ok(reply, { leaderboard, prize_pool: prize });
  });

  // GET /api/v1/hackathons/:id/judge  (leaderboard alias for backward compat)
  fastify.get("/api/v1/hackathons/:id/judge", async (req, reply) => {
    const { id: hackathonId } = req.params as { id: string };
    const leaderboard = await loadHackathonLeaderboard(hackathonId);
    if (!leaderboard) return notFound(reply, "Hackathon");
    return ok(reply, leaderboard);
  });
}
