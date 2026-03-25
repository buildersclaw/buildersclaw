import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { v4 as uuid } from "uuid";
import { createHackathonRepo, setGitHubOverrides, slugify } from "@/lib/github";
import { sanitizeString } from "@/lib/hackathons";

function ok(data: unknown, status = 200) {
  return NextResponse.json({ success: true, data }, { status });
}
function err(message: string, status = 400) {
  return NextResponse.json({ success: false, error: { message } }, { status });
}

/**
 * GET /api/v1/proposals/create?token=xxx — Fetch proposal info for the create form.
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token")?.trim();
  if (!token || token.length < 32) return err("Invalid token", 401);

  const { data: proposal } = await supabaseAdmin
    .from("enterprise_proposals")
    .select("id, company, track, problem_description, status, approval_token, prize_amount, judging_priorities, tech_requirements")
    .eq("approval_token", token)
    .single();

  if (!proposal) return err("Invalid or expired token", 401);
  if (proposal.status !== "approved") return err("This proposal is no longer active", 403);

  return ok({
    company: proposal.company,
    track: proposal.track,
    problem: proposal.problem_description,
    prize_amount: proposal.prize_amount,
    judging_priorities: proposal.judging_priorities,
    tech_requirements: proposal.tech_requirements,
  });
}

/**
 * POST /api/v1/proposals/create — Create a hackathon from an approved proposal.
 *
 * Stores the enterprise context (problem, requirements, judging priorities)
 * in judging_criteria as JSON so the AI judge can use it during evaluation.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const token = (typeof body.token === "string") ? body.token.trim() : "";
    if (!token || token.length < 32) return err("Invalid token", 401);

    const { data: proposal } = await supabaseAdmin
      .from("enterprise_proposals")
      .select("*")
      .eq("approval_token", token)
      .single();

    if (!proposal) return err("Invalid or expired token", 401);
    if (proposal.status !== "approved") return err("This proposal has already been used or is not approved", 403);

    const title = sanitizeString(body.title, 200);
    const brief = sanitizeString(body.brief, 5000);
    const endsAt = body.ends_at ? new Date(body.ends_at) : null;

    if (!title || !brief) return err("title and brief are required");
    if (!endsAt || isNaN(endsAt.getTime()) || endsAt.getTime() <= Date.now()) {
      return err("ends_at must be a valid future date (ISO 8601)");
    }

    const maxPart = Math.max(2, Math.min(1000, Number(body.max_participants) || 50));
    const entryFee = Math.max(0, Number(body.entry_fee) || 0);
    const prizeAmount = Math.max(0, Number(body.prize_amount) || 0);
    const id = uuid();

    // ── Build judging_criteria with full enterprise context ──
    // This is what the AI judge reads to understand what to evaluate against
    const judgingCriteria = JSON.stringify({
      _format: "hackaclaw-mvp-v1",
      enterprise_problem: proposal.problem_description,
      enterprise_requirements: sanitizeString(body.tech_requirements, 2000) || proposal.tech_requirements || null,
      judging_priorities: sanitizeString(body.judging_priorities, 2000) || proposal.judging_priorities || null,
      criteria_text: sanitizeString(body.rules, 2000),
      prize_amount: prizeAmount,
      company: proposal.company,
      // These get filled after judging
      winner_agent_id: null,
      winner_team_id: null,
      finalized_at: null,
      notes: null,
    });

    const { error: insertErr } = await supabaseAdmin
      .from("hackathons")
      .insert({
        id,
        title,
        description: sanitizeString(body.description, 1000) || `Enterprise hackathon by ${proposal.company}`,
        brief,
        rules: sanitizeString(body.rules, 2000),
        entry_type: entryFee > 0 ? "paid" : "free",
        entry_fee: entryFee,
        prize_pool: prizeAmount,
        platform_fee_pct: 0.1,
        max_participants: maxPart,
        team_size_min: 1,
        team_size_max: 1,
        build_time_seconds: Math.max(30, Math.min(600, Number(body.build_time_seconds) || 180)),
        challenge_type: sanitizeString(body.challenge_type, 50) || "other",
        status: "open",
        created_by: proposal.id,
        starts_at: new Date().toISOString(),
        ends_at: endsAt.toISOString(),
        judging_criteria: judgingCriteria,
      })
      .select("*")
      .single();

    if (insertErr) return err("Failed to create hackathon", 500);

    // Create GitHub repo if token provided
    const ghToken = sanitizeString(body.github_token, 256) || process.env.GITHUB_TOKEN;
    const ghOwner = sanitizeString(body.github_owner, 64) || undefined;
    let repoUrl: string | null = null;

    if (ghToken) {
      try {
        setGitHubOverrides(ghToken, ghOwner);
        const { repoUrl: url } = await createHackathonRepo(slugify(title), brief, title);
        repoUrl = url;
        await supabaseAdmin.from("hackathons").update({ github_repo: url }).eq("id", id);
      } catch (e) {
        console.error("GitHub repo creation failed:", e);
      } finally {
        setGitHubOverrides();
      }
    }

    // Mark proposal as used
    await supabaseAdmin
      .from("enterprise_proposals")
      .update({ status: "hackathon_created", admin_notes: `Hackathon created: ${id}` })
      .eq("id", proposal.id);

    return ok({
      hackathon_id: id,
      title,
      status: "open",
      ends_at: endsAt.toISOString(),
      prize_pool: prizeAmount,
      github_repo: repoUrl,
      url: `/hackathons/${id}`,
      message: "Hackathon created successfully!",
    }, 201);
  } catch {
    return err("Invalid request", 400);
  }
}
