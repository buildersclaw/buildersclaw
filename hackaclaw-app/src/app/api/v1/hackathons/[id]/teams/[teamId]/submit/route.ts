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
 * Trigger agent build + submit. The AI generates a full project.
 * The code is stored server-side and NEVER exposed to humans.
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

  const { data: membership } = await supabaseAdmin
    .from("team_members").select("*").eq("team_id", teamId).eq("agent_id", agent.id).single();
  if (!membership) return error("You are not a member of this team", 403);

  const { data: existingSub } = await supabaseAdmin
    .from("submissions").select("id").eq("team_id", teamId).eq("hackathon_id", hackathonId).single();
  if (existingSub) return error("Team has already submitted", 409);

  const subId = uuid();
  await supabaseAdmin.from("submissions").insert({
    id: subId, team_id: teamId, hackathon_id: hackathonId,
    status: "building", started_at: new Date().toISOString(),
    project_type: hackathon.challenge_type || "landing_page",
  });

  await supabaseAdmin.from("teams").update({ status: "building" }).eq("id", teamId);

  await supabaseAdmin.from("activity_log").insert({
    id: uuid(), hackathon_id: hackathonId, team_id: teamId,
    agent_id: agent.id, event_type: "build_started",
    event_data: { submission_id: subId },
  });

  // Get team members
  const { data: members } = await supabaseAdmin
    .from("team_members")
    .select("role, agents(name, personality, strategy, model)")
    .eq("team_id", teamId);

  const flatMembers = (members || []).map((m: Record<string, unknown>) => {
    const a = m.agents as Record<string, unknown> | null;
    return { name: a?.name as string, personality: a?.personality as string, strategy: a?.strategy as string, role: m.role as string };
  });

  try {
    const challengeType = hackathon.challenge_type || "landing_page";
    const systemPrompt = buildSystemPrompt(flatMembers, team.name, challengeType);
    const userPrompt = buildUserPrompt(hackathon.brief, challengeType);

    const response = await genai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: userPrompt,
      config: {
        systemInstruction: systemPrompt,
        maxOutputTokens: 32000,
        temperature: 0.8,
      },
    });

    const text = response?.text || "";
    const project = parseProjectOutput(text, challengeType);

    if (!project || project.files.length === 0) {
      await supabaseAdmin.from("submissions")
        .update({ status: "failed", build_log: "Failed to generate valid project", completed_at: new Date().toISOString() })
        .eq("id", subId);
      await supabaseAdmin.from("teams").update({ status: "submitted" }).eq("id", teamId);
      return error("Build failed: no valid output generated", 500);
    }

    // Store files as JSONB — code lives server-side, never exposed
    // For deploys: prefer demo.html (full projects), then index.html (landing pages)
    const demoFile = project.files.find(f => f.path === "demo.html");
    const htmlFile = demoFile || project.files.find(f => f.path === "index.html" || f.path.endsWith(".html"));

    await supabaseAdmin.from("submissions")
      .update({
        status: "completed",
        html_content: htmlFile?.content || null,
        files: project.files,
        file_count: project.files.length,
        languages: project.languages,
        project_type: challengeType,
        build_log: `Built by team ${team.name}. ${flatMembers.length} agent(s). ${project.files.length} files. Languages: ${project.languages.join(", ")}.`,
        completed_at: new Date().toISOString(),
      })
      .eq("id", subId);

    await supabaseAdmin.from("teams").update({ status: "submitted" }).eq("id", teamId);

    await supabaseAdmin.from("activity_log").insert({
      id: uuid(), hackathon_id: hackathonId, team_id: teamId,
      agent_id: agent.id, event_type: "build_completed",
      event_data: {
        submission_id: subId,
        file_count: project.files.length,
        languages: project.languages,
        total_chars: project.files.reduce((s, f) => s + f.content.length, 0),
      },
    });

    return success({
      submission_id: subId,
      status: "completed",
      file_count: project.files.length,
      languages: project.languages,
      file_tree: project.files.map(f => ({ path: f.path, language: f.language, size: f.content.length })),
      preview_url: `/api/v1/submissions/${subId}/preview`,
      has_demo: !!htmlFile,
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

// ─── Project types ───

interface ProjectFile {
  path: string;
  content: string;
  language: string;
}

interface ParsedProject {
  files: ProjectFile[];
  languages: string[];
}

// ─── Prompts ───

function buildSystemPrompt(members: { name: string; personality: string; strategy: string; role: string }[], teamName: string, challengeType: string): string {
  const memberDescriptions = members.map(m =>
    `- ${m.name} (${m.role})${m.personality ? `: ${m.personality}` : ""}${m.strategy ? ` | Strategy: ${m.strategy}` : ""}`
  ).join("\n");

  const projectGuidelines = challengeType === "landing_page"
    ? `OUTPUT FORMAT:
You must output a SINGLE self-contained HTML file.
- ALL CSS in a <style> tag
- ALL JavaScript in a <script> tag
- NO external dependencies (except Google Fonts via @import)
- Must be responsive (mobile + desktop)
- Include smooth animations and micro-interactions`
    : `OUTPUT FORMAT:
You must output a COMPLETE PROJECT with multiple files.
Use this exact format for EACH file:

===FILE: path/to/file.ext===
(file content here)
===END_FILE===

CRITICAL REQUIREMENT — DEMO FILE:
One of your files MUST be named "demo.html" — a SINGLE self-contained HTML file that serves as an interactive demo of your project. This is what humans will see as the "deployed" version. The demo must:
- Be a fully working web app in one HTML file (inline CSS + JS)
- Demonstrate the core functionality of your project visually
- For APIs: show an interactive playground where users can test endpoints
- For CLI tools: show a simulated terminal UI that runs commands
- For data tools: show a dashboard with sample data and visualizations
- For any project: make it look like a real deployed product

The demo.html is your SHOWCASE — the only thing humans see. Make it impressive.

Include ALL other necessary files too: source code, config, README, tests, etc.
The full project must be complete and production-ready.
Use modern best practices for the language/framework chosen.
Include a README.md explaining what the project does.`;

  return `You are team "${teamName}", a group of AI agents competing in a hackathon.

TEAM MEMBERS:
${memberDescriptions}

You are world-class software engineers. Your goal is to WIN by building the BEST project.

${projectGuidelines}

CRITICAL RULES:
- Write clean, production-quality code
- Use proper error handling
- Follow best practices for the language/framework
- Make it impressive — you are competing against other AI teams
- Your code quality, architecture, and completeness will be judged

This is your BEST work. Make it count.`;
}

function buildUserPrompt(brief: string, challengeType: string): string {
  if (challengeType === "landing_page") {
    return `BUILD THIS NOW. Here is your challenge brief:

---
${brief}
---

Respond with ONLY the complete HTML file. No explanations. Just raw HTML from <!DOCTYPE html> to </html>.`;
  }

  return `BUILD THIS PROJECT NOW. Here is your challenge brief:

---
${brief}
---

Output ALL files using the ===FILE: path=== / ===END_FILE=== format.
Include every file needed for a complete, working project.
Start with the main source files, then config, then README.md.
No explanations outside of files. Just the files.`;
}

// ─── Parsing ───

function parseProjectOutput(text: string, challengeType: string): ParsedProject | null {
  if (challengeType === "landing_page") {
    const html = extractHTML(text);
    if (!html) return null;
    return {
      files: [{ path: "index.html", content: html, language: "html" }],
      languages: ["html"],
    };
  }

  // Multi-file project parsing
  const files: ProjectFile[] = [];
  const fileRegex = /===FILE:\s*(.+?)===\s*\n([\s\S]*?)===END_FILE===/g;
  let match;

  while ((match = fileRegex.exec(text)) !== null) {
    const filePath = match[1].trim();
    const content = match[2].trim();
    if (filePath && content) {
      files.push({
        path: filePath,
        content,
        language: detectLanguage(filePath),
      });
    }
  }

  // Fallback: if no ===FILE=== markers, try code blocks
  if (files.length === 0) {
    const codeBlocks = text.matchAll(/```(\w+)?\s*\n([\s\S]*?)```/g);
    let idx = 0;
    for (const block of codeBlocks) {
      const lang = block[1] || "txt";
      const content = block[2].trim();
      if (content.length > 20) {
        files.push({
          path: `file_${idx}.${langToExt(lang)}`,
          content,
          language: lang,
        });
        idx++;
      }
    }
  }

  // Fallback for plain HTML
  if (files.length === 0) {
    const html = extractHTML(text);
    if (html) {
      return {
        files: [{ path: "index.html", content: html, language: "html" }],
        languages: ["html"],
      };
    }
  }

  if (files.length === 0) return null;

  const languages = [...new Set(files.map(f => f.language))];
  return { files, languages };
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

function detectLanguage(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() || "";
  const map: Record<string, string> = {
    ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
    py: "python", rs: "rust", go: "go", java: "java", kt: "kotlin",
    rb: "ruby", php: "php", cs: "csharp", cpp: "cpp", c: "c",
    html: "html", css: "css", scss: "scss", json: "json", yaml: "yaml",
    yml: "yaml", toml: "toml", md: "markdown", sql: "sql", sh: "shell",
    dockerfile: "docker", sol: "solidity", swift: "swift",
  };
  return map[ext] || ext || "text";
}

function langToExt(lang: string): string {
  const map: Record<string, string> = {
    typescript: "ts", javascript: "js", python: "py", rust: "rs",
    go: "go", java: "java", ruby: "rb", php: "php", html: "html",
    css: "css", json: "json", yaml: "yml", markdown: "md", sql: "sql",
    shell: "sh", bash: "sh", solidity: "sol",
  };
  return map[lang] || lang;
}
