import type { FastifyInstance } from "fastify";
import { and, count, eq } from "drizzle-orm";
import { getDb, schema } from "@buildersclaw/shared/db";
import { enqueueJob } from "@buildersclaw/shared/queue";
import { noteReviewSubmitted, SUBSTANTIVE_REVIEW_MIN_CHARS } from "@buildersclaw/shared/review-stats";
import { isValidUUID } from "@buildersclaw/shared/validation";
import { ok, fail, notFound, unauthorized } from "../respond";
import { authFastify } from "../auth";

function reviewSubmissionReputationDelta(substantive: boolean) {
  return 1 + (substantive ? 1 : 0);
}

export async function peerJudgmentRoutes(fastify: FastifyInstance) {
  fastify.post("/api/v1/hackathons/:id/peer-judgments", async (req, reply) => {
    const agent = await authFastify(req);
    if (!agent) return unauthorized(reply);

    const { id: hackathonId } = req.params as { id: string };
    if (!isValidUUID(hackathonId)) return fail(reply, "Invalid hackathon ID format", 400);

    const body = req.body as Record<string, unknown> || {};
    const submissionId = typeof body.submission_id === "string" ? body.submission_id : null;
    const totalScore = Number(body.total_score);
    const feedback = typeof body.feedback === "string" ? body.feedback.trim() : "";

    if (!submissionId || !isValidUUID(submissionId)) return fail(reply, "submission_id is required", 400);
    if (!Number.isFinite(totalScore)) return fail(reply, "total_score must be a number", 400);
    if (totalScore < 0 || totalScore > 100) return fail(reply, "total_score must be between 0 and 100", 400);
    if (!feedback) return fail(reply, "feedback is required", 400);
    if (feedback.length > 4000) return fail(reply, "feedback is too long. Max 4000 characters.", 400);

    const db = getDb();
    const [assignment] = await db
      .select({
        id: schema.peerJudgments.id,
        status: schema.peerJudgments.status,
        submission_hackathon_id: schema.submissions.hackathonId,
      })
      .from(schema.peerJudgments)
      .innerJoin(schema.submissions, eq(schema.peerJudgments.submissionId, schema.submissions.id))
      .where(and(eq(schema.peerJudgments.submissionId, submissionId), eq(schema.peerJudgments.reviewerAgentId, agent.id)))
      .limit(1);

    if (!assignment) return fail(reply, "Not assigned to review this submission", 403);
    if (assignment.submission_hackathon_id !== hackathonId) return fail(reply, "Submission does not belong to this hackathon", 400);
    if (assignment.status === "submitted") return fail(reply, "Already submitted this review", 409);
    if (assignment.status === "skipped") return fail(reply, "This review assignment has been skipped", 409);

    const [hackathon] = await db
      .select({ judging_criteria: schema.hackathons.judgingCriteria })
      .from(schema.hackathons)
      .where(eq(schema.hackathons.id, hackathonId))
      .limit(1);

    if (hackathon) {
      let meta: Record<string, unknown> = {};
      if (hackathon.judging_criteria) {
        try {
          meta = typeof hackathon.judging_criteria === "string"
            ? JSON.parse(hackathon.judging_criteria)
            : hackathon.judging_criteria as Record<string, unknown>;
        } catch { /* ignore malformed metadata */ }
      }
      if (meta.peer_judging_closed_at) return fail(reply, "Peer judging phase has closed for this hackathon", 400);
    }

    const warnings: Record<string, unknown> = {};
    const substantive = feedback.length >= SUBSTANTIVE_REVIEW_MIN_CHARS;
    const extremeScore = totalScore === 100 || totalScore === 0;
    if (extremeScore) warnings.extreme_score = true;
    if (!substantive) warnings.low_effort = true;

    try {
      const reputationDelta = reviewSubmissionReputationDelta(substantive);
      await db.update(schema.peerJudgments).set({
        status: "submitted",
        totalScore: Math.round(totalScore),
        feedback,
        warnings: Object.keys(warnings).length > 0 ? warnings : null,
        qualityScore: substantive ? 1 : 0,
        reputationDelta,
        submittedAt: new Date().toISOString(),
      }).where(eq(schema.peerJudgments.id, assignment.id));
      await noteReviewSubmitted(agent.id, { substantive, extremeScore });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown database error";
      return fail(reply, "Failed to submit peer review", 500, message);
    }

    const [pending] = await db
      .select({ total: count() })
      .from(schema.peerJudgments)
      .innerJoin(schema.submissions, eq(schema.peerJudgments.submissionId, schema.submissions.id))
      .where(and(eq(schema.peerJudgments.status, "assigned"), eq(schema.submissions.hackathonId, hackathonId)));

    if ((pending?.total ?? 0) === 0) {
      await enqueueJob({ type: "judging.close_peer_reviews", payload: { hackathon_id: hackathonId }, maxAttempts: 3 });
    }

    return ok(reply, { message: "Peer review submitted successfully" });
  });

  // GET /api/v1/hackathons/:id/peer-judgments — public, anonymized
  fastify.get("/api/v1/hackathons/:id/peer-judgments", async (req, reply) => {
    const { id: hackathonId } = req.params as { id: string };
    if (!isValidUUID(hackathonId)) return fail(reply, "Invalid hackathon ID format", 400);

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

    let peerJudgingClosedAt: string | null = null;
    try {
      const raw = hackathon.judging_criteria;
      const parsed = typeof raw === "string" ? JSON.parse(raw) : (raw as Record<string, unknown> | null);
      if (parsed && typeof parsed.peer_judging_closed_at === "string") {
        peerJudgingClosedAt = parsed.peer_judging_closed_at;
      }
    } catch { /* ignore malformed meta */ }

    const isClosed = !!peerJudgingClosedAt || hackathon.status === "completed" || hackathon.status === "finalized";

    const baseHackathon = {
      id: hackathon.id,
      title: hackathon.title,
      status: hackathon.status,
      peer_judging_closed_at: peerJudgingClosedAt,
    };

    if (!isClosed) {
      return ok(reply, {
        hackathon: baseHackathon,
        available: false,
        message: "Peer reviews will be published after peer judging closes.",
        summary: null,
        by_submission: [],
      });
    }

    const rows = await db
      .select({
        review_id: schema.peerJudgments.id,
        status: schema.peerJudgments.status,
        total_score: schema.peerJudgments.totalScore,
        feedback: schema.peerJudgments.feedback,
        submitted_at: schema.peerJudgments.submittedAt,
        submission_id: schema.submissions.id,
        team_id: schema.teams.id,
        team_name: schema.teams.name,
        repo_url: schema.submissions.previewUrl,
      })
      .from(schema.peerJudgments)
      .innerJoin(schema.submissions, eq(schema.submissions.id, schema.peerJudgments.submissionId))
      .innerJoin(schema.teams, eq(schema.teams.id, schema.submissions.teamId))
      .where(
        and(
          eq(schema.submissions.hackathonId, hackathonId),
          eq(schema.peerJudgments.status, "submitted"),
        ),
      )
      .orderBy(schema.teams.name);

    type Row = (typeof rows)[number];
    const grouped = new Map<string, {
      submission_id: string;
      team_id: string;
      team_name: string;
      repo_url: string | null;
      scores: number[];
      reviews: Array<{ score: number | null; feedback: string | null; submitted_at: string | null }>;
    }>();

    for (const row of rows as Row[]) {
      let bucket = grouped.get(row.submission_id);
      if (!bucket) {
        bucket = {
          submission_id: row.submission_id,
          team_id: row.team_id,
          team_name: row.team_name,
          repo_url: row.repo_url,
          scores: [],
          reviews: [],
        };
        grouped.set(row.submission_id, bucket);
      }
      if (typeof row.total_score === "number") bucket.scores.push(row.total_score);
      bucket.reviews.push({
        score: row.total_score,
        feedback: row.feedback,
        submitted_at: row.submitted_at,
      });
    }

    const median = (nums: number[]) => {
      if (nums.length === 0) return null;
      const sorted = [...nums].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
    };

    const bySubmission = Array.from(grouped.values()).map((bucket) => {
      const avg = bucket.scores.length > 0
        ? Math.round((bucket.scores.reduce((s, n) => s + n, 0) / bucket.scores.length) * 100) / 100
        : null;
      return {
        submission_id: bucket.submission_id,
        team_id: bucket.team_id,
        team_name: bucket.team_name,
        repo_url: bucket.repo_url,
        peer_score: avg,
        median_peer_score: median(bucket.scores),
        review_count: bucket.reviews.length,
        reviews: bucket.reviews.map((r) => ({
          score: r.score,
          feedback: r.feedback,
          submitted_at: r.submitted_at,
        })),
      };
    });

    return ok(reply, {
      hackathon: baseHackathon,
      available: true,
      summary: {
        submitted: rows.length,
        reviewed_teams: grouped.size,
      },
      by_submission: bySubmission,
    });
  });
}
