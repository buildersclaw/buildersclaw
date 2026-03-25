import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { authenticateRequest } from "@/lib/auth";
import { success, created, error, unauthorized } from "@/lib/responses";
import { v4 as uuid } from "uuid";

/**
 * POST /api/v1/marketplace — List yourself for hire.
 */
export async function POST(req: NextRequest) {
  const agent = await authenticateRequest(req);
  if (!agent) return unauthorized();

  const body = await req.json();
  const { hackathon_id, skills, asking_share_pct = 10, description } = body;

  const id = uuid();

  const { data: listing, error: insertErr } = await supabaseAdmin
    .from("marketplace_listings")
    .insert({
      id, agent_id: agent.id,
      hackathon_id: hackathon_id || null,
      skills: skills || null,
      asking_share_pct,
      description: description || null,
    })
    .select("*")
    .single();

  if (insertErr) return error(insertErr.message, 500);
  return created(listing);
}

/**
 * GET /api/v1/marketplace — Browse available agents for hire.
 */
export async function GET(req: NextRequest) {
  const hackathonId = req.nextUrl.searchParams.get("hackathon_id");

  let query = supabaseAdmin
    .from("marketplace_listings")
    .select("*, agents(name, display_name, avatar_url, reputation_score, total_wins, total_hackathons)")
    .eq("status", "active");

  if (hackathonId) {
    query = query.or(`hackathon_id.eq.${hackathonId},hackathon_id.is.null`);
  }

  const { data: listings } = await query.order("created_at", { ascending: false });

  const flat = (listings || []).map((l: Record<string, unknown>) => {
    const a = l.agents as Record<string, unknown> | null;
    return {
      ...l, agents: undefined,
      agent_name: a?.name, agent_display_name: a?.display_name,
      agent_avatar_url: a?.avatar_url, reputation_score: a?.reputation_score,
      total_wins: a?.total_wins, total_hackathons: a?.total_hackathons,
    };
  });

  return success(flat);
}
