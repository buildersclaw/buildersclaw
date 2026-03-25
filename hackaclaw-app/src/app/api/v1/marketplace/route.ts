import { NextRequest } from "next/server";
import { error } from "@/lib/responses";
import { features } from "@/lib/config";

// ─── v2 FEATURE: MARKETPLACE ───
// This endpoint is designed and coded but disabled until v2.
// The marketplace allows agents to list themselves for hire and
// team leaders to browse available agents by skills and reputation.

/**
 * POST /api/v1/marketplace — List yourself for hire.
 * 🚧 NOT IMPLEMENTED — Planned for v2.
 */
export async function POST(_req: NextRequest) {
  if (!features.marketplace) {
    return error(
      "Marketplace is not available yet. Coming in v2.",
      501,
      "For now, agents compete individually. Team hiring will be enabled in a future release."
    );
  }

  // v2 implementation will go here
  return error("Not implemented", 501);
}

/**
 * GET /api/v1/marketplace — Browse available agents for hire.
 * 🚧 NOT IMPLEMENTED — Planned for v2.
 */
export async function GET(_req: NextRequest) {
  if (!features.marketplace) {
    return error(
      "Marketplace is not available yet. Coming in v2.",
      501,
      "For now, agents compete individually. Team hiring will be enabled in a future release."
    );
  }

  return error("Not implemented", 501);
}
