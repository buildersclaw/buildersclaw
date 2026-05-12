import { sql } from "drizzle-orm";
import { getDb } from "./db";

export const SUBSTANTIVE_REVIEW_MIN_CHARS = 300;
export const ACCURATE_REVIEW_DELTA = 15;

export async function noteReviewAssigned(agentId: string) {
  await getDb().execute(sql`
    insert into agent_review_stats (agent_id, assigned_count, updated_at)
    values (${agentId}, 1, now())
    on conflict (agent_id) do update
    set assigned_count = agent_review_stats.assigned_count + 1,
        updated_at = now()
  `);
}

export async function noteReviewSubmitted(agentId: string, opts: {
  substantive: boolean;
  extremeScore: boolean;
}) {
  const reputationDelta = 1 + (opts.substantive ? 1 : 0);
  await getDb().execute(sql`
    insert into agent_review_stats (
      agent_id,
      reputation_score,
      submitted_count,
      on_time_count,
      substantive_count,
      low_effort_count,
      extreme_score_count,
      last_reviewed_at,
      updated_at
    )
    values (
      ${agentId},
      ${reputationDelta},
      1,
      1,
      ${opts.substantive ? 1 : 0},
      ${opts.substantive ? 0 : 1},
      ${opts.extremeScore ? 1 : 0},
      now(),
      now()
    )
    on conflict (agent_id) do update
    set reputation_score = agent_review_stats.reputation_score + ${reputationDelta},
        submitted_count = agent_review_stats.submitted_count + 1,
        on_time_count = agent_review_stats.on_time_count + 1,
        substantive_count = agent_review_stats.substantive_count + ${opts.substantive ? 1 : 0},
        low_effort_count = agent_review_stats.low_effort_count + ${opts.substantive ? 0 : 1},
        extreme_score_count = agent_review_stats.extreme_score_count + ${opts.extremeScore ? 1 : 0},
        last_reviewed_at = now(),
        updated_at = now()
  `);
  return reputationDelta;
}

export async function noteReviewMissed(agentId: string) {
  await getDb().execute(sql`
    insert into agent_review_stats (agent_id, reputation_score, missed_count, updated_at)
    values (${agentId}, -1, 1, now())
    on conflict (agent_id) do update
    set reputation_score = agent_review_stats.reputation_score - 1,
        missed_count = agent_review_stats.missed_count + 1,
        updated_at = now()
  `);
  return -1;
}

export async function noteReviewAccuracy(agentId: string, accuracyDelta: number) {
  const roundedDelta = Math.round(Math.abs(accuracyDelta));
  const accurate = roundedDelta <= ACCURATE_REVIEW_DELTA;
  const reputationDelta = 0;

  await getDb().execute(sql`
    insert into agent_review_stats (
      agent_id,
      reputation_score,
      accurate_count,
      scored_count,
      accuracy_avg,
      updated_at
    )
    values (${agentId}, ${reputationDelta}, ${accurate ? 1 : 0}, 1, ${roundedDelta}, now())
    on conflict (agent_id) do update
    set reputation_score = agent_review_stats.reputation_score + ${reputationDelta},
        accurate_count = agent_review_stats.accurate_count + ${accurate ? 1 : 0},
        scored_count = agent_review_stats.scored_count + 1,
        accuracy_avg = ((agent_review_stats.accuracy_avg * agent_review_stats.scored_count) + ${roundedDelta}) / (agent_review_stats.scored_count + 1),
        updated_at = now()
  `);

  return { accuracyDelta: roundedDelta, reputationDelta, accurate };
}
