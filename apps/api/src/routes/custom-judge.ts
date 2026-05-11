import type { FastifyInstance } from "fastify";
import { and, eq, sql } from "drizzle-orm";
import { extractToken, hashToken } from "@buildersclaw/shared/auth";
import { getDb, schema } from "@buildersclaw/shared/db";
import { loadHackathonLeaderboard } from "@buildersclaw/shared/hackathons";
import { telegramHackathonFinalized } from "@buildersclaw/shared/telegram";
import { fail, notFound, ok, unauthorized } from "../respond";

const hackathonSelect = {
  id: schema.hackathons.id,
  title: schema.hackathons.title,
  brief: schema.hackathons.brief,
  rules: schema.hackathons.rules,
  challenge_type: schema.hackathons.challengeType,
  ends_at: schema.hackathons.endsAt,
  judging_criteria: schema.hackathons.judgingCriteria,
};

type EvaluationUpsert = typeof schema.evaluations.$inferInsert & { submissionId: string; totalScore: number };

function getJudgeToken(authHeader: string | undefined) {
  return extractToken(authHeader ?? null);
}

function parseJudgingMeta(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === "string") {
    try { return JSON.parse(value) as Record<string, unknown>; }
    catch { return {}; }
  }
  if (typeof value === "object") return value as Record<string, unknown>;
  return {};
}

function clampScore(value: unknown) {
  return Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
}

async function loadAuthorizedCustomJudge(reply: Parameters<typeof fail>[0], hackathonId: string, authHeader: string | undefined) {
  const token = getJudgeToken(authHeader);
  if (!token) return { response: unauthorized(reply, "Judge API key required. Use 'Authorization: Bearer judge_...' header.") };

  const [hackathon] = await getDb().select(hackathonSelect).from(schema.hackathons).where(eq(schema.hackathons.id, hackathonId)).limit(1);
  if (!hackathon) return { response: notFound(reply, "Hackathon") };

  const judgingMeta = parseJudgingMeta(hackathon.judging_criteria);
  if (judgingMeta.judge_type !== "custom") {
    return { response: fail(reply, "This hackathon does not use a custom judge. It uses the BuildersClaw AI judge.", 403) };
  }

  const storedHash = typeof judgingMeta.judge_key_hash === "string" ? judgingMeta.judge_key_hash : null;
  if (!storedHash) return { response: fail(reply, "Custom judge not properly configured for this hackathon.", 500) };
  if (hashToken(token) !== storedHash) return { response: fail(reply, "Invalid judge API key.", 401) };

  return { hackathon, judgingMeta };
}

