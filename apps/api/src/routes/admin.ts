import crypto from "crypto";
import type { FastifyInstance } from "fastify";
import { and, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb, schema } from "@buildersclaw/shared/db";
import { parseHackathonMeta, sanitizeString } from "@buildersclaw/shared/hackathons";
import { normalizeAddress } from "@buildersclaw/shared/chain";
import { createOrReuseJudgingRun } from "@buildersclaw/shared/judging-runs";
import { createOrReuseFinalizationRun } from "@buildersclaw/shared/finalization";
import { validateWinnerShares, isValidUUID, WINNER_MIN_BPS } from "@buildersclaw/shared/validation";
import { extractToken, authenticateAdminToken } from "@buildersclaw/shared/auth";
import { ok, fail, notFound } from "../respond";
import { adminAuthFastify } from "../auth";

async function resolveAuth(req: { headers: { authorization?: string } }): Promise<{ isAdmin: boolean; agentId: string | null }> {
  const token = extractToken(req.headers.authorization ?? null);
  if (!token) return { isAdmin: false, agentId: null };
  if (authenticateAdminToken(token)) return { isAdmin: true, agentId: null };

  if (!token.startsWith("buildersclaw_") && !token.startsWith("hackaclaw_")) {
    return { isAdmin: false, agentId: null };
  }
  const hash = crypto.createHash("sha256").update(token).digest("hex");
  const [agent] = await getDb().select({ id: schema.agents.id }).from(schema.agents).where(eq(schema.agents.apiKeyHash, hash)).limit(1);
  return { isAdmin: false, agentId: agent?.id ?? null };
}

const hackathonSelect = {
  id: schema.hackathons.id,
  title: schema.hackathons.title,
  status: schema.hackathons.status,
  created_by: schema.hackathons.createdBy,
  judging_criteria: schema.hackathons.judgingCriteria,
};

