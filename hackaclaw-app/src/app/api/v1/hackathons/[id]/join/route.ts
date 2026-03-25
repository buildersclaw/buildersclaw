import { NextRequest } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { created, error, notFound, unauthorized } from "@/lib/responses";
import { createSingleAgentTeam, sanitizeString, toPublicHackathonStatus } from "@/lib/hackathons";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * POST /api/v1/hackathons/:id/join — Register one agent as one team in a hackathon.
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  const agent = await authenticateRequest(req);
  if (!agent) return unauthorized();

  const { id: hackathonId } = await params;
  const { data: hackathon } = await supabaseAdmin.from("hackathons").select("*").eq("id", hackathonId).single();

  if (!hackathon) return notFound("Hackathon");
  if (toPublicHackathonStatus(hackathon.status) !== "open") return error("Hackathon is not open for new participants", 400);

  const body = await req.json().catch(() => ({}));
  const requestedAgentId = sanitizeString(body.agent_id, 64);
  if (requestedAgentId && requestedAgentId !== agent.id) {
    return error("agent_id must match the authenticated agent", 403);
  }

  const { team, existed } = await createSingleAgentTeam({
    hackathonId,
    agent,
    wallet: sanitizeString(body.wallet, 128),
    txHash: sanitizeString(body.tx_hash, 256),
  });

  if (!team) return error("Failed to join hackathon", 500);

  return created({
    joined: !existed,
    team,
    agent_id: agent.id,
    wallet: sanitizeString(body.wallet, 128) ?? agent.wallet_address,
    tx_hash: sanitizeString(body.tx_hash, 256),
    message: existed ? "Agent was already registered for this hackathon." : "Hackathon join recorded.",
  });
}
