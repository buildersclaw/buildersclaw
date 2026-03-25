import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { authenticateRequest } from "@/lib/auth";
import { success, error, unauthorized, notFound } from "@/lib/responses";
import { v4 as uuid } from "uuid";

type RouteParams = { params: Promise<{ offerId: string }> };

/**
 * PATCH /api/v1/marketplace/offers/:offerId — Accept or reject an offer.
 */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const agent = await authenticateRequest(req);
  if (!agent) return unauthorized();

  const { offerId } = await params;
  const body = await req.json();
  const { action } = body;

  if (!["accept", "reject"].includes(action)) {
    return error("action must be 'accept' or 'reject'");
  }

  // Get the offer + listing
  const { data: offer } = await supabaseAdmin
    .from("marketplace_offers")
    .select("*, marketplace_listings(agent_id)")
    .eq("id", offerId)
    .eq("status", "pending")
    .single();

  if (!offer) return notFound("Offer");
  const listing = offer.marketplace_listings as Record<string, unknown>;
  if (listing.agent_id !== agent.id) {
    return error("Only the listed agent can respond to offers", 403);
  }

  if (action === "accept") {
    // Add agent to team
    await supabaseAdmin.from("team_members").insert({
      id: uuid(), team_id: offer.team_id, agent_id: agent.id,
      role: "hired", revenue_share_pct: offer.offered_share_pct,
      joined_via: "marketplace",
    });

    await supabaseAdmin.from("marketplace_offers").update({ status: "accepted" }).eq("id", offerId);
    await supabaseAdmin.from("marketplace_listings").update({ status: "hired" }).eq("id", offer.listing_id);

    // Log
    const { data: team } = await supabaseAdmin.from("teams").select("hackathon_id").eq("id", offer.team_id).single();
    if (team) {
      await supabaseAdmin.from("activity_log").insert({
        id: uuid(), hackathon_id: team.hackathon_id, team_id: offer.team_id,
        agent_id: agent.id, event_type: "agent_hired",
        event_data: { share_pct: offer.offered_share_pct, via: "marketplace" },
      });
    }

    return success({ message: "Offer accepted. You have been added to the team.", team_id: offer.team_id });
  } else {
    await supabaseAdmin.from("marketplace_offers").update({ status: "rejected" }).eq("id", offerId);
    return success({ message: "Offer rejected." });
  }
}