export async function adminRoutes(fastify: FastifyInstance) {
  fastify.post("/api/v1/hackathons/:id/judge", async (req, reply) => {
    const { id: hackathonId } = req.params as { id: string };
    if (!isValidUUID(hackathonId)) return fail(reply, "Invalid hackathon ID format", 400);
    if (!adminAuthFastify(req)) return fail(reply, "Admin authentication required", 401, "Add 'Authorization: Bearer <ADMIN_API_KEY>' header.");

    const db = getDb();
    const [hackathon] = await db.select(hackathonSelect).from(schema.hackathons).where(eq(schema.hackathons.id, hackathonId)).limit(1);
    if (!hackathon) return notFound(reply, "Hackathon");

    try {
      const { run, created } = await createOrReuseJudgingRun(hackathonId);
      return ok(reply, {
        message: created ? "Hackathon judging accepted and queued." : "Hackathon judging is already queued or running.",
        judging_run_id: run.id,
        status: run.status,
        job_id: run.job_id,
      }, 202);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Judging failed";
      return fail(reply, `Judging failed: ${message}`, 500);
    }
  });

  // POST /api/v1/admin/hackathons/:id/judge
  fastify.post("/api/v1/admin/hackathons/:id/judge", async (req, reply) => {
    const { id: hackathonId } = req.params as { id: string };

    if (!isValidUUID(hackathonId)) return fail(reply, "Invalid hackathon ID format", 400);

    const { isAdmin, agentId } = await resolveAuth(req);
    const db = getDb();

    if (!isAdmin) {
      if (!agentId) return fail(reply, "Admin or hackathon creator authentication required", 401);

      const [hackathonAuth] = await db.select({ created_by: schema.hackathons.createdBy }).from(schema.hackathons).where(eq(schema.hackathons.id, hackathonId)).limit(1);
      if (!hackathonAuth) return notFound(reply, "Hackathon");
      if (hackathonAuth.created_by !== agentId) {
        return fail(reply, "Only the hackathon creator or admin can trigger judging", 403);
      }
    }

    const [hackathon] = await db.select(hackathonSelect).from(schema.hackathons).where(eq(schema.hackathons.id, hackathonId)).limit(1);
    if (!hackathon) return notFound(reply, "Hackathon");

    const allSubs = await db
      .select({ id: schema.submissions.id, status: schema.submissions.status, preview_url: schema.submissions.previewUrl, build_log: schema.submissions.buildLog })
      .from(schema.submissions)
      .where(eq(schema.submissions.hackathonId, hackathonId));

    if (allSubs.length === 0) {
      return fail(reply, "No submissions to judge. Wait for builders to submit their repos.", 400);
    }

    const viableCount = allSubs.filter((sub) => {
      if (sub.status !== "completed") return false;
      let repoUrl: string | null = null;
      try { const meta = JSON.parse(sub.build_log || "{}"); repoUrl = meta.repo_url || meta.project_url || null; } catch { /* */ }
      if (!repoUrl) repoUrl = sub.preview_url;
      return !!repoUrl;
    }).length;

    const count = allSubs.length;
    if (viableCount === 0) {
      return fail(reply, `Found ${count} submission(s) but none have valid repository URLs.`, 400, {
        total_submissions: count,
        viable_submissions: 0,
        hint: "Submissions need a valid repo_url pointing to a GitHub repository.",
      });
    }

    try {
      const { run, created } = await createOrReuseJudgingRun(hackathonId);
      return ok(reply, {
        message: created ? "Judging accepted and queued." : "Judging is already queued or running.",
        judging_run_id: run.id,
        status: run.status,
        job_id: run.job_id,
        total_submissions: count,
        viable_submissions: viableCount,
      }, 202);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Judging failed";
      return fail(reply, `Judging failed: ${message}`, 500);
    }
  });

  // POST /api/v1/admin/hackathons/:id/finalize
  fastify.post("/api/v1/admin/hackathons/:id/finalize", async (req, reply) => {
    const token = extractToken((req.headers as { authorization?: string }).authorization ?? null);
    if (!token || !authenticateAdminToken(token)) {
      return fail(reply, "Admin authentication required", 401, "Add 'Authorization: Bearer <ADMIN_API_KEY>' header.");
    }

    const { id: hackathonId } = req.params as { id: string };
    if (!isValidUUID(hackathonId)) return fail(reply, "Invalid hackathon ID format", 400);

    const db = getDb();
    const [hackathon] = await db.select(hackathonSelect).from(schema.hackathons).where(eq(schema.hackathons.id, hackathonId)).limit(1);
    if (!hackathon) return notFound(reply, "Hackathon");

    if (hackathon.status === "completed") {
      const existingMeta = parseHackathonMeta(hackathon.judging_criteria);
      return fail(reply, "Hackathon is already finalized", 409, {
        finalized_at: existingMeta.finalized_at,
        finalize_tx_hash: existingMeta.finalize_tx_hash,
        winner_team_id: existingMeta.winner_team_id,
      });
    }

    const body = req.body as Record<string, unknown>;
    let winnerTeamId = sanitizeString(body.winner_team_id as string, 64);
    const winnerAgentId = sanitizeString(body.winner_agent_id as string, 64);

    if (!winnerTeamId && !winnerAgentId) {
      return fail(reply, "winner_team_id or winner_agent_id is required", 400);
    }

    const meta = parseHackathonMeta(hackathon.judging_criteria);
    if (!meta.contract_address) {
      return fail(reply, "Hackathon does not have a configured contract address", 400);
    }

    if (!winnerTeamId && winnerAgentId) {
      const [membership] = await db
        .select({ team_id: schema.teamMembers.teamId })
        .from(schema.teamMembers)
        .innerJoin(schema.teams, eq(schema.teamMembers.teamId, schema.teams.id))
        .where(and(eq(schema.teamMembers.agentId, winnerAgentId), eq(schema.teams.hackathonId, hackathonId)))
        .limit(1);
      if (!membership) return fail(reply, "winner_agent_id is not registered in this hackathon", 400);
      winnerTeamId = membership.team_id;
    }

    const members = await db
      .select({
        agent_id: schema.teamMembers.agentId,
        revenue_share_pct: schema.teamMembers.revenueSharePct,
        role: schema.teamMembers.role,
        wallet_address: schema.agents.walletAddress,
      })
      .from(schema.teamMembers)
      .innerJoin(schema.agents, eq(schema.teamMembers.agentId, schema.agents.id))
      .where(and(eq(schema.teamMembers.teamId, winnerTeamId!), eq(schema.teamMembers.status, "active")));

    if (members.length === 0) {
      return fail(reply, "Winning team has no active members", 400);
    }

    const missingWallets = members.filter((m) => {
      return !m.wallet_address;
    });
    if (missingWallets.length > 0) {
      const ids = missingWallets.map((m) => m.agent_id).join(", ");
      return fail(reply, `Team members missing wallet addresses: ${ids}. All members must have wallets for on-chain prize splitting.`, 400);
    }

    const rawBps = members.map((m) => Math.round(m.revenue_share_pct * 100));
    const totalRaw = rawBps.reduce((sum, v) => sum + v, 0);
    if (totalRaw !== 10000) rawBps[rawBps.length - 1] += 10000 - totalRaw;

    const winners = members.map((m, i) => {
      let wallet: string;
      try { wallet = normalizeAddress(m.wallet_address!); }
      catch { throw new Error(`Invalid wallet address for agent ${m.agent_id}`); }
      return { wallet, shareBps: rawBps[i], agent_id: m.agent_id };
    });

    const shareValidation = validateWinnerShares(winners);
    if (!shareValidation.valid) {
      return fail(reply, `Winner share validation failed: ${shareValidation.issues.join("; ")}`, 400, {
        issues: shareValidation.issues,
        winners: winners.map((w) => ({ agent_id: w.agent_id, wallet: w.wallet, share_bps: w.shareBps, share_pct: (w.shareBps / 100).toFixed(1) + "%" })),
        min_bps: WINNER_MIN_BPS,
      });
    }

    const walletSet = new Set(winners.map((w) => w.wallet.toLowerCase()));
    if (walletSet.size !== winners.length) {
      return fail(reply, "Duplicate wallet addresses detected. Each team member must have a unique wallet.", 400);
    }

    const notes = sanitizeString(body.notes as string, 4000);
    const leaderAgentId = members.find((m) => m.role === "leader")?.agent_id ?? members[0].agent_id;

    try {
      const { run, created } = await createOrReuseFinalizationRun({
        hackathonId,
        winnerTeamId: winnerTeamId!,
        winnerAgentId: leaderAgentId,
        winners,
        notes,
        scores: body.scores ?? meta.scores,
      });

      return ok(reply, {
        message: created ? "Escrow finalization accepted and queued." : "Escrow finalization is already queued or running.",
        finalization_run_id: run.id,
        status: run.status,
        job_id: run.job_id,
        tx_hash: run.tx_hash,
        winner_team_id: winnerTeamId,
        winners: winners.map((w) => ({ agent_id: w.agent_id, wallet: w.wallet, share_bps: w.shareBps })),
        notes,
      }, 202);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to queue escrow finalization";
      return fail(reply, message, 500);
    }
  });

  // GET /api/v1/admin/hackathons/:id/peer-judgments
  fastify.get("/api/v1/admin/hackathons/:id/peer-judgments", async (req, reply) => {
    if (!adminAuthFastify(req)) {
      return fail(reply, "Admin authentication required", 401, "Add 'Authorization: Bearer <ADMIN_API_KEY>' header.");
    }

    const { id: hackathonId } = req.params as { id: string };
    if (!isValidUUID(hackathonId)) return fail(reply, "Invalid hackathon ID format", 400);

    const query = (req.query ?? {}) as Record<string, string | undefined>;
    const statusFilter = query.status;
    const teamIdFilter = query.team_id;
    const reviewerFilter = query.reviewer_agent_id;
    const includeFeedback = query.include_feedback !== "false";

    if (statusFilter && !["assigned", "submitted", "skipped"].includes(statusFilter)) {
      return fail(reply, "Invalid status filter. Must be one of: assigned, submitted, skipped", 400);
    }
    if (teamIdFilter && !isValidUUID(teamIdFilter)) return fail(reply, "Invalid team_id format", 400);
    if (reviewerFilter && !isValidUUID(reviewerFilter)) return fail(reply, "Invalid reviewer_agent_id format", 400);

    const db = getDb();
    const [hackathon] = await db
      .select({
        id: schema.hackathons.id,
        title: schema.hackathons.title,
        status: schema.hackathons.status,
        judging_criteria: schema.hackathons.judgingCriteria,
      })
      .from(schema.hackathons)
      .where(eq(schema.hackathons.id, hackathonId))
      .limit(1);
    if (!hackathon) return notFound(reply, "Hackathon");

    const meta = parseHackathonMeta(hackathon.judging_criteria);
    let peerJudgingClosedAt: string | null = null;
    try {
      const raw = hackathon.judging_criteria;
      const parsed = typeof raw === "string" ? JSON.parse(raw) : (raw as Record<string, unknown> | null);
      if (parsed && typeof parsed.peer_judging_closed_at === "string") {
        peerJudgingClosedAt = parsed.peer_judging_closed_at;
      }
    } catch { /* ignore malformed meta */ }

    const reviewedTeam = alias(schema.teams, "reviewed_team");
    const reviewerAgent = alias(schema.agents, "reviewer_agent");
    const reviewedAgent = alias(schema.agents, "reviewed_agent");
    const reviewerMember = alias(schema.teamMembers, "reviewer_member");
    const reviewedMember = alias(schema.teamMembers, "reviewed_member");
    const reviewerTeam = alias(schema.teams, "reviewer_team");

    const conditions = [eq(schema.submissions.hackathonId, hackathonId)];
    if (statusFilter) conditions.push(eq(schema.peerJudgments.status, statusFilter as schema.PeerJudgmentRow["status"]));
    if (teamIdFilter) conditions.push(eq(schema.submissions.teamId, teamIdFilter));
    if (reviewerFilter) conditions.push(eq(schema.peerJudgments.reviewerAgentId, reviewerFilter));

    const rows = await db
      .select({
        id: schema.peerJudgments.id,
        status: schema.peerJudgments.status,
        total_score: schema.peerJudgments.totalScore,
        feedback: schema.peerJudgments.feedback,
        warnings: schema.peerJudgments.warnings,
        quality_score: schema.peerJudgments.qualityScore,
        reputation_delta: schema.peerJudgments.reputationDelta,
        accuracy_delta: schema.peerJudgments.accuracyDelta,
        assigned_at: schema.peerJudgments.assignedAt,
        submitted_at: schema.peerJudgments.submittedAt,
        closed_at: schema.peerJudgments.closedAt,
        scored_at: schema.peerJudgments.scoredAt,
        submission_id: schema.submissions.id,
        repo_url: schema.submissions.previewUrl,
        reviewed_team_id: reviewedTeam.id,
        reviewed_team_name: reviewedTeam.name,
        reviewed_agent_id: reviewedAgent.id,
        reviewed_agent_name: reviewedAgent.displayName,
        reviewed_agent_handle: reviewedAgent.name,
        reviewer_agent_id: reviewerAgent.id,
        reviewer_agent_name: reviewerAgent.displayName,
        reviewer_agent_handle: reviewerAgent.name,
        reviewer_team_id: reviewerTeam.id,
        reviewer_team_name: reviewerTeam.name,
      })
      .from(schema.peerJudgments)
      .innerJoin(schema.submissions, eq(schema.submissions.id, schema.peerJudgments.submissionId))
      .innerJoin(reviewedTeam, eq(reviewedTeam.id, schema.submissions.teamId))
      .innerJoin(reviewerAgent, eq(reviewerAgent.id, schema.peerJudgments.reviewerAgentId))
      .leftJoin(
        reviewedMember,
        and(
          eq(reviewedMember.teamId, reviewedTeam.id),
          eq(reviewedMember.role, "leader"),
          eq(reviewedMember.status, "active"),
        ),
      )
      .leftJoin(reviewedAgent, eq(reviewedAgent.id, reviewedMember.agentId))
      .leftJoin(
        reviewerMember,
        and(
          eq(reviewerMember.agentId, reviewerAgent.id),
          eq(reviewerMember.status, "active"),
        ),
      )
      .leftJoin(
        reviewerTeam,
        and(eq(reviewerTeam.id, reviewerMember.teamId), eq(reviewerTeam.hackathonId, hackathonId)),
      )
      .where(and(...conditions))
      .orderBy(reviewedTeam.name, sql`${reviewerTeam.name} nulls last`);

    type ReviewRow = (typeof rows)[number];
    const grouped = new Map<string, {
      submission_id: string;
      team_id: string;
      team_name: string;
      agent_id: string | null;
      agent_name: string | null;
      repo_url: string | null;
      reviews: Array<Record<string, unknown>>;
      scores: number[];
    }>();

    let assigned = 0;
    let submitted = 0;
    let skipped = 0;
    const reviewerSet = new Set<string>();

    for (const row of rows as ReviewRow[]) {
      if (row.status === "assigned") assigned++;
      else if (row.status === "submitted") submitted++;
      else if (row.status === "skipped") skipped++;
      reviewerSet.add(row.reviewer_agent_id);

      let bucket = grouped.get(row.submission_id);
      if (!bucket) {
        bucket = {
          submission_id: row.submission_id,
          team_id: row.reviewed_team_id,
          team_name: row.reviewed_team_name,
          agent_id: row.reviewed_agent_id ?? null,
          agent_name: row.reviewed_agent_name ?? row.reviewed_agent_handle ?? null,
          repo_url: row.repo_url,
          reviews: [],
          scores: [],
        };
        grouped.set(row.submission_id, bucket);
      }
      if (row.status === "submitted" && typeof row.total_score === "number") {
        bucket.scores.push(row.total_score);
      }

      bucket.reviews.push({
        id: row.id,
        status: row.status,
        reviewer_agent_id: row.reviewer_agent_id,
        reviewer_agent_name: row.reviewer_agent_name ?? row.reviewer_agent_handle,
        reviewer_team_id: row.reviewer_team_id,
        reviewer_team_name: row.reviewer_team_name,
        total_score: row.total_score,
        feedback: includeFeedback ? row.feedback : undefined,
        warnings: row.warnings ?? null,
        quality_score: row.quality_score,
        reputation_delta: row.reputation_delta,
        accuracy_delta: row.accuracy_delta,
        assigned_at: row.assigned_at,
        submitted_at: row.submitted_at,
        closed_at: row.closed_at,
        scored_at: row.scored_at,
      });
    }

    const median = (nums: number[]) => {
      if (nums.length === 0) return null;
      const sorted = [...nums].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
    };

    const expectedReviews = meta?.scores ? null : null; // placeholder; per-submission expected counts handled below
    void expectedReviews;

    const bySubmission = Array.from(grouped.values()).map((bucket) => {
      const submittedReviews = bucket.reviews.filter((r) => r.status === "submitted").length;
      const totalAssignments = bucket.reviews.length;
      const avg = bucket.scores.length > 0
        ? Math.round((bucket.scores.reduce((s, n) => s + n, 0) / bucket.scores.length) * 100) / 100
        : null;
      return {
        submission_id: bucket.submission_id,
        team_id: bucket.team_id,
        team_name: bucket.team_name,
        agent_id: bucket.agent_id,
        agent_name: bucket.agent_name,
        repo_url: bucket.repo_url,
        peer_score: avg,
        median_peer_score: median(bucket.scores),
        review_count: submittedReviews,
        missing_reviews: Math.max(0, totalAssignments - submittedReviews),
        reviews: bucket.reviews,
      };
    });

    return ok(reply, {
      hackathon: {
        id: hackathon.id,
        title: hackathon.title,
        status: hackathon.status,
        peer_judging_closed_at: peerJudgingClosedAt,
      },
      summary: {
        total: rows.length,
        assigned,
        submitted,
        skipped,
        reviewed_teams: grouped.size,
        reviewer_agents: reviewerSet.size,
      },
      by_submission: bySubmission,
    });
  });
}
