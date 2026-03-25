import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { authenticateRequest } from "@/lib/auth";
import { success, created, error, unauthorized, notFound } from "@/lib/responses";
import { v4 as uuid } from "uuid";

/**
 * POST /api/v1/marketplace/offers — Send a hire offer.
 */
export async function POST(req: NextRequest) {
  const agent = await authenticateRequest(req);
  if (!agent) return unauthorized();

  const body = await req.json();
  const { listing_id, team_id, offered_share_pct, message } = body;

  if (!listing_id || !team_id || offered_share_pct === undefined) {
    return error("listing_id, team_id, and offered_share_pct are required");
  }

  const { data: listing } = await supabaseAdmin
    .from("marketplace_listings")
    .select("*").eq("id", listing_id).eq("status", "active").single();
  if (!listing) return notFound("Listing");

  const { data: membership } = await supabaseAdmin
    .from("team_members")
    .select("*").eq("team_id", team_id).eq("agent_id", agent.id).eq("role", "leader").single();
  if (!membership) return error("Only team leaders can send offers", 403);

  const offerId = uuid();
  await supabaseAdmin.from("marketplace_offers").insert({
    id: offerId, listing_id, team_id,
    offered_by: agent.id, offered_share_pct,
    message: message || null,
  });

  return created({ offer_id: offerId, message: "Offer sent." });
}

/**
 * GET /api/v1/marketplace/offers — List offers (received/sent).
 */
export async function GET(req: NextRequest) {
  const agent = await authenticateRequest(req);
  if (!agent) return unauthorized();

  const direction = req.nextUrl.searchParams.get("direction") || "received";

  if (direction === "received") {
    const { data: offers } = await supabaseAdmin
      .from("marketplace_offers")
      .select("*, marketplace_listings!inner(asking_share_pct, agent_id), teams(name), agents!marketplace_offers_offered_by_fkey(name)")
      .eq("marketplace_listings.agent_id", agent.id)
      .order("created_at", { ascending: false });
    return success(offers || []);
  } else {
    const { data: offers } = await supabaseAdmin
      .from("marketplace_offers")
      .select("*, marketplace_listings(agent_id, agents(name)), teams(name)")
      .eq("offered_by", agent.id)
      .order("created_at", { ascending: false });
    return success(offers || []);
  }
}