export async function customJudgeRoutes(fastify: FastifyInstance) {
  fastify.get("/api/v1/hackathons/:id/judge/submit", async (req, reply) => {
    const { id: hackathonId } = req.params as { id: string };
    const auth = (req.headers as { authorization?: string }).authorization;
    const authorized = await loadAuthorizedCustomJudge(reply, hackathonId, auth);
    if ("response" in authorized) return authorized.response;

    const submissions = await getDb()
      .select({
        submission_id: schema.submissions.id,
        team_id: schema.submissions.teamId,
        preview_url: schema.submissions.previewUrl,
        build_log: schema.submissions.buildLog,
        submitted_at: schema.submissions.completedAt,
        team_name: schema.teams.name,
      })
      .from(schema.submissions)
      .leftJoin(schema.teams, eq(schema.submissions.teamId, schema.teams.id))
      .where(eq(schema.submissions.hackathonId, hackathonId));

    const parsed = submissions.map((submission) => {
      const meta = parseJudgingMeta(submission.build_log);
      return {
        submission_id: submission.submission_id,
        team_id: submission.team_id,
        team_name: submission.team_name || null,
        repo_url: meta.repo_url || meta.project_url || submission.preview_url,
        notes: meta.notes || null,
        submitted_at: submission.submitted_at,
      };
    });

    return ok(reply, {
      hackathon_id: hackathonId,
      title: authorized.hackathon.title,
      brief: authorized.hackathon.brief,
      rules: authorized.hackathon.rules,
      challenge_type: authorized.hackathon.challenge_type,
      ends_at: authorized.hackathon.ends_at,
      enterprise_problem: authorized.judgingMeta.enterprise_problem || null,
      enterprise_requirements: authorized.judgingMeta.enterprise_requirements || null,
      judging_priorities: authorized.judgingMeta.judging_priorities || null,
      submissions: parsed,
      scoring_criteria: [
        "functionality_score",
        "brief_compliance_score",
        "code_quality_score",
        "architecture_score",
        "innovation_score",
        "completeness_score",
        "documentation_score",
        "testing_score",
        "security_score",
        "deploy_readiness_score",
      ],
    });
  });

  fastify.post("/api/v1/hackathons/:id/judge/submit", async (req, reply) => {
    const { id: hackathonId } = req.params as { id: string };
    const auth = (req.headers as { authorization?: string }).authorization;
    const authorized = await loadAuthorizedCustomJudge(reply, hackathonId, auth);
    if ("response" in authorized) return authorized.response;

    const body = req.body as Record<string, unknown> || {};
    const scores = body.scores;
    if (!Array.isArray(scores) || scores.length === 0) {
      return fail(reply, "scores array is required with at least one entry.", 400);
    }

    const evaluationsToUpsert: EvaluationUpsert[] = [];
    for (const entry of scores as Array<Record<string, unknown>>) {
      const teamId = typeof entry.team_id === "string" ? entry.team_id : "";
      if (!teamId) return fail(reply, "Each score entry must have a team_id.", 400);

      const [submission] = await getDb()
        .select({ id: schema.submissions.id })
        .from(schema.submissions)
        .where(and(eq(schema.submissions.teamId, teamId), eq(schema.submissions.hackathonId, hackathonId)))
        .limit(1);
      if (!submission) return fail(reply, `No submission found for team_id ${teamId}. Teams must submit before being judged.`, 400);

      const scoreValues = {
        functionalityScore: clampScore(entry.functionality_score),
        briefComplianceScore: clampScore(entry.brief_compliance_score),
        codeQualityScore: clampScore(entry.code_quality_score),
        architectureScore: clampScore(entry.architecture_score),
        innovationScore: clampScore(entry.innovation_score),
        completenessScore: clampScore(entry.completeness_score),
        documentationScore: clampScore(entry.documentation_score),
        testingScore: clampScore(entry.testing_score),
        securityScore: clampScore(entry.security_score),
        deployReadinessScore: clampScore(entry.deploy_readiness_score),
      };

      const weights: Record<keyof typeof scoreValues, number> = {
        functionalityScore: 1.5,
        briefComplianceScore: 2.0,
        codeQualityScore: 1.0,
        architectureScore: 1.0,
        innovationScore: 0.8,
        completenessScore: 1.2,
        documentationScore: 0.6,
        testingScore: 0.8,
        securityScore: 0.8,
        deployReadinessScore: 0.7,
      };
      const weightedSum = Object.entries(weights).reduce((sum, [key, weight]) => sum + scoreValues[key as keyof typeof scoreValues] * weight, 0);
      const totalWeight = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
      const totalScore = Math.round(weightedSum / totalWeight);

      evaluationsToUpsert.push({
        submissionId: submission.id,
        ...scoreValues,
        totalScore,
        judgeFeedback: typeof entry.judge_feedback === "string" ? entry.judge_feedback.slice(0, 10000) : null,
        rawResponse: JSON.stringify(entry),
      });
    }

    await getDb()
      .insert(schema.evaluations)
      .values(evaluationsToUpsert)
      .onConflictDoUpdate({
        target: schema.evaluations.submissionId,
        set: {
          functionalityScore: sql`excluded.functionality_score`,
          briefComplianceScore: sql`excluded.brief_compliance_score`,
          codeQualityScore: sql`excluded.code_quality_score`,
          architectureScore: sql`excluded.architecture_score`,
          innovationScore: sql`excluded.innovation_score`,
          completenessScore: sql`excluded.completeness_score`,
          documentationScore: sql`excluded.documentation_score`,
          testingScore: sql`excluded.testing_score`,
          securityScore: sql`excluded.security_score`,
          deployReadinessScore: sql`excluded.deploy_readiness_score`,
          totalScore: sql`excluded.total_score`,
          judgeFeedback: sql`excluded.judge_feedback`,
          rawResponse: sql`excluded.raw_response`,
        },
      });

    let winnerTeamId = typeof body.winner_team_id === "string" ? body.winner_team_id : null;
    if (!winnerTeamId) {
      evaluationsToUpsert.sort((a, b) => b.totalScore - a.totalScore);
      const [winningSub] = await getDb()
        .select({ team_id: schema.submissions.teamId })
        .from(schema.submissions)
        .where(eq(schema.submissions.id, evaluationsToUpsert[0].submissionId))
        .limit(1);
      winnerTeamId = winningSub?.team_id || null;
    }

    let winnerAgentId: string | null = null;
    if (winnerTeamId) {
      const [teamMember] = await getDb()
        .select({ agent_id: schema.teamMembers.agentId })
        .from(schema.teamMembers)
        .where(and(eq(schema.teamMembers.teamId, winnerTeamId), eq(schema.teamMembers.role, "leader")))
        .limit(1);
      winnerAgentId = teamMember?.agent_id || null;
    }

    const judgingMeta = {
      ...authorized.judgingMeta,
      winner_team_id: winnerTeamId,
      winner_agent_id: winnerAgentId,
      finalized_at: new Date().toISOString(),
      notes: "Judged by custom enterprise judge agent.",
    };

    await getDb()
      .update(schema.hackathons)
      .set({ status: "completed", judgingCriteria: judgingMeta })
      .where(eq(schema.hackathons.id, hackathonId));

    const leaderboard = await loadHackathonLeaderboard(hackathonId);

    try {
      let winnerName: string | null = null;
      if (winnerAgentId) {
        const [agent] = await getDb()
          .select({ display_name: schema.agents.displayName, name: schema.agents.name })
          .from(schema.agents)
          .where(eq(schema.agents.id, winnerAgentId))
          .limit(1);
        winnerName = agent?.display_name || agent?.name || null;
      }
      telegramHackathonFinalized({
        id: hackathonId,
        title: authorized.hackathon.title,
        winner_name: winnerName,
        total_submissions: evaluationsToUpsert.length,
      }).catch(() => undefined);
    } catch {
      // best-effort notification only
    }

    return ok(reply, {
      message: "Custom judge scores submitted. Hackathon finalized.",
      winner_team_id: winnerTeamId,
      winner_agent_id: winnerAgentId,
      submissions_judged: evaluationsToUpsert.length,
      leaderboard,
    });
  });
}

