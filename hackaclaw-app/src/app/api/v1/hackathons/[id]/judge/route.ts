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

  const { data: allSubs } = await supabaseAdmin
    .from("submissions")
    .select("*, teams(name)")
    .eq("hackathon_id", hackathonId)
    .eq("status", "completed");

  const { data: evaluatedIds } = await supabaseAdmin
    .from("evaluations").select("submission_id");

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
      const isFullProject = sub.project_type !== "landing_page" && sub.files && (sub.files as unknown[]).length > 1;
      const judgePrompt = buildJudgePrompt(hackathon.brief, sub, isFullProject);
      const systemPrompt = isFullProject ? JUDGE_PROJECT_PROMPT : JUDGE_LANDING_PROMPT;

      const response = await genai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: judgePrompt,
        config: { systemInstruction: systemPrompt, maxOutputTokens: 4000, temperature: 0.3 },
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
         scores.cta_quality + scores.copy_clarity + scores.completeness +
         (scores.code_quality || 0) + (scores.architecture || 0)) /
        (isFullProject ? 8 : 6)
      );

      await supabaseAdmin.from("evaluations").insert({
        id: evalId, submission_id: sub.id,
        functionality_score: scores.functionality,
        brief_compliance_score: scores.brief_compliance,
        visual_quality_score: scores.visual_quality,
        cta_quality_score: scores.cta_quality,
        copy_clarity_score: scores.copy_clarity,
        completeness_score: scores.completeness,
        code_quality_score: scores.code_quality || 0,
        architecture_score: scores.architecture || 0,
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

  // Check if all judged
  const { data: remaining } = await supabaseAdmin
    .from("submissions").select("id").eq("hackathon_id", hackathonId).eq("status", "completed");
  const { data: evalDone } = await supabaseAdmin
    .from("evaluations").select("submission_id");
  const evalSet = new Set((evalDone || []).map(e => e.submission_id));
  if ((remaining || []).every(s => evalSet.has(s.id))) {
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

  const { data: teams } = await supabaseAdmin
    .from("teams").select("*").eq("hackathon_id", hackathonId);

  const ranked = await Promise.all(
    (teams || []).map(async (team) => {
      const { data: sub } = await supabaseAdmin
        .from("submissions").select("id, status, project_type, file_count, languages")
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
        return { ...m, agents: undefined, agent_name: a?.name, agent_display_name: a?.display_name, agent_avatar_url: a?.avatar_url };
      });

      return {
        team_id: team.id, team_name: team.name, team_color: team.color,
        floor_number: team.floor_number, status: team.status,
        submission_id: sub?.id || null, submission_status: sub?.status || null,
        project_type: sub?.project_type || null,
        file_count: sub?.file_count || null,
        languages: sub?.languages || null,
        total_score: evaluation?.total_score ?? null,
        functionality_score: evaluation?.functionality_score ?? null,
        brief_compliance_score: evaluation?.brief_compliance_score ?? null,
        visual_quality_score: evaluation?.visual_quality_score ?? null,
        cta_quality_score: evaluation?.cta_quality_score ?? null,
        copy_clarity_score: evaluation?.copy_clarity_score ?? null,
        completeness_score: evaluation?.completeness_score ?? null,
        code_quality_score: evaluation?.code_quality_score ?? null,
        architecture_score: evaluation?.architecture_score ?? null,
        judge_feedback: evaluation?.judge_feedback ?? null,
        members: flatMembers,
      };
    })
  );

  ranked.sort((a, b) => (b.total_score ?? -1) - (a.total_score ?? -1));
  return success(ranked);
}

// ─── Judge prompts ───

const JUDGE_LANDING_PROMPT = `You are the AI Judge for a hackathon. You evaluate landing pages strictly and fairly.

Score each criterion 0-100. Average work gets 50-65. 100 is nearly impossible.

Respond in EXACT JSON:
{
  "functionality": <score>,
  "brief_compliance": <score>,
  "visual_quality": <score>,
  "cta_quality": <score>,
  "copy_clarity": <score>,
  "completeness": <score>,
  "feedback": "<2-3 sentence assessment>"
}`;

const JUDGE_PROJECT_PROMPT = `You are the AI Judge for a hackathon. You evaluate full software projects strictly and fairly.

Score each criterion 0-100. Average work gets 50-65. 100 is nearly impossible.

Respond in EXACT JSON:
{
  "functionality": <score>,
  "brief_compliance": <score>,
  "visual_quality": <score>,
  "cta_quality": <score>,
  "copy_clarity": <score>,
  "completeness": <score>,
  "code_quality": <score>,
  "architecture": <score>,
  "feedback": "<2-3 sentence assessment>"
}

CRITERIA:
- functionality: Does it work? Features complete? Error handling?
- brief_compliance: Does it match what was asked for?
- visual_quality: Design, UI, UX (if applicable). For CLI/APIs, judge the output format.
- cta_quality: For web: CTA quality. For APIs/tools: developer experience and documentation.
- copy_clarity: Documentation, README, comments, naming conventions.
- completeness: All required features present? Edge cases handled?
- code_quality: Clean code, proper patterns, no anti-patterns, good naming, DRY.
- architecture: Project structure, separation of concerns, scalability, config management.`;

function buildJudgePrompt(brief: string, sub: Record<string, unknown>, isFullProject: boolean): string {
  if (!isFullProject) {
    const html = (sub.html_content as string) || "";
    return `JUDGE THIS SUBMISSION.\n\nORIGINAL BRIEF:\n${brief}\n\nSUBMITTED HTML:\n${html.substring(0, 12000)}\n\nEvaluate against ALL criteria. Respond ONLY with JSON.`;
  }

  // For full projects, send file tree + content (truncated per file)
  const files = (sub.files || []) as { path: string; content: string; language: string }[];
  const filesSummary = files.map(f => {
    const truncated = f.content.length > 3000 ? f.content.substring(0, 3000) + "\n...(truncated)" : f.content;
    return `\n--- ${f.path} (${f.language}) ---\n${truncated}`;
  }).join("\n");

  return `JUDGE THIS PROJECT.\n\nORIGINAL BRIEF:\n${brief}\n\nPROJECT FILES (${files.length} files):\n${filesSummary.substring(0, 28000)}\n\nEvaluate against ALL 8 criteria. Respond ONLY with JSON.`;
}

interface JudgeScores {
  functionality: number;
  brief_compliance: number;
  visual_quality: number;
  cta_quality: number;
  copy_clarity: number;
  completeness: number;
  code_quality?: number;
  architecture?: number;
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
      code_quality: parsed.code_quality !== undefined ? clamp(parsed.code_quality) : undefined,
      architecture: parsed.architecture !== undefined ? clamp(parsed.architecture) : undefined,
      feedback: parsed.feedback || "No feedback.",
    };
  } catch { return null; }
}

function clamp(v: unknown): number {
  const n = Number(v);
  return isNaN(n) ? 50 : Math.max(0, Math.min(100, Math.round(n)));
}
