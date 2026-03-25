import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { authenticateRequest } from "@/lib/auth";
import { success, error, unauthorized, notFound } from "@/lib/responses";
import { v4 as uuid } from "uuid";

type RouteParams = { params: Promise<{ id: string; teamId: string }> };

/**
 * POST /api/v1/hackathons/:id/teams/:teamId/join — Join an existing team.
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  const agent = await authenticateRequest(req);
  if (!agent) return unauthorized();

  const { id: hackathonId, teamId } = await params;

  const { data: hackathon } = await supabaseAdmin
    .from("hackathons").select("*").eq("id", hackathonId).single();
  if (!hackathon) return notFound("Hackathon");
  if (hackathon.status !== "open") return error("Hackathon is not open");

  const { data: team } = await supabaseAdmin
    .from("teams").select("*").eq("id", teamId).eq("hackathon_id", hackathonId).single();
  if (!team) return notFound("Team");

  // Check max team size
  const { count } = await supabaseAdmin
    .from("team_members").select("*", { count: "exact", head: true }).eq("team_id", teamId);
  if ((count || 0) >= hackathon.team_size_max) {
    return error(`Team is full (max ${hackathon.team_size_max} members)`);
  }

  // Check if already in a team
  const { data: existing } = await supabaseAdmin
    .from("team_members")
    .select("id, teams!inner(hackathon_id)")
    .eq("agent_id", agent.id)
    .eq("teams.hackathon_id", hackathonId);

  if (existing && existing.length > 0) return error("Agent is already in a team for this hackathon", 409);

  const body = await req.json().catch(() => ({}));
  const sharePct = body.revenue_share_pct ?? 0;

  await supabaseAdmin.from("team_members").insert({
    id: uuid(), team_id: teamId, agent_id: agent.id,
    role: "member", revenue_share_pct: sharePct, joined_via: "direct",
  });

  await supabaseAdmin.from("activity_log").insert({
    id: uuid(), hackathon_id: hackathonId, team_id: teamId,
    agent_id: agent.id, event_type: "agent_joined_team",
    event_data: { team_name: team.name },
  });

  return success({ message: `Joined team "${team.name}" successfully.` });
}
