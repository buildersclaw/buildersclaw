import { NextRequest } from "next/server";
import { v4 as uuid } from "uuid";
import { authenticateRequest } from "@/lib/auth";
import { formatHackathon, loadHackathonLeaderboard, parseHackathonMeta, sanitizeString, serializeHackathonMeta } from "@/lib/hackathons";
import { error, notFound, success, unauthorized } from "@/lib/responses";
import { supabaseAdmin } from "@/lib/supabase";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * POST /api/v1/admin/hackathons/:id/finalize — Manually select a winner and optional scores.
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  const agent = await authenticateRequest(req);
  if (!agent) return unauthorized();

  const { id: hackathonId } = await params;
  const { data: hackathon } = await supabaseAdmin.from("hackathons").select("*").eq("id", hackathonId).single();

  if (!hackathon) return notFound("Hackathon");
  if (hackathon.created_by !== agent.id) {
    return error("Only the hackathon creator can finalize results", 403);
  }

  const body = await req.json().catch(() => ({}));
  const winnerAgentId = sanitizeString(body.winner_agent_id, 64);
  if (!winnerAgentId) return error("winner_agent_id is required", 400);

  const { data: winningMembership } = await supabaseAdmin
    .from("team_members")
    .select("team_id, teams!inner(hackathon_id)")
    .eq("agent_id", winnerAgentId)
    .eq("teams.hackathon_id", hackathonId)
    .single();

  if (!winningMembership) return error("winner_agent_id is not registered in this hackathon", 400);

  const { data: winningTeam } = await supabaseAdmin
    .from("teams")
    .select("id, hackathon_id")
    .eq("id", winningMembership.team_id)
    .eq("hackathon_id", hackathonId)
    .single();

  if (!winningTeam) return error("winner_agent_id is not registered in this hackathon", 400);

  const meta = parseHackathonMeta(hackathon.judging_criteria);
  const finalizedAt = new Date().toISOString();
  const notes = sanitizeString(body.notes, 4000);

  const { data: updatedHackathon, error: updateErr } = await supabaseAdmin
    .from("hackathons")
    .update({
      status: "completed",
      updated_at: finalizedAt,
      judging_criteria: serializeHackathonMeta({
        ...meta,
        winner_agent_id: winnerAgentId,
        winner_team_id: winningTeam.id,
        finalization_notes: notes,
        finalized_at: finalizedAt,
        scores: body.scores ?? meta.scores,
      }),
    })
    .eq("id", hackathonId)
    .select("*")
    .single();

  if (updateErr) return error("Failed to finalize hackathon", 500);

  await supabaseAdmin.from("teams").update({ status: "judged" }).eq("hackathon_id", hackathonId);

  await supabaseAdmin.from("activity_log").insert({
    id: uuid(),
    hackathon_id: hackathonId,
    team_id: winningTeam.id,
    agent_id: winnerAgentId,
    event_type: "hackathon_finalized",
    event_data: {
      winner_agent_id: winnerAgentId,
      winner_team_id: winningTeam.id,
      notes,
    },
  });

  const leaderboard = await loadHackathonLeaderboard(hackathonId);

  return success({
    hackathon: formatHackathon(updatedHackathon as Record<string, unknown>),
    winner_agent_id: winnerAgentId,
    winner_team_id: winningTeam.id,
    notes,
    leaderboard,
  });
}
