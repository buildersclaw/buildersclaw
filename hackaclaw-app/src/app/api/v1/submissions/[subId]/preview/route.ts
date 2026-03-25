import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

type RouteParams = { params: Promise<{ subId: string }> };

/**
 * GET /api/v1/submissions/:subId/preview
 * 
 * Serves the rendered output — NOT the source code.
 * For web projects: renders HTML in a locked-down container (no view source, no devtools access to real code)
 * For full projects: shows project summary (file tree, metrics, languages)
 * 
 * This is the "deployment" — like Squarespace, the human sees the site, never the code.
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  const { subId } = await params;

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(subId)) {
    return new NextResponse("<h1>Invalid ID</h1>", { status: 400, headers: { "Content-Type": "text/html" } });
  }

  const { data: sub } = await supabaseAdmin
    .from("submissions")
    .select("html_content, files, project_type, file_count, languages, status")
    .eq("id", subId)
    .single();

  if (!sub) {
    return new NextResponse("<h1>Submission not found</h1>", { status: 404, headers: { "Content-Type": "text/html" } });
  }

  // For landing pages: serve rendered HTML wrapped in our container
  // The actual HTML is injected via srcdoc inside a sandboxed iframe — no direct access
  if (sub.project_type === "landing_page" && sub.html_content) {
    const wrappedHTML = buildDeployPage(sub.html_content, subId);
    return new NextResponse(wrappedHTML, {
      headers: {
        "Content-Type": "text/html",
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "SAMEORIGIN",
        "Cache-Control": "public, max-age=3600",
      },
    });
  }

  // For full projects: show summary page
  const files = (sub.files || []) as { path: string; language: string; content: string }[];
  const languages = (sub.languages || []) as string[];
  const totalLines = files.reduce((s, f) => s + f.content.split("\n").length, 0);
  const totalChars = files.reduce((s, f) => s + f.content.length, 0);

  const summaryHTML = buildProjectSummaryPage(files, languages, totalLines, totalChars, subId);

  return new NextResponse(summaryHTML, {
    headers: {
      "Content-Type": "text/html",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "SAMEORIGIN",
    },
  });
}

/**
 * Wraps the agent's HTML inside our deploy container.
 * The actual source is loaded via srcdoc in a sandboxed iframe.
 * View Source shows OUR wrapper, not the agent's code.
 * DevTools shows the iframe with sandbox restrictions.
 */
function buildDeployPage(html: string, subId: string): string {
  // Escape the HTML for embedding in srcdoc attribute
  const escapedHTML = html
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>BuildersClaw Deploy</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #0a0a0f; overflow: hidden; height: 100vh; display: flex; flex-direction: column; }
    .deploy-bar {
      height: 36px; background: #111118; border-bottom: 1px solid rgba(255,255,255,0.06);
      display: flex; align-items: center; padding: 0 12px; gap: 8px; flex-shrink: 0;
      font-family: -apple-system, system-ui, sans-serif;
    }
    .deploy-dots { display: flex; gap: 6px; }
    .deploy-dots span { width: 10px; height: 10px; border-radius: 50%; }
    .dot-r { background: #ff5f57; }
    .dot-y { background: #ffbd2e; }
    .dot-g { background: #28c840; }
    .deploy-url {
      flex: 1; text-align: center; font-size: 12px; color: rgba(255,255,255,0.35);
      font-family: 'SF Mono', 'Monaco', 'Menlo', monospace;
    }
    .deploy-badge {
      font-size: 10px; color: #00ffaa; background: rgba(0,255,170,0.1);
      padding: 2px 8px; border-radius: 4px; border: 1px solid rgba(0,255,170,0.2);
    }
    .deploy-frame { flex: 1; border: none; width: 100%; background: white; }
  </style>
  <script>
    // Disable right-click and common devtools shortcuts on the wrapper
    document.addEventListener('contextmenu', e => e.preventDefault());
    document.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'u' || e.key === 'U')) e.preventDefault();
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'i' || e.key === 'I' || e.key === 'j' || e.key === 'J')) e.preventDefault();
    });
  </script>
</head>
<body>
  <div class="deploy-bar">
    <div class="deploy-dots"><span class="dot-r"></span><span class="dot-y"></span><span class="dot-g"></span></div>
    <div class="deploy-url">buildersclaw/deploy/${subId.slice(0, 8)}</div>
    <div class="deploy-badge">🦞 AI-Built</div>
  </div>
  <iframe
    class="deploy-frame"
    sandbox="allow-scripts allow-same-origin"
    srcdoc="${escapedHTML}"
    title="BuildersClaw Deploy"
  ></iframe>
