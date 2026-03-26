/**
 * E2E test: Full hackathon flow with repo-based judging.
 */

const BASE = "https://buildersclaw.vercel.app";

async function api(method, path, body, apiKey) {
  const headers = { "Content-Type": "application/json" };
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
  
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    redirect: "follow",
  });
  
  return res.json();
}

function log(emoji, msg) { console.log(`\n${emoji}  ${msg}`); }

async function main() {
  log("🏗️", "=== E2E TEST: Repo-Based Judging ===");

  const ts = Date.now();

  // ── Step 1: Register creator + create hackathon ──
  log("1️⃣", "Registering creator agent...");
  const creator = await api("POST", "/api/v1/agents/register", {
    name: `e2e_creator_${ts}`, display_name: "E2E Creator", model: "gemini",
  });
  const creatorKey = creator.data?.agent?.api_key;
  console.log(`Creator key: ${creatorKey?.slice(0,20)}...`);

  // Hackathon with 5 min deadline so we can trigger judging
  const endsAt = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 min from now
  
  log("1️⃣", "Creating hackathon with enterprise context...");
  const h = await api("POST", "/api/v1/hackathons", {
    title: "Invoice Parser Challenge — E2E Test",
    description: "Enterprise hackathon: Build an AI invoice parser",
    brief: "Build a tool that takes PDF invoices and extracts structured JSON data. Must handle vendor name, invoice number, dates, line items, and totals. Should use AI for intelligent extraction and have proper error handling. Must include a REST API endpoint.",
    rules: "Must be TypeScript or Python. Must include tests. Must have a README with setup instructions.",
    entry_fee: 0,
    prize_pool: 500,
    max_participants: 10,
    build_time_seconds: 180,
    challenge_type: "api",
    ends_at: endsAt,
    judging_criteria: JSON.stringify({
      _format: "hackaclaw-mvp-v1",
      enterprise_problem: "We need to automate invoice processing. Currently 3 people spend 20h/week manually extracting data from PDFs.",
      enterprise_requirements: "TypeScript or Python. REST API. Handle edge cases. Tests required.",
      judging_priorities: "Brief compliance is critical. Code quality and testing > UI. No hardcoded API keys.",
      prize_amount: 500,
      company: "E2E Test Corp",
    }),
  }, creatorKey);

  if (!h.success) { console.error("Failed:", JSON.stringify(h)); process.exit(1); }
  const hId = h.data.id;
  console.log(`✓ Hackathon: ${hId}`);
  console.log(`  URL: ${BASE}/hackathons/${hId}`);

  // ── Step 2: Register builder agents ──
  log("2️⃣", "Registering builder agents...");
  
  const a1 = await api("POST", "/api/v1/agents/register", {
    name: `builder_alpha_${ts}`, display_name: "Builder Alpha 🔷", model: "gemini",
  });
  const key1 = a1.data?.agent?.api_key;
  console.log(`Agent 1: ${a1.data?.agent?.id}`);

  const a2 = await api("POST", "/api/v1/agents/register", {
    name: `builder_beta_${ts}`, display_name: "Builder Beta 🔶", model: "openai",
  });
  const key2 = a2.data?.agent?.api_key;
  console.log(`Agent 2: ${a2.data?.agent?.id}`);

  // ── Step 3: Join hackathon ──
  log("3️⃣", "Agents joining hackathon...");

  const j1 = await api("POST", `/api/v1/hackathons/${hId}/join`, {
    name: "Invoice Parser Pro", color: "#00c2a8",
  }, key1);
  const team1Id = j1.data?.team?.id;
  console.log(`Agent 1 joined: team=${team1Id} ✓`);

  const j2 = await api("POST", `/api/v1/hackathons/${hId}/join`, {
    name: "PDF Wizard", color: "#ff8a00",
  }, key2);
  const team2Id = j2.data?.team?.id;
  console.log(`Agent 2 joined: team=${team2Id} ✓`);

  // ── Step 4: Submit repo links ──
  log("4️⃣", "Submitting repository links...");

  const s1 = await api("POST", `/api/v1/hackathons/${hId}/teams/${team1Id}/submit`, {
    repo_url: "https://github.com/MartinPuli/hackaclaw-test-invoice-parser",
    notes: "Complete TypeScript implementation with tests, Dockerfile, and REST API.",
  }, key1);
  console.log(`Agent 1 submit: ${s1.success ? '✓ ' + s1.data?.submission_id : '✗ ' + JSON.stringify(s1)}`);

  const s2 = await api("POST", `/api/v1/hackathons/${hId}/teams/${team2Id}/submit`, {
    repo_url: "https://github.com/MartinPuli/hackaclaw-test-invoice-parser",
    notes: "Same repo for test (in prod each builder submits their own).",
  }, key2);
  console.log(`Agent 2 submit: ${s2.success ? '✓ ' + s2.data?.submission_id : '✗ ' + JSON.stringify(s2)}`);

  // ── Step 5: Re-submit (test update before deadline) ──
  log("5️⃣", "Testing re-submission (update before deadline)...");
  const resubmit = await api("POST", `/api/v1/hackathons/${hId}/teams/${team1Id}/submit`, {
    repo_url: "https://github.com/MartinPuli/hackaclaw-test-invoice-parser",
    notes: "Updated submission — added more tests.",
  }, key1);
  console.log(`Re-submit: ${resubmit.success ? '✓ updated=' + resubmit.data?.updated : '✗ ' + JSON.stringify(resubmit)}`);

  // ── Step 6: Check state ──
  log("6️⃣", "Checking hackathon state...");
  const state = await api("GET", `/api/v1/hackathons/${hId}`);
  console.log(`Status: ${state.data?.status}, Teams: ${state.data?.total_teams}, Agents: ${state.data?.total_agents}`);

  const lb = await api("GET", `/api/v1/hackathons/${hId}/judge`);
  if (lb.data) {
    for (const t of lb.data) {
      console.log(`  - ${t.team_name}: status=${t.status}, repo=${t.repo_url || t.project_url || 'none'}`);
    }
  }

  // ── Step 7: Trigger judging via admin finalize ──
  log("7️⃣", "Triggering AI judging via admin finalize...");
  console.log("This will fetch repos from GitHub and analyze code (~30-60s)...");

  // The finalize endpoint needs ADMIN_API_KEY
  const adminKey = process.env.ADMIN_API_KEY;
  if (!adminKey) {
    console.log("⚠️  ADMIN_API_KEY not set — triggering via cron endpoint instead...");
    
    // Close the hackathon first by setting ends_at to past
    // We'll use Supabase directly... or just call the cron
    const cronRes = await api("GET", "/api/v1/cron/judge");
    console.log(`Cron result: ${JSON.stringify(cronRes).slice(0, 300)}`);
  } else {
    const judgeRes = await api("POST", `/api/v1/admin/hackathons/${hId}/finalize`, {}, adminKey);
    console.log(`Judge result: ${JSON.stringify(judgeRes).slice(0, 300)}`);
  }

  // ── Step 8: Final results ──
  log("8️⃣", "Checking final results...");
  const final = await api("GET", `/api/v1/hackathons/${hId}`);
  console.log(`Final status: ${final.data?.status}`);

  const finalLb = await api("GET", `/api/v1/hackathons/${hId}/judge`);
  if (finalLb.data) {
    console.log("\n=== FINAL LEADERBOARD ===");
    for (const t of finalLb.data) {
      console.log(`  🏆 ${t.team_name}`);
      console.log(`     Score: ${t.total_score ?? 'pending'}/100`);
      console.log(`     Repo: ${t.repo_url || t.project_url || 'none'}`);
      if (t.judge_feedback) console.log(`     Feedback: ${t.judge_feedback?.slice(0, 200)}...`);
      console.log();
    }
  }

  log("✅", `DONE! View: ${BASE}/hackathons/${hId}`);
  console.log(`\nIMPORTANT: The new deploy should show repo links when clicking teams.`);
  console.log(`If judging didn't trigger (no ADMIN_KEY), the cron will pick it up when ends_at passes.`);
}

main().catch(console.error);
