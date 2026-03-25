import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { success, error, notFound } from "@/lib/responses";
import { v4 as uuid } from "uuid";
import { GoogleGenAI } from "@google/genai";

const genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

type RouteParams = { params: Promise<{ id: string }> };

/**
 * POST /api/v1/hackathons/:id/judge — Trigger AI judge on all completed submissions.
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  const { id: hackathonId } = await params;

  const { data: hackathon } = await supabaseAdmin
    .from("hackathons").select("*").eq("id", hackathonId).single();
  if (!hackathon) return notFound("Hackathon");

  // Get completed submissions without evaluations
  const { data: allSubs } = await supabaseAdmin
    .from("submissions")
    .select("*, teams(name)")
    .eq("hackathon_id", hackathonId)
    .eq("status", "completed");

  // Filter out already-evaluated ones
  const { data: evaluatedIds } = await supabaseAdmin
    .from("evaluations")
    .select("submission_id");

  const evaluatedSet = new Set((evaluatedIds || []).map(e => e.submission_id));
  const submissions = (allSubs || []).filter(s => !evaluatedSet.has(s.id));

  if (submissions.length === 0) {
    return success({ message: "No pending submissions to judge", judged: 0 });
  }

  await supabaseAdmin.from("hackathons")
    .update({ status: "judging", updated_at: new Date().toISOString() })
    .eq("id", hackathonId);

  const results = [];

  for (const sub of submissions) {
    try {
      const judgePrompt = buildJudgePrompt(hackathon.brief, sub.html_content);

      const response = await genai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: judgePrompt,
        config: {
          systemInstruction: JUDGE_SYSTEM_PROMPT,
          maxOutputTokens: 4000,
          temperature: 0.3,
        },
      });

      const text = response?.text || "";
      const scores = parseJudgeResponse(text);

      if (!scores) {
        results.push({ submission_id: sub.id, error: "Failed to parse scores" });
        continue;
      }

      const evalId = uuid();
      const totalScore = Math.round(
        (scores.functionality + scores.brief_compliance + scores.visual_quality +
         scores.cta_quality + scores.copy_clarity + scores.completeness) / 6
      );

      await supabaseAdmin.from("evaluations").insert({
        id: evalId, submission_id: sub.id,
        functionality_score: scores.functionality,
        brief_compliance_score: scores.brief_compliance,
        visual_quality_score: scores.visual_quality,
        cta_quality_score: scores.cta_quality,
        copy_clarity_score: scores.copy_clarity,
        completeness_score: scores.completeness,
        total_score: totalScore,
        judge_feedback: scores.feedback,
        raw_response: text,
      });

      await supabaseAdmin.from("teams").update({ status: "judged" }).eq("id", sub.team_id);

      await supabaseAdmin.from("activity_log").insert({
        id: uuid(), hackathon_id: hackathonId, team_id: sub.team_id,
        event_type: "score_received",
        event_data: { total_score: totalScore, submission_id: sub.id },
      });

      const teamName = (sub.teams as Record<string, unknown> | null)?.name;
      results.push({ submission_id: sub.id, team_name: teamName, total_score: totalScore, scores });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      results.push({ submission_id: sub.id, error: msg });
    }
  }

  // If all judged, mark hackathon completed
  const { data: remaining } = await supabaseAdmin
    .from("submissions")
    .select("id")
    .eq("hackathon_id", hackathonId)
    .eq("status", "completed");

  const { data: evalDone } = await supabaseAdmin
    .from("evaluations")
    .select("submission_id");

  const evalSet = new Set((evalDone || []).map(e => e.submission_id));
  const allJudged = (remaining || []).every(s => evalSet.has(s.id));

  if (allJudged) {
    await supabaseAdmin.from("hackathons")
      .update({ status: "completed", updated_at: new Date().toISOString() })
      .eq("id", hackathonId);
  }

  return success({ judged: results.length, results });
}

/**
 * GET /api/v1/hackathons/:id/judge — Get ranked results / leaderboard.
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  const { id: hackathonId } = await params;

  const { data: hackathon } = await supabaseAdmin
    .from("hackathons").select("id").eq("id", hackathonId).single();
  if (!hackathon) return notFound("Hackathon");

  // Get all teams with submissions and evaluations
  const { data: teams } = await supabaseAdmin
    .from("teams").select("*").eq("hackathon_id", hackathonId);

  const ranked = await Promise.all(
    (teams || []).map(async (team) => {
      const { data: sub } = await supabaseAdmin
        .from("submissions").select("*")
        .eq("team_id", team.id).eq("hackathon_id", hackathonId).single();

      let evaluation = null;
      if (sub) {
        const { data: evalData } = await supabaseAdmin
          .from("evaluations").select("*").eq("submission_id", sub.id).single();
        evaluation = evalData;
      }

      const { data: members } = await supabaseAdmin
        .from("team_members")
        .select("*, agents(name, display_name, avatar_url)")
        .eq("team_id", team.id);

      const flatMembers = (members || []).map((m: Record<string, unknown>) => {
        const a = m.agents as Record<string, unknown> | null;
        return {
          ...m, agents: undefined,
          agent_name: a?.name, agent_display_name: a?.display_name,
          agent_avatar_url: a?.avatar_url,
        };
      });

      return {
        team_id: team.id, team_name: team.name, team_color: team.color,
        floor_number: team.floor_number, status: team.status,
        submission_id: sub?.id || null, submission_status: sub?.status || null,
        total_score: evaluation?.total_score ?? null,
        functionality_score: evaluation?.functionality_score ?? null,
        brief_compliance_score: evaluation?.brief_compliance_score ?? null,
        visual_quality_score: evaluation?.visual_quality_score ?? null,
        cta_quality_score: evaluation?.cta_quality_score ?? null,
        copy_clarity_score: evaluation?.copy_clarity_score ?? null,
        completeness_score: evaluation?.completeness_score ?? null,
        judge_feedback: evaluation?.judge_feedback ?? null,
        members: flatMembers,
      };
    })
  );

  // Sort by score descending
  ranked.sort((a, b) => (b.total_score ?? -1) - (a.total_score ?? -1));

  return success(ranked);
}

const JUDGE_SYSTEM_PROMPT = `You are the AI Judge for a hackathon competition. You evaluate landing pages with STRICT, FAIR, and CONSISTENT criteria.

Be OBJECTIVE, STRICT, and DETAILED. Average work gets 50-65. A score of 100 is nearly impossible.

Score each criterion 0-100:
- 0-30: Major failures
- 31-50: Below average
- 51-65: Average, meets basics
- 66-80: Good
- 81-90: Excellent
- 91-100: Exceptional

Respond in this EXACT JSON format:
{
  "functionality": <score>,
  "brief_compliance": <score>,
  "visual_quality": <score>,
  "cta_quality": <score>,
  "copy_clarity": <score>,
  "completeness": <score>,
  "feedback": "<2-3 sentence assessment>"
}`;

function buildJudgePrompt(brief: string, html: string): string {
  return `JUDGE THIS SUBMISSION.

ORIGINAL BRIEF:
${brief}

SUBMITTED HTML:
${html.substring(0, 12000)}

Evaluate against ALL criteria. Respond ONLY with JSON.`;
}

interface JudgeScores {
  functionality: number;
  brief_compliance: number;
  visual_quality: number;
  cta_quality: number;
  copy_clarity: number;
  completeness: number;
  feedback: string;
}

function parseJudgeResponse(text: string): JudgeScores | null {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      functionality: clamp(parsed.functionality),
      brief_compliance: clamp(parsed.brief_compliance),
      visual_quality: clamp(parsed.visual_quality),
      cta_quality: clamp(parsed.cta_quality),
      copy_clarity: clamp(parsed.copy_clarity),
      completeness: clamp(parsed.completeness),
      feedback: parsed.feedback || "No feedback.",
    };
  } catch { return null; }
}

function clamp(v: unknown): number {
  const n = Number(v);
  return isNaN(n) ? 50 : Math.max(0, Math.min(100, Math.round(n)));
}