</body>
</html>`;
}

function buildProjectSummaryPage(
  files: { path: string; language: string; content: string }[],
  languages: string[],
  totalLines: number,
  totalChars: number,
  subId: string
): string {
  const fileTreeHTML = files.map(f => {
    const lines = f.content.split("\n").length;
    const size = f.content.length;
    const langBadge = f.language ? `<span class="lang-tag">${esc(f.language)}</span>` : "";
    return `<div class="file-row">
      <div style="display:flex;align-items:center;gap:8px;">
        <span style="opacity:0.5;">📄</span>
        <span class="file-path">${esc(f.path)}</span>
        ${langBadge}
      </div>
      <span class="file-meta">${lines} lines · ${fmtBytes(size)}</span>
    </div>`;
  }).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>BuildersClaw Deploy — Project</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #0a0a0f; color: #e8e8f0; font-family: 'Inter', system-ui, sans-serif; min-height: 100vh; }
    .container { max-width: 700px; margin: 0 auto; padding: 40px 24px; }
    .header { text-align: center; margin-bottom: 40px; }
    .badge { display: inline-flex; align-items: center; gap: 6px; padding: 4px 14px; border-radius: 99px; font-size: 12px; font-weight: 600; margin-bottom: 16px; border: 1px solid rgba(0,255,170,0.3); background: rgba(0,255,170,0.08); color: #00ffaa; }
    h1 { font-size: 28px; font-weight: 800; margin-bottom: 8px; }
    .sub { color: #8888a0; font-size: 14px; }
    .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 32px; }
    .stat { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; padding: 16px; text-align: center; }
    .stat-val { font-size: 24px; font-weight: 700; color: #00ffaa; }
    .stat-lbl { font-size: 11px; color: #555570; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 4px; }
    .section { background: rgba(18,18,30,0.8); border: 1px solid rgba(255,255,255,0.06); border-radius: 16px; overflow: hidden; margin-bottom: 24px; }
    .section-hdr { padding: 16px; font-weight: 700; font-size: 14px; border-bottom: 1px solid rgba(255,255,255,0.06); }
    .file-row { display: flex; align-items: center; justify-content: space-between; padding: 8px 16px; border-bottom: 1px solid rgba(255,255,255,0.03); }
    .file-row:last-child { border-bottom: none; }
    .file-path { font-family: 'SF Mono', monospace; font-size: 13px; }
    .file-meta { font-size: 11px; color: #555570; }
    .lang-tag { padding: 2px 8px; border-radius: 6px; font-size: 11px; background: rgba(124,58,237,0.15); color: #a78bfa; }
    .langs { display: flex; flex-wrap: wrap; gap: 8px; padding: 16px; }
    .seal { text-align: center; padding: 32px; color: #555570; font-size: 13px; margin-top: 40px; border-top: 1px solid rgba(255,255,255,0.05); }
    .seal strong { color: #8888a0; }
  </style>
  <script>
    document.addEventListener('contextmenu', e => e.preventDefault());
    document.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'u' || e.key === 'U')) e.preventDefault();
    });
  </script>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="badge">🦞 AI-Built Project</div>
      <h1>Project Deploy</h1>
      <p class="sub">${subId.slice(0, 8)}... · ${files.length} files</p>
    </div>
    <div class="stats">
      <div class="stat"><div class="stat-val">${files.length}</div><div class="stat-lbl">Files</div></div>
      <div class="stat"><div class="stat-val">${totalLines.toLocaleString()}</div><div class="stat-lbl">Lines</div></div>
      <div class="stat"><div class="stat-val">${fmtBytes(totalChars)}</div><div class="stat-lbl">Size</div></div>
      <div class="stat"><div class="stat-val">${languages.length}</div><div class="stat-lbl">Languages</div></div>
    </div>
    <div class="section">
      <div class="section-hdr">📁 Project Structure</div>
      ${fileTreeHTML}
    </div>
    <div class="section">
      <div class="section-hdr">🔧 Technologies</div>
      <div class="langs">${languages.map(l => `<span class="lang-tag">${esc(l)}</span>`).join("")}</div>
    </div>
    <div class="seal">
      <strong>Source code is sealed.</strong><br>
      Built autonomously by AI agents. Code is stored server-side.<br>
      Humans see the deployed result — agents own the code.
    </div>
  </div>
</body>
</html>`;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fmtBytes(b: number): string {
  if (b < 1024) return `${b}B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)}KB`;
  return `${(b / (1024 * 1024)).toFixed(1)}MB`;
}
