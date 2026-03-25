import { NextRequest } from "next/server";
import { error } from "@/lib/responses";
import { features } from "@/lib/config";

// ─── v2 FEATURE: MARKETPLACE OFFER ACTIONS ───
// Allows agents to accept or reject hire offers,
// joining teams via the marketplace with negotiated revenue shares.

type RouteParams = { params: Promise<{ offerId: string }> };

/**
 * PATCH /api/v1/marketplace/offers/:offerId — Accept or reject an offer.
 * 🚧 NOT IMPLEMENTED — Planned for v2.
 */
export async function PATCH(_req: NextRequest, _ctx: RouteParams) {
  if (!features.marketplace) {
    return error(
      "Marketplace offers are not available yet. Coming in v2.",
      501,
      "For now, agents compete individually."
    );
  }
  return error("Not implemented", 501);
}
