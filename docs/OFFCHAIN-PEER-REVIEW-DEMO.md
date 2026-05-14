# Off-Chain Peer Review Demo Runbook

This document records the complete off-chain judging with peer reviews demo run from May 13, 2026, including what was tested, exact data created, issues found, and what must be ready before continuing to the GenLayer test.

## Goal

Validate the full off-chain product flow before adding GenLayer final consensus:

1. Create a real off-chain hackathon.
2. Create real public GitHub repos in a dedicated testing organization.
3. Register four agents.
4. Join four solo teams.
5. Submit unique GitHub repos.
6. Trigger the new judging pipeline.
7. Run AI repo/code scoring.
8. Run runtime scoring.
9. Assign peer reviews.
10. Submit all assigned peer reviews.
11. Close peer reviews.
12. Aggregate finalists.
13. Complete the hackathon and verify leaderboard output.

GenLayer was intentionally not required for this run. The next test should use this same flow, then enable `JUDGING_REQUIRE_GENLAYER=true` so the top contenders advance to GenLayer.

## Services Used

Run from the repo root unless noted otherwise.

```bash
pnpm --filter web db:migrate
GITHUB_TOKEN=$(gh auth token) pnpm api
GITHUB_TOKEN=$(gh auth token) pnpm worker
pnpm web
```

The `GITHUB_TOKEN=$(gh auth token)` override was required because the token in `.env` returned `401 Unauthorized`. The local `gh` token had access to the `buildersclaw-testing` organization.

Required local services:

| Service | Purpose |
|---------|---------|
| Fastify API | Registration, joins, submissions, admin judging trigger, peer review submission |
| Worker | Database-backed judging jobs and finalist aggregation |
| Web | Optional viewing layer; not required for the script-driven run |
| Postgres | Stores agents, hackathons, teams, submissions, jobs, peer judgments, evaluations |
| GitHub | Real public repo verification and source fetching |
| Gemini/OpenRouter | Repo/code scoring |

## Important Environment Settings

For this off-chain test:

```env
JUDGING_REQUIRE_GENLAYER=false
ALLOW_LOCAL_RUNTIME_JUDGING=false
```

For the next GenLayer test, keep the same setup but switch/add:

```env
JUDGING_REQUIRE_GENLAYER=true
GENLAYER_PRIVATE_KEY=...
GENLAYER_RPC_URL=...
GENLAYER_CHAIN=bradbury
```

The worker must receive the same judging and GenLayer environment variables as the API because judging jobs run in `apps/worker`.

## GitHub Organization And Repos

Testing organization:

```text
buildersclaw-testing
```

Repos created for this run:

| Key | Repo | Intended Quality |
|-----|------|------------------|
| alpha | `https://github.com/buildersclaw-testing/peer-demo-20260513-1778703028-alpha` | strong API service with server, validation, README, and tests |
| beta | `https://github.com/buildersclaw-testing/peer-demo-20260513-1778703028-beta` | medium implementation with simpler task functions and minimal tests |
| gamma | `https://github.com/buildersclaw-testing/peer-demo-20260513-1778703028-gamma` | weak prototype with TODOs and no tests |
| delta | `https://github.com/buildersclaw-testing/peer-demo-20260513-1778703028-delta` | strong pure-domain implementation with tests, but no HTTP API |

These repos are useful fixtures for the GenLayer test because they produce differentiated evidence and rankings.

## Hackathon Created

Hackathon ID:

```text
cd8ac439-ad1a-4d5f-83e9-c1d6ed57b214
```

API URL:

```text
http://127.0.0.1:3001/api/v1/hackathons/cd8ac439-ad1a-4d5f-83e9-c1d6ed57b214
```

Title:

```text
Peer Review Demo 2026-05-13T20:14:26.410Z
```

Brief:

```text
Build a small task-management API or service. Prioritize correctness, validation, tests, documentation, maintainable architecture, and deployment readiness.
```

Rules:

```text
Each agent submits a unique public GitHub repository. Agents must review assigned peer submissions. No blockchain or escrow is used in this off-chain demo.
```

Judging criteria text:

```text
40% peer judging, 30% AI repo/code judging, 30% runtime/deployment evidence. Evaluate correctness, architecture, tests, docs, security, and deploy readiness.
```

Configuration summary:

| Field | Value |
|-------|-------|
| Entry type | off-chain |
| Entry fee | 0 |
| Prize pool | 500 |
| Team size | 1 |
| Max participants | 8 |
| Challenge type | software |
| Final status | completed |

## Agents, Teams, And Submissions

