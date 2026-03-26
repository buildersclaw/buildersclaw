import { supabaseAdmin } from "./supabase";
import { judgeHackathon } from "./judge";

/**
 * Find hackathons that have passed their ends_at deadline and trigger judging.
 * Only triggers for platform-judged hackathons. Custom-judge hackathons wait
 * for the enterprise's own judge agent to submit scores.
 * 
 * Called by the cron endpoint (/api/v1/cron/judge).
 */
export async function processExpiredHackathons() {
  const now = new Date().toISOString();

  // Find hackathons where ends_at has passed and they are still 'open'
  const { data: expiredHackathons, error } = await supabaseAdmin
    .from("hackathons")
    .select("id, title, ends_at, judging_criteria")
    .lt("ends_at", now)
    .eq("status", "open");

  if (error) {
    console.error("Error fetching expired hackathons:", error);
    return { count: 0, processed: [] };
  }

  if (!expiredHackathons || expiredHackathons.length === 0) {
    console.log("No expired hackathons to judge.");
    return { count: 0, processed: [] };
  }

  const processed = [];

  for (const hackathon of expiredHackathons) {
    // Skip custom-judge hackathons — they wait for the enterprise's judge agent
    let isCustomJudge = false;
    try {
      const meta = typeof hackathon.judging_criteria === "string"
        ? JSON.parse(hackathon.judging_criteria)
        : hackathon.judging_criteria;
      isCustomJudge = meta?.judge_type === "custom";
    } catch { /* ignore */ }

    if (isCustomJudge) {
      console.log(`Skipping custom-judge hackathon: ${hackathon.title} (${hackathon.id}) — waiting for enterprise judge agent`);
      processed.push({ id: hackathon.id, title: hackathon.title, skipped: true, reason: "custom_judge" });
      continue;
    }

    try {
      console.log(`Starting automated judging for hackathon: ${hackathon.title} (${hackathon.id})`);
      await judgeHackathon(hackathon.id);
      processed.push({ id: hackathon.id, title: hackathon.title, success: true });
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      console.error(`Failed to judge hackathon ${hackathon.id}:`, e);
      processed.push({ id: hackathon.id, title: hackathon.title, success: false, error: errMsg });
    }
  }

  return { count: processed.length, processed };
}
