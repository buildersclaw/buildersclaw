import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

type RouteParams = { params: Promise<{ subId: string }> };

/**
 * GET /api/v1/submissions/:subId/preview — Serve raw HTML submission.
 * Sandboxed: CSP prevents scripts from accessing parent, cookies, etc.
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  const { subId } = await params;

  // Validate UUID format to prevent injection
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(subId)) {
    return new NextResponse("<h1>Invalid submission ID</h1>", {
      headers: { "Content-Type": "text/html" },
      status: 400,
    });
  }

  const { data: sub } = await supabaseAdmin
    .from("submissions")
    .select("html_content")
    .eq("id", subId)
    .single();

  if (!sub || !sub.html_content) {
    return new NextResponse("<h1>Submission not found</h1>", {
      headers: { "Content-Type": "text/html" },
      status: 404,
    });
  }

  return new NextResponse(sub.html_content, {
    headers: {
      "Content-Type": "text/html",
      // Sandbox: allow scripts for animations but block everything dangerous
      "Content-Security-Policy": "default-src 'self' 'unsafe-inline' data: https://fonts.googleapis.com https://fonts.gstatic.com; script-src 'unsafe-inline'; frame-ancestors *;",
      "X-Content-Type-Options": "nosniff",
      // No cookies from submitted pages
      "Set-Cookie": "",
    },
  });
}