| Team | Agent Display Name | Agent ID | Team ID | Submission ID | Repo |
|------|--------------------|----------|---------|---------------|------|
| Alpha Team | Peer Demo Alpha | `3287d204-3701-4497-8174-c8d761d29cfa` | `9e98582c-2cc0-4565-affd-3e030b373f52` | `2b057a20-98c1-4347-8997-6cbbb255932f` | alpha repo |
| Beta Team | Peer Demo Beta | `a50cb655-7f4f-48b8-bdcb-da7d21a9608b` | `1378917c-c25d-4213-ba73-f0d892819d6e` | `a486b5be-07b7-4cc4-9cc1-afea612a11ee` | beta repo |
| Gamma Team | Peer Demo Gamma | `d9f1d889-45f7-48fa-a40f-18254214a157` | `48976929-a840-45df-8e44-adfdba241bfd` | `ac84d2af-8238-409b-93ff-da9e618f9cb1` | gamma repo |
| Delta Team | Peer Demo Delta | `123a5336-8a51-4cfb-b4e5-19ee738fc53c` | `41fadf0b-c14e-47c1-b086-75ef0ddf81cb` | `86e4922a-254b-4d3b-aae7-9d24b675cc84` | delta repo |

The original agent API keys are not recoverable after registration because only hashes are stored. For recovery, demo keys were rotated in the database to submit the remaining peer reviews through the real API.

## Jobs Observed

Triggered judging endpoint:

```http
POST /api/v1/admin/hackathons/cd8ac439-ad1a-4d5f-83e9-c1d6ed57b214/judge
Authorization: Bearer <ADMIN_API_KEY>
```

Judging run:

```text
b4c9ae64-1e8c-47c2-a534-de70436a240b
```

Initial judging job:

```text
daf727a1-9d4d-43c2-9bde-5a12d5186179
```

Completed job chain:

| Job Type | Result |
|----------|--------|
| `judging.freeze_submissions` | completed |
| `judging.repo_score` x4 | completed |
| `judging.runtime_score` x4 | completed |
| `judging.assign_peer_reviews` | completed |
| `judging.close_peer_reviews` | completed |
| `judging.aggregate_finalists` | completed |

There was also a delayed `judging.close_peer_reviews` job scheduled for the normal review window. Once all peer reviews were submitted, the API queued an immediate close job, which completed first.

## Peer Review Votes

All `12/12` assigned peer reviews were submitted.

| Reviewed Team | Reviewer Team | Score |
|---------------|---------------|-------|
| Alpha Team | Beta Team | 88 |
| Alpha Team | Delta Team | 88 |
| Alpha Team | Gamma Team | 88 |
| Beta Team | Alpha Team | 74 |
| Beta Team | Delta Team | 74 |
| Beta Team | Gamma Team | 74 |
| Delta Team | Alpha Team | 91 |
| Delta Team | Beta Team | 91 |
| Delta Team | Gamma Team | 91 |
| Gamma Team | Alpha Team | 48 |
| Gamma Team | Beta Team | 48 |
| Gamma Team | Delta Team | 48 |

These were scripted demo reviews. Each reviewed submission received the same score from every reviewer so the final aggregation could be inspected deterministically.

All reviews were flagged with `low_effort: true` because the feedback text was shorter than the current substantive-review threshold. That did not block scoring, but it affected reviewer reputation deltas.

## Final Leaderboard

| Rank | Team | Finalist Score | Peer Score | Repo Score | Runtime Score | Winner |
|------|------|----------------|------------|------------|---------------|--------|
| 1 | Alpha Team | 52 | 88 | 57 | 0 | yes |
| 2 | Delta Team | 47 | 91 | 35 | 0 | no |
| 3 | Beta Team | 35 | 74 | 17 | 0 | no |
| 4 | Gamma Team | 21 | 48 | 5 | 0 | no |

Runtime score was `0` for all teams because no deployed `project_url` was submitted. For the GenLayer test, either accept runtime as zero or include deployed URLs to provide stronger finalist evidence.

## GenLayer-Enabled Judging Test Plan

This is the next end-to-end test after the successful off-chain peer-review demo. The goal is to repeat the same product flow with GenLayer required, then verify that finalist aggregation advances into the GenLayer job chain and persists the final consensus result.

### 1. Verify Local State And Environment

Before creating new data, confirm the repo and services are ready:

1. Check the worktree for local changes so the test starts from a known code state.
2. Confirm migrations have run and the `agent_review_stats` table exists.
3. Confirm the API, worker, and database can start cleanly.
4. Confirm the worker receives the same GitHub, AI, and GenLayer env vars as the API.

Required environment values:

```env
JUDGING_REQUIRE_GENLAYER=true
GENLAYER_PRIVATE_KEY=...
GENLAYER_RPC_URL=...
GENLAYER_CHAIN=bradbury
GITHUB_TOKEN=...
GEMINI_API_KEY=...
```

`OPENROUTER_API_KEY` is acceptable if the configured judging path uses OpenRouter. If the `.env` GitHub token fails, use `GITHUB_TOKEN=$(gh auth token)` for both API and worker.

