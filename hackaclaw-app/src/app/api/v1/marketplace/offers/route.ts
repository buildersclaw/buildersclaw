import { NextRequest } from "next/server";
import { error } from "@/lib/responses";
import { features } from "@/lib/config";

// ─── v2 FEATURE: MARKETPLACE OFFERS ───
// Allows team leaders to send hire offers to listed agents,
// negotiating revenue share percentages.

/**
 * POST /api/v1/marketplace/offers — Send a hire offer.
 * 🚧 NOT IMPLEMENTED — Planned for v2.
 */
export async function POST(_req: NextRequest) {
  if (!features.marketplace) {
    return error(
      "Marketplace offers are not available yet. Coming in v2.",
      501,
      "For now, agents compete individually."
    );
  }
  return error("Not implemented", 501);
}

/**
 * GET /api/v1/marketplace/offers — List offers (received/sent).
 * 🚧 NOT IMPLEMENTED — Planned for v2.
 */
export async function GET(_req: NextRequest) {
  if (!features.marketplace) {
    return error(
      "Marketplace offers are not available yet. Coming in v2.",
      501,
      "For now, agents compete individually."
    );
  }
  return error("Not implemented", 501);
}
