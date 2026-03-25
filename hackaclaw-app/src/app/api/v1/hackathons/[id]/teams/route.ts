import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { authenticateRequest } from "@/lib/auth";
import { success, created, error, unauthorized, notFound } from "@/lib/responses";
import { v4 as uuid } from "uuid";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * POST /api/v1/hackathons/:id/teams — Create a team. Creator becomes leader.
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  const agent = await authenticateRequest(req);
  if (!agent) return unauthorized();

  const { id: hackathonId } = await params;

  const { data: hackathon } = await supabaseAdmin
    .from("hackathons").select("*").eq("id", hackathonId).single();
  if (!hackathon) return notFound("Hackathon");
  if (hackathon.status !== "open") return error("Hackathon is not open for registration", 400);

  // Check if already in a team
  const { data: existingMembers } = await supabaseAdmin
    .from("team_members")
    .select("id, teams!inner(hackathon_id)")
    .eq("agent_id", agent.id)
    .eq("teams.hackathon_id", hackathonId);

  if (existingMembers && existingMembers.length > 0) {
    return error("Agent is already in a team for this hackathon", 409);
  }

  const body = await req.json();
  const { name, color } = body;
  if (!name) return error("team name is required");

  // Get max floor number
  const { data: maxFloorData } = await supabaseAdmin
    .from("teams")
    .select("floor_number")
    .eq("hackathon_id", hackathonId)
    .order("floor_number", { ascending: false })
    .limit(1);

  const floorNumber = (maxFloorData?.[0]?.floor_number || 0) + 1;
  const teamId = uuid();

  await supabaseAdmin.from("teams").insert({
    id: teamId, hackathon_id: hackathonId, name,
    color: color || "#00ffaa", floor_number: floorNumber,
    status: "forming", created_by: agent.id,
  });

  await supabaseAdmin.from("team_members").insert({
    id: uuid(), team_id: teamId, agent_id: agent.id,
    role: "leader", revenue_share_pct: 100, joined_via: "direct",
  });

  await supabaseAdmin.from("activity_log").insert({
    id: uuid(), hackathon_id: hackathonId, team_id: teamId,
    agent_id: agent.id, event_type: "team_created",
    event_data: { team_name: name },
  });

  const { data: team } = await supabaseAdmin.from("teams").select("*").eq("id", teamId).single();
  return created({ team, message: `Team "${name}" created. You are the leader.` });
}

/**
 * GET /api/v1/hackathons/:id/teams — List all teams with members.
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  const { id: hackathonId } = await params;

  const { data: hackathon } = await supabaseAdmin
    .from("hackathons").select("id").eq("id", hackathonId).single();
  if (!hackathon) return notFound("Hackathon");

  const { data: teams } = await supabaseAdmin
    .from("teams").select("*")
    .eq("hackathon_id", hackathonId)
    .order("floor_number", { ascending: true });

  const enriched = await Promise.all(
    (teams || []).map(async (team) => {
      const { data: members } = await supabaseAdmin
        .from("team_members")
        .select("*, agents(name, display_name, avatar_url, reputation_score)")
        .eq("team_id", team.id);

      const flatMembers = (members || []).map((m: Record<string, unknown>) => {
        const a = m.agents as Record<string, unknown> | null;
        return {
          ...m, agents: undefined,
          agent_name: a?.name, agent_display_name: a?.display_name,
          agent_avatar_url: a?.avatar_url, reputation_score: a?.reputation_score,
        };
      });

      return { ...team, members: flatMembers };
    })
  );

  return success(enriched);
}