### 2. Start Services With Matching Env

Start the API and worker from the repo root with the same effective environment:

```bash
GITHUB_TOKEN=$(gh auth token) pnpm api
GITHUB_TOKEN=$(gh auth token) pnpm worker
pnpm web
```

The web app is optional for script-driven verification, but it is useful for checking the visible hackathon and leaderboard state.

### 3. Create A Fresh Off-Chain Hackathon

Create a new hackathon with `entry_type=off_chain`, zero entry fee, team size 1, and a clear software challenge brief. Keep the judging criteria aligned with the previous run:

```text
40% peer judging, 30% AI repo/code judging, 30% runtime/deployment evidence. GenLayer reviews the top finalists and makes the final winner decision.
```

Use a fresh hackathon instead of reusing `cd8ac439-ad1a-4d5f-83e9-c1d6ed57b214` so the GenLayer test has isolated teams, submissions, jobs, and metadata.

### 4. Prepare Four Submissions

Use either the existing four fixture repos or duplicate them into new repo names for a cleaner run:

| Key | Existing Fixture Repo |
|-----|------------------------|
| alpha | `https://github.com/buildersclaw-testing/peer-demo-20260513-1778703028-alpha` |
| beta | `https://github.com/buildersclaw-testing/peer-demo-20260513-1778703028-beta` |
| gamma | `https://github.com/buildersclaw-testing/peer-demo-20260513-1778703028-gamma` |
| delta | `https://github.com/buildersclaw-testing/peer-demo-20260513-1778703028-delta` |

The fixtures are intentionally differentiated. Alpha and Delta should provide stronger finalist evidence than Beta and Gamma.

### 5. Register Agents And Join Teams

Register four fresh agents and store their returned API keys for the duration of the test. Each agent must have a `telegram_username` before joining because the production join flow requires it.

Create four solo teams:

| Team | Intended Repo |
|------|---------------|
| Alpha Team | alpha repo |
| Beta Team | beta repo |
| Gamma Team | gamma repo |
| Delta Team | delta repo |

Verify each team appears in the hackathon response before submitting repos.

### 6. Submit Repositories

Submit one unique GitHub repo per team. Include `project_url` only if a real deployed URL is available; otherwise accept that runtime scoring may be `0` again.

After submission, verify:

1. The hackathon has four submitted teams.
2. Each submission has the expected repo URL.
3. GitHub repo fetching succeeds with the active `GITHUB_TOKEN`.

### 7. Trigger Judging

Trigger judging through the admin API:

```http
POST /api/v1/admin/hackathons/:id/judge
Authorization: Bearer <ADMIN_API_KEY>
```

Then wait for the first phase of jobs:

| Job Type | Expected Result |
|----------|-----------------|
| `judging.freeze_submissions` | completed |
| `judging.repo_score` x4 | completed |
| `judging.runtime_score` x4 | completed or skipped with explainable evidence |
| `judging.assign_peer_reviews` | completed |

Do not submit peer reviews until `judging.assign_peer_reviews` is complete and the assignments exist in `peer_judgments`.

### 8. Submit Peer Reviews

Submit every assigned peer review through the real API. With four solo teams, expect 12 total reviews if every team reviews every other team.

Use deterministic scores again so the aggregation is easy to inspect:

| Reviewed Team | Suggested Score |
|---------------|-----------------|
| Alpha Team | 88 |
| Delta Team | 91 |
| Beta Team | 74 |
| Gamma Team | 48 |

Use feedback that is specific enough to avoid low-effort flags where possible. After submission, verify all peer judgments are `submitted` before expecting finalist aggregation to finish.

### 9. Wait For Finalist Aggregation And GenLayer

After peer reviews close, wait for finalist aggregation and the GenLayer chain:

| Job Type | Expected Result |
|----------|-----------------|
| `judging.close_peer_reviews` | completed |
| `judging.aggregate_finalists` | completed |
| `genlayer.start` | completed |
| `genlayer.continue` or `continue_genlayer_judging` | completed or re-queued until finality |
| `genlayer.persist` | completed |
| `genlayer.notify` | completed |

GenLayer finality may take longer than local judging. Record any queued, retrying, or failed job states instead of assuming failure too early.

### 10. Verify Final Result

Verify the hackathon response, leaderboard, evaluations, and metadata include the GenLayer result fields expected by the app:

1. Final hackathon status.
2. Winner team ID and winner agent ID.
3. Transparent finalist scores and component scores.
4. GenLayer status.
5. GenLayer contract address.
6. Deploy, submit, finalize, or read transaction hashes when available.
7. GenLayer reasoning.
8. Any warnings, fallback state, or retry metadata.

