import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { authenticateAdminRequest } from "@/lib/auth";
import { v4 as uuid } from "uuid";

function sanitize(val: unknown, max: number): string | null {
  if (typeof val !== "string") return null;
  return val.trim().slice(0, max) || null;
}

/**
 * POST /api/v1/proposals — Submit an enterprise proposal (public, no auth).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const company = sanitize(body.company, 200);
    const email = sanitize(body.email, 320);
    const track = sanitize(body.track, 100);
    const problem = sanitize(body.problem, 5000);
    const judgeAgent = sanitize(body.judge_agent, 50);
    const budget = sanitize(body.budget, 100);
    const timeline = sanitize(body.timeline, 100);
    const prizeAmount = sanitize(body.prize_amount, 20);
    const judgingPriorities = sanitize(body.judging_priorities, 2000);
    const techRequirements = sanitize(body.tech_requirements, 2000);

    if (!company || !email || !problem || !track) {
      return NextResponse.json(
        { success: false, error: { message: "company, email, track, and problem are required" } },
        { status: 400 },
      );
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { success: false, error: { message: "Invalid email address" } },
        { status: 400 },
      );
    }

    const id = uuid();
    const { error: insertErr } = await supabaseAdmin
      .from("enterprise_proposals")
      .insert({
        id,
        company,
        contact_email: email,
        track,
        problem_description: problem,
        judge_agent: judgeAgent,
        budget,
        timeline,
        prize_amount: prizeAmount ? Number(prizeAmount) : null,
        judging_priorities: judgingPriorities,
        tech_requirements: techRequirements,
        status: "pending",
        created_at: new Date().toISOString(),
      });

    if (insertErr) {
      console.error("Proposal insert failed:", insertErr);
      return NextResponse.json(
        { success: false, error: { message: "Failed to submit proposal. Try again." } },
        { status: 500 },
      );
    }

    return NextResponse.json(
      { success: true, data: { id, message: "Challenge submitted. We'll review it and get back to you." } },
      { status: 201 },
    );
  } catch {
    return NextResponse.json(
      { success: false, error: { message: "Invalid request" } },
      { status: 400 },
    );
  }
}

/**
 * GET /api/v1/proposals — List all proposals (admin only).
 */
export async function GET(req: NextRequest) {
  if (!authenticateAdminRequest(req)) {
    return NextResponse.json({ success: false, error: { message: "Unauthorized" } }, { status: 401 });
  }

  const status = req.nextUrl.searchParams.get("status");
  let query = supabaseAdmin.from("enterprise_proposals").select("*").order("created_at", { ascending: false });
  if (status) query = query.eq("status", status);

  const { data, error: queryErr } = await query.limit(100);
  if (queryErr) {
    return NextResponse.json({ success: false, error: { message: "Query failed" } }, { status: 500 });
  }

  return NextResponse.json({ success: true, data });
}

/**
 * PATCH /api/v1/proposals — Update proposal status (admin only).
 * Body: { id, status: "approved" | "rejected", notes? }
 */
export async function PATCH(req: NextRequest) {
  if (!authenticateAdminRequest(req)) {
    return NextResponse.json({ success: false, error: { message: "Unauthorized" } }, { status: 401 });
  }

  try {
    const body = await req.json();
    const id = sanitize(body.id, 64);
    const newStatus = sanitize(body.status, 20);

    if (!id || !newStatus || !["approved", "rejected"].includes(newStatus)) {
      return NextResponse.json(
        { success: false, error: { message: "id and status (approved|rejected) required" } },
        { status: 400 },
      );
    }

    const approvalToken = newStatus === "approved" ? crypto.randomBytes(32).toString("hex") : null;

    const { error: updateErr } = await supabaseAdmin
      .from("enterprise_proposals")
      .update({
        status: newStatus,
        admin_notes: sanitize(body.notes, 2000),
        reviewed_at: new Date().toISOString(),
        ...(approvalToken ? { approval_token: approvalToken } : {}),
      })
      .eq("id", id);

    if (updateErr) {
      return NextResponse.json({ success: false, error: { message: "Update failed" } }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: {
        id,
        status: newStatus,
        ...(approvalToken ? { approval_token: approvalToken, create_url: `/enterprise/create/${approvalToken}` } : {}),
      },
    });
  } catch {
    return NextResponse.json({ success: false, error: { message: "Invalid request" } }, { status: 400 });
  }
}
