import { NextResponse } from "next/server";
import { getRequestAgent } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { errorResponse, successResponse } from "@/lib/responses";
import { enqueueJob } from "@/lib/queue";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const agent = await getRequestAgent(req);
  if (!agent) {
    return errorResponse(401, "Unauthorized");
  }

  const { id: hackathonId } = await params;
  let body;
  try {
    body = await req.json();
  } catch {
    return errorResponse(400, "Invalid JSON body");
  }

  const { submission_id, total_score, feedback } = body;
  if (!submission_id || typeof total_score !== "number" || typeof feedback !== "string") {
    return errorResponse(400, "Missing or invalid fields: submission_id, total_score, feedback");
  }

  if (total_score < 0 || total_score > 100) {
    return errorResponse(400, "total_score must be between 0 and 100");
  }

  // Validate peer judgment assignment
  const { data: assignment } = await supabaseAdmin
    .from("peer_judgments")
    .select("*, submissions!inner(hackathon_id)")
    .eq("submission_id", submission_id)
    .eq("reviewer_agent_id", agent.id)
    .single();

  if (!assignment) {
    return errorResponse(403, "Not assigned to review this submission");
  }

  if (assignment.submissions.hackathon_id !== hackathonId) {
    return errorResponse(400, "Submission does not belong to this hackathon");
  }

  if (assignment.status === "submitted") {
    return errorResponse(400, "Already submitted this review");
  }

  // Check if hackathon judging is closed
  const { data: hackathon } = await supabaseAdmin
    .from("hackathons")
    .select("judging_criteria")
    .eq("id", hackathonId)
    .single();

  if (hackathon) {
    let meta: Record<string, unknown> = {};
    if (hackathon.judging_criteria) {
      try {
        meta = typeof hackathon.judging_criteria === "string" 
          ? JSON.parse(hackathon.judging_criteria) 
          : hackathon.judging_criteria;
      } catch { /* ignore */ }
    }
    if (meta.peer_judging_closed_at) {
      return errorResponse(400, "Peer judging phase has closed for this hackathon");
    }
  }

  const warnings: Record<string, unknown> = {};
  if (total_score === 100 || total_score === 0) {
    warnings.extreme_score = true;
  }

  const { error } = await supabaseAdmin
    .from("peer_judgments")
    .update({
      status: "submitted",
      total_score,
      feedback,
      warnings: Object.keys(warnings).length > 0 ? warnings : null,
      submitted_at: new Date().toISOString(),
    })
    .eq("id", assignment.id);

  if (error) {
    return errorResponse(500, "Failed to submit peer review", error.message);
  }

  // Early close logic: check if all assigned reviews for this hackathon are submitted
  const { count: pendingCount } = await supabaseAdmin
    .from("peer_judgments")
    .select("id", { count: "exact", head: true })
    .eq("status", "assigned")
    .eq("submissions.hackathon_id", hackathonId)
    .not("submissions", "is", null);

  if (pendingCount === 0) {
    await enqueueJob({
      type: "judging.close_peer_reviews",
      payload: { hackathon_id: hackathonId },
      maxAttempts: 3,
    });
  }

  return successResponse({ message: "Peer review submitted successfully" });
}
