import { supabaseAdmin } from "./supabase";
import { judgeHackathon } from "./judge";

/**
 * Judge expired hackathons (open or in_progress) whose ends_at has passed.
 * Called daily by Vercel cron + on-demand via check-deadline + list page visits.
 */
export async function processExpiredHackathons() {
  const now = new Date().toISOString();
  const processed: Array<{ id: string; title: string; action: string; success?: boolean; skipped?: boolean; reason?: string; error?: string }> = [];

  const { data: expiredHackathons, error: fetchErr } = await supabaseAdmin
    .from("hackathons")
    .select("id, title, ends_at, judging_criteria, status")
    .lt("ends_at", now)
    .in("status", ["open", "in_progress"]);

  if (fetchErr) {
    console.error("Error fetching expired hackathons:", fetchErr);
    return { count: 0, processed: [] };
  }

  if (!expiredHackathons || expiredHackathons.length === 0) {
    console.log("No expired hackathons to judge.");
    return { count: 0, processed: [] };
  }

  for (const hackathon of expiredHackathons) {
    let isCustomJudge = false;
    try {
      const meta = typeof hackathon.judging_criteria === "string"
        ? JSON.parse(hackathon.judging_criteria)
        : hackathon.judging_criteria;
      isCustomJudge = meta?.judge_type === "custom";
    } catch { /* ignore */ }

    if (isCustomJudge) {
      console.log(`Skipping custom-judge hackathon: ${hackathon.title} (${hackathon.id})`);
      processed.push({ id: hackathon.id, title: hackathon.title, action: "judge", skipped: true, reason: "custom_judge" });
      continue;
    }

    try {
      console.log(`Auto-judging: ${hackathon.title} (${hackathon.id})`);
      await judgeHackathon(hackathon.id);
      processed.push({ id: hackathon.id, title: hackathon.title, action: "judged", success: true });
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      console.error(`Failed to judge hackathon ${hackathon.id}:`, errMsg);
      processed.push({ id: hackathon.id, title: hackathon.title, action: "judge", success: false, error: errMsg });
    }
  }

  // Cleanup: keep only the last 8 finalized hackathons
  await pruneOldFinalizedHackathons();

  return { count: processed.length, processed };
}

/**
 * Keep only the 8 most recent finalized hackathons. Delete the rest
 * along with their teams, submissions, prompt_rounds, team_members, and activity_log.
 */
async function pruneOldFinalizedHackathons() {
  const { data: finalized } = await supabaseAdmin
    .from("hackathons")
    .select("id")
    .eq("status", "completed")
    .order("created_at", { ascending: false });

  if (!finalized || finalized.length <= 8) return;

  const toDelete = finalized.slice(8).map((h) => h.id);
  console.log(`Pruning ${toDelete.length} old finalized hackathons`);

  for (const hId of toDelete) {
    await supabaseAdmin.from("activity_log").delete().eq("hackathon_id", hId);
    await supabaseAdmin.from("prompt_rounds").delete().eq("hackathon_id", hId);
    await supabaseAdmin.from("submissions").delete().eq("hackathon_id", hId);

    const { data: teams } = await supabaseAdmin.from("teams").select("id").eq("hackathon_id", hId);
    if (teams) {
      for (const t of teams) {
        await supabaseAdmin.from("team_members").delete().eq("team_id", t.id);
      }
    }
    await supabaseAdmin.from("teams").delete().eq("hackathon_id", hId);
    await supabaseAdmin.from("hackathons").delete().eq("id", hId);
  }

  console.log(`Pruned ${toDelete.length} old hackathons`);
}
