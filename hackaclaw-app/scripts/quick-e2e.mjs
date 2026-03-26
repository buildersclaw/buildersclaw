/**
 * Quick E2E: Create hackathon, join, submit, judge — all in one script.
 */

const BASE = "https://buildersclaw.vercel.app";

async function api(method, path, body, apiKey) {
  const h = { "Content-Type": "application/json" };
  if (apiKey) h["Authorization"] = `Bearer ${apiKey}`;
  const r = await fetch(`${BASE}${path}`, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  return r.json();
}

async function main() {
  const ts = Date.now();
  console.log("=== Quick E2E: repo submission + judging ===\n");

  // 1. Register creator
  const c = await api("POST", "/api/v1/agents/register", { name: `qe2e_creator_${ts}`, display_name: "Creator", model: "gemini" });
  const cKey = c.data.agent.api_key;
  console.log(`Creator: ${c.data.agent.id}`);

  // 2. Create hackathon
  const h = await api("POST", "/api/v1/hackathons", {
    title: `Invoice Parser E2E ${ts}`,
    brief: "Build a PDF invoice parser that outputs structured JSON. Must have REST API, tests, and handle edge cases.",
    rules: "TypeScript. Include tests.",
    entry_fee: 0, prize_pool: 500, max_participants: 10, challenge_type: "api",
    ends_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    judging_criteria: JSON.stringify({
      _format: "hackaclaw-mvp-v1",
      enterprise_problem: "Automate invoice processing — extract structured data from PDFs.",
      enterprise_requirements: "TypeScript, REST API, tests, handle edge cases.",
      judging_priorities: "Brief compliance > code quality > testing. No hardcoded keys.",
      prize_amount: 500, company: "E2E Test Corp",
    }),
  }, cKey);
  const hId = h.data.id;
  console.log(`Hackathon: ${hId}`);

  // 3. Register + join + submit — Agent 1
  const a1 = await api("POST", "/api/v1/agents/register", { name: `qe2e_alpha_${ts}`, display_name: "Alpha 🔷", model: "gemini" });
  const k1 = a1.data.agent.api_key;
  const j1 = await api("POST", `/api/v1/hackathons/${hId}/join`, { name: "Invoice Parser Pro", color: "#00c2a8" }, k1);
  const t1 = j1.data.team.id;
  const s1 = await api("POST", `/api/v1/hackathons/${hId}/teams/${t1}/submit`, {
    repo_url: "https://github.com/MartinPuli/hackaclaw-test-invoice-parser",
    notes: "Full TypeScript implementation with tests and Dockerfile.",
  }, k1);
  console.log(`Agent 1 submitted: ${s1.success ? '✓' : '✗ ' + JSON.stringify(s1)}`);

  // 4. Register + join + submit — Agent 2
  const a2 = await api("POST", "/api/v1/agents/register", { name: `qe2e_beta_${ts}`, display_name: "Beta 🔶", model: "openai" });
  const k2 = a2.data.agent.api_key;
  const j2 = await api("POST", `/api/v1/hackathons/${hId}/join`, { name: "PDF Wizard", color: "#ff8a00" }, k2);
  const t2 = j2.data.team.id;
  const s2 = await api("POST", `/api/v1/hackathons/${hId}/teams/${t2}/submit`, {
    repo_url: "https://github.com/MartinPuli/hackaclaw-test-invoice-parser",
    notes: "Same repo (testing purposes).",
  }, k2);
  console.log(`Agent 2 submitted: ${s2.success ? '✓' : '✗ ' + JSON.stringify(s2)}`);

  // 5. Check state
  const lb = await api("GET", `/api/v1/hackathons/${hId}/judge`);
  console.log(`\nLeaderboard before judging (${lb.data?.length} teams):`);
  for (const t of lb.data || []) {
    console.log(`  ${t.team_name}: status=${t.status}, repo=${t.repo_url || 'none'}`);
  }

  // 6. Trigger judging (creator can do this)
  console.log(`\n⚖️  Triggering AI judging... (this fetches repos from GitHub and analyzes ~150KB of code)`);
  console.log("   Expected time: 30-90 seconds\n");

  const judge = await api("POST", `/api/v1/admin/hackathons/${hId}/judge`, {}, cKey);
  
  if (judge.success) {
    console.log("✅ JUDGING COMPLETE!\n");
    if (judge.data?.leaderboard) {
      for (const t of judge.data.leaderboard) {
        console.log(`  🏆 ${t.team_name}: ${t.total_score}/100 ${t.winner ? '👑 WINNER' : ''}`);
        console.log(`     Repo: ${t.repo_url || 'none'}`);
        if (t.judge_feedback) console.log(`     Feedback: ${t.judge_feedback.slice(0, 150)}...`);
        console.log();
      }
    }
  } else {
    console.log(`❌ Judging failed: ${JSON.stringify(judge)}`);
  }

  console.log(`\n🔗 View: ${BASE}/hackathons/${hId}`);
}

main().catch(console.error);
