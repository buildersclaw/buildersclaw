import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { authenticateRequest } from "@/lib/auth";
import { success, error, unauthorized, notFound } from "@/lib/responses";
import { v4 as uuid } from "uuid";
import { GoogleGenAI } from "@google/genai";

const genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

type RouteParams = { params: Promise<{ id: string; teamId: string }> };

/**
 * POST /api/v1/hackathons/:id/teams/:teamId/submit
 * Trigger agent build + submit. Only team members can submit.
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  const agent = await authenticateRequest(req);
  if (!agent) return unauthorized();

  const { id: hackathonId, teamId } = await params;

  const { data: hackathon } = await supabaseAdmin
    .from("hackathons").select("*").eq("id", hackathonId).single();
  if (!hackathon) return notFound("Hackathon");

  const { data: team } = await supabaseAdmin
    .from("teams").select("*").eq("id", teamId).eq("hackathon_id", hackathonId).single();
  if (!team) return notFound("Team");

  // Verify agent is in team
  const { data: membership } = await supabaseAdmin
    .from("team_members").select("*").eq("team_id", teamId).eq("agent_id", agent.id).single();
  if (!membership) return error("You are not a member of this team", 403);

  // Check if already submitted
  const { data: existingSub } = await supabaseAdmin
    .from("submissions").select("id").eq("team_id", teamId).eq("hackathon_id", hackathonId).single();
  if (existingSub) return error("Team has already submitted", 409);

  // Create submission
  const subId = uuid();
  await supabaseAdmin.from("submissions").insert({
    id: subId, team_id: teamId, hackathon_id: hackathonId,
    status: "building", started_at: new Date().toISOString(),
  });

  await supabaseAdmin.from("teams").update({ status: "building" }).eq("id", teamId);

  await supabaseAdmin.from("activity_log").insert({
    id: uuid(), hackathon_id: hackathonId, team_id: teamId,
    agent_id: agent.id, event_type: "build_started",
    event_data: { submission_id: subId },
  });

  // Get team members for build
  const { data: members } = await supabaseAdmin
    .from("team_members")
    .select("role, agents(name, personality, strategy, model)")
    .eq("team_id", teamId);

  const flatMembers = (members || []).map((m: Record<string, unknown>) => {
    const a = m.agents as Record<string, unknown> | null;
    return { name: a?.name, personality: a?.personality, strategy: a?.strategy, model: a?.model, role: m.role };
  });

  try {
    const systemPrompt = buildSystemPrompt(flatMembers as MemberInfo[], team.name);
    const userPrompt = buildUserPrompt(hackathon.brief);

    const response = await genai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: userPrompt,
      config: {
        systemInstruction: systemPrompt,
        maxOutputTokens: 16000,
        temperature: 0.8,
      },
    });

    const text = response?.text || "";
    const htmlContent = extractHTML(text);

    if (!htmlContent) {
      await supabaseAdmin.from("submissions")
        .update({ status: "failed", build_log: "Failed to generate valid HTML", completed_at: new Date().toISOString() })
        .eq("id", subId);
      await supabaseAdmin.from("teams").update({ status: "submitted" }).eq("id", teamId);

      await supabaseAdmin.from("activity_log").insert({
        id: uuid(), hackathon_id: hackathonId, team_id: teamId,
        agent_id: agent.id, event_type: "build_failed",
        event_data: { error: "No HTML output" },
      });

      return error("Build failed: no valid HTML generated", 500);
    }

    await supabaseAdmin.from("submissions")
      .update({
        status: "completed", html_content: htmlContent,
        build_log: `Built by team ${team.name}. ${flatMembers.length} agent(s) contributed.`,
        completed_at: new Date().toISOString(),
      })
      .eq("id", subId);

    await supabaseAdmin.from("teams").update({ status: "submitted" }).eq("id", teamId);

    await supabaseAdmin.from("activity_log").insert({
      id: uuid(), hackathon_id: hackathonId, team_id: teamId,
      agent_id: agent.id, event_type: "build_completed",
      event_data: { submission_id: subId, html_length: htmlContent.length },
    });

    return success({
      submission_id: subId,
      status: "completed",
      html_length: htmlContent.length,
      preview_url: `/api/v1/submissions/${subId}/preview`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    await supabaseAdmin.from("submissions")
      .update({ status: "failed", build_log: `Build error: ${msg}`, completed_at: new Date().toISOString() })
      .eq("id", subId);
    await supabaseAdmin.from("teams").update({ status: "submitted" }).eq("id", teamId);
    return error(`Build failed: ${msg}`, 500);
  }
}

interface MemberInfo { name: string; personality: string; strategy: string; role: string }

function buildSystemPrompt(members: MemberInfo[], teamName: string): string {
  const memberDescriptions = members.map(m =>
    `- ${m.name} (${m.role})${m.personality ? `: ${m.personality}` : ""}${m.strategy ? ` | Strategy: ${m.strategy}` : ""}`
  ).join("\n");

  return `You are team "${teamName}", a group of AI agents competing in a hackathon.

TEAM MEMBERS:
${memberDescriptions}

Combine the strengths of all team members. You are world-class web developers and designers.
Your goal is to WIN this competition by building the BEST landing page possible.

CRITICAL RULES:
- Output ONLY a single, complete, self-contained HTML file
- ALL CSS must be inline in a <style> tag
- ALL JavaScript must be inline in a <script> tag
- NO external dependencies, CDNs, or imports (except Google Fonts via @import in CSS)
- The page MUST be responsive (mobile + desktop)
- The page MUST be visually stunning and professional
- Include smooth animations and micro-interactions
- Use a cohesive, modern color palette
- Make the CTA impossible to ignore

You are competing against other teams. Make this your BEST work.`;
}

function buildUserPrompt(brief: string): string {
  return `BUILD THIS NOW. Here is your challenge brief:

---
${brief}
---

Respond with ONLY the complete HTML file. No explanations, no markdown. Just raw HTML from <!DOCTYPE html> to </html>.`;
}

function extractHTML(text: string): string | null {
  const codeBlockMatch = text.match(/```html\s*([\s\S]*?)```/);
  if (codeBlockMatch) return codeBlockMatch[1].trim();
  const htmlMatch = text.match(/(<!DOCTYPE html[\s\S]*<\/html>)/i);
  if (htmlMatch) return htmlMatch[1].trim();
  const htmlMatch2 = text.match(/(<html[\s\S]*<\/html>)/i);
  if (htmlMatch2) return htmlMatch2[1].trim();
  if (text.trim().startsWith("<!DOCTYPE") || text.trim().startsWith("<html")) return text.trim();
  return null;
}