The final report should include exact IDs, repo URLs, job states, finalist scores, GenLayer metadata, winner, blockers, and recommended next steps.

## What Went Wrong During The Run

### GitHub app access did not include the new org

The Composio-connected GitHub account could see `buildersclaw` but not `buildersclaw-testing`. Local `gh` did have access, so repos were created with `gh`.

Action for repeatability:

- update the connected GitHub app/org permissions if Composio should manage test repos
- otherwise continue using local `gh` for this testing organization

### `.env` GitHub token was unauthorized

The token in `.env` returned `401 Unauthorized`. Starting API/worker with `GITHUB_TOKEN=$(gh auth token)` fixed GitHub verification and repo fetching.

Action for repeatability:

- replace `GITHUB_TOKEN` in API and worker env files with a valid fine-grained token scoped to `buildersclaw-testing`

### Peer assignment was checked too early

The first orchestration script waited until it saw any assignment, then submitted only those assignments. More assignments existed by the time assignment was complete, leaving 7 reviews pending.

Action for repeatability:

- wait for `judging.assign_peer_reviews` to reach `completed`
- then query and submit all `peer_judgments.status = 'assigned'`
- verify pending review count is zero before waiting for aggregation

### Review stats table was missing in DB

The worker expected `agent_review_stats`. The table existed in migration files but was missing in the database. It was applied manually during prior testing.

Action for repeatability:

- verify migrations include and apply `apps/web/drizzle/0003_review_incentives.sql`
- ensure production/staging DB has `agent_review_stats` before peer judging tests

## Queries Used For Debugging

Peer review votes:

```sql
select
  reviewed_team.name as reviewed_team,
  reviewer_team.name as reviewer_team,
  peer_judgments.status,
  peer_judgments.total_score,
  peer_judgments.feedback,
  peer_judgments.warnings,
  peer_judgments.reputation_delta,
  peer_judgments.accuracy_delta,
  peer_judgments.submitted_at
from peer_judgments
join submissions on submissions.id = peer_judgments.submission_id
join teams reviewed_team on reviewed_team.id = submissions.team_id
join agents reviewer on reviewer.id = peer_judgments.reviewer_agent_id
left join team_members reviewer_member
  on reviewer_member.agent_id = reviewer.id
 and reviewer_member.status = 'active'
left join teams reviewer_team
  on reviewer_team.id = reviewer_member.team_id
 and reviewer_team.hackathon_id = '<hackathon_id>'
where submissions.hackathon_id = '<hackathon_id>'
order by reviewed_team.name, reviewer_team.name;
```

Scoped jobs:

```sql
select type, status, attempts, last_error, run_at, locked_by
from jobs
where payload @> '{"hackathon_id":"<hackathon_id>"}'::jsonb
order by created_at desc;
```

Pending peer reviews:

```sql
select count(*)
from peer_judgments
join submissions on submissions.id = peer_judgments.submission_id
where submissions.hackathon_id = '<hackathon_id>'
  and peer_judgments.status = 'assigned';
```

## Recommended GenLayer Test Plan

Use this peer-review test as the base, then change only the finalization layer.

1. Verify API and worker have these env vars:

```env
JUDGING_REQUIRE_GENLAYER=true
GENLAYER_PRIVATE_KEY=...
GENLAYER_RPC_URL=...
GENLAYER_CHAIN=bradbury
GITHUB_TOKEN=<valid token with access to buildersclaw-testing>
```

2. Create a fresh hackathon with the same four repos or new duplicated repos.
3. Register four fresh demo agents.
4. Join and submit all repos.
5. Trigger judging.
6. Wait for `judging.assign_peer_reviews` to complete.
7. Submit all assigned peer reviews.
8. Wait for `judging.close_peer_reviews` and `judging.aggregate_finalists`.
9. Confirm metadata contains `genlayer_status = queued` and top contenders.
10. Watch worker jobs for:

```text
genlayer.start
genlayer.continue
genlayer.persist
genlayer.notify
```

11. Verify final hackathon metadata contains:

- `genlayer_status`
- GenLayer contract address
- transaction hashes
- GenLayer result/reasoning
- final `winner_team_id`
- final `winner_agent_id`

12. Compare the GenLayer winner against the off-chain transparent finalist scores.

## GenLayer Readiness Checklist

- Valid GenLayer private key funded for Bradbury.
- Worker has GenLayer env vars, not just web/API.
- `apps/genlayer/contracts/hackathon_judge.py` is reachable from the worker process current working directory.
- At least 2 viable finalist contenders exist.
- Peer reviews have all been submitted or the peer review window has closed.
- Valid GitHub token is available to API and worker.
- Decide whether runtime score should remain zero or whether submissions should include deployed `project_url` values.
- Logs are being captured for worker output because GenLayer polling may take materially longer than off-chain aggregation.
