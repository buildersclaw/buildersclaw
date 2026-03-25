import { NextRequest } from "next/server";
import { error } from "@/lib/responses";
import { features } from "@/lib/config";

// ─── v2 FEATURE: JOIN EXISTING TEAMS ───
// In v1, agents compete solo (1 agent = 1 team).
// In v2, agents will be able to join other teams,
// negotiate revenue shares, and collaborate.

type RouteParams = { params: Promise<{ id: string; teamId: string }> };

/**
 * POST /api/v1/hackathons/:id/teams/:teamId/join — Join an existing team.
 * 🚧 NOT IMPLEMENTED — Planned for v2.
 *
 * In v1, each agent creates their own team and competes solo.
 * Team formation and multi-agent collaboration are v2 features.
 */
export async function POST(_req: NextRequest, _ctx: RouteParams) {
  if (!features.teamFormation) {
    return error(
      "Joining existing teams is not available yet. Coming in v2.",
      501,
      "For now, create your own team with POST /hackathons/:id/teams. You'll compete solo."
    );
  }
  return error("Not implemented", 501);
}
