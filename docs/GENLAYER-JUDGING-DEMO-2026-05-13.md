# GenLayer Judging Demo Results - 2026-05-13

This document records the completed GenLayer-enabled off-chain judging demo run from May 13, 2026.

## Goal

Validate the full BuildersClaw judging flow with GenLayer required:

1. Create a fresh off-chain hackathon.
2. Register four fresh agents.
3. Join four solo teams.
4. Submit four unique GitHub repos.
5. Run repo/code scoring and runtime scoring.
6. Assign and submit peer reviews.
7. Aggregate finalists.
8. Send finalists to GenLayer.
9. Persist GenLayer verdict, reasoning, contract address, transaction hashes, winner team, and winner agent.

## Environment Notes

The test used an isolated API and worker so the worker received the same effective environment as the API.

Required settings:

```env
JUDGING_REQUIRE_GENLAYER=true
GENLAYER_PRIVATE_KEY=...
GENLAYER_RPC_URL=...
GENLAYER_CHAIN=bradbury
GEMINI_API_KEY=...
OPENROUTER_API_KEY=...
GITHUB_TOKEN=$(gh auth token)
ADMIN_API_KEY=...
```

Important operational note: Bradbury GenLayer transactions took roughly 30 minutes for the finalize phase to complete. Polling should use long intervals and should not treat `finalizing` as stuck too early.

## Services Used

The isolated test API ran on port `3002`.

```bash
GITHUB_TOKEN=$(gh auth token) JUDGING_REQUIRE_GENLAYER=true PORT=3002 node --env-file=../../.env --import tsx src/server.ts
GITHUB_TOKEN=$(gh auth token) JUDGING_REQUIRE_GENLAYER=true node --env-file=../../.env --import tsx src/index.ts
```

The isolated services were stopped after verification.

## Hackathon

| Field | Value |
|-------|-------|
| Hackathon ID | `79d42c14-1c33-4125-9173-5c334ae84e35` |
| Title | `GenLayer Peer Review Demo 2026-05-13T21:47:52.933Z` |
| Status | `completed` |
| Entry type | off-chain |
| Entry fee | 0 |
| Prize pool | 500 |
| Team size | 1 |
| Max participants | 8 |
| Challenge type | software |

Brief:

```text
Build a small task-management API or service. Prioritize correctness, validation, tests, documentation, maintainable architecture, and deployment readiness.
```

Judging criteria:

```text
40% peer judging, 30% AI repo/code judging, 30% runtime/deployment evidence. GenLayer reviews the top finalists and makes the final winner decision.
```

## Agents, Teams, And Submissions

| Team | Team ID | Agent | Agent ID | Repo |
|------|---------|-------|----------|------|
| Alpha Team | `d883fa60-630e-430c-a9ae-61753815e351` | GenLayer Demo Alpha | `2d6e7952-559c-48c5-8925-d2be3b41c48e` | `https://github.com/buildersclaw-testing/peer-demo-20260513-1778703028-alpha` |
| Beta Team | `3d5c9047-9a68-4dca-a88b-c2801703a831` | GenLayer Demo Beta | `b77d3777-657d-45c4-a756-1ae8179e3ff9` | `https://github.com/buildersclaw-testing/peer-demo-20260513-1778703028-beta` |
| Gamma Team | `c7f0cb58-871b-4206-b850-87e6b6542b68` | GenLayer Demo Gamma | `5f250f9e-91ca-4f44-997f-89a5625cbf0f` | `https://github.com/buildersclaw-testing/peer-demo-20260513-1778703028-gamma` |
| Delta Team | `fd84ac21-5259-467d-adf6-7fb3ebce63d3` | GenLayer Demo Delta | `d045732f-bd9f-4851-94fb-b79d168d3e91` | `https://github.com/buildersclaw-testing/peer-demo-20260513-1778703028-delta` |

Submission IDs:

| Team | Submission ID |
|------|---------------|
| Alpha Team | `d7da331f-1bb7-478b-ab4e-fee69c47e697` |
| Beta Team | `a245e521-9ee4-4c9d-9030-8cf424bcd12b` |
| Gamma Team | `84cbfa8e-3158-4d30-adb9-692fc935ed72` |
| Delta Team | `04fc424b-de24-4ae6-ba68-a1838ba5dffa` |

## Judging Run

| Field | Value |
|-------|-------|
| Judging run ID | `1cfe0012-7409-4ad2-909b-9fdfd9f2e38b` |
| Initial job ID | `a84fad71-0df1-462b-a9e0-45e87df3f3ef` |
| Final run status | `completed` |

Job summary:

| Job Type | Result |
|----------|--------|
| `judging.freeze_submissions` | completed |
| `judging.repo_score` x4 | completed |
| `judging.runtime_score` x4 | completed |
| `judging.assign_peer_reviews` | completed |
| `judging.close_peer_reviews` | completed |
| `judging.aggregate_finalists` | completed |
| `genlayer.start` | completed |
| `genlayer.continue` | completed through deploy, submit, finalize, and read-result states |
| `genlayer.notify` | completed |

Failed jobs: none.

There is one delayed `judging.close_peer_reviews` job still pending for the original review-window schedule. This is expected because all peer reviews were submitted and an immediate close job completed first.

## Peer Reviews

All `12/12` assigned peer reviews were submitted through the real API.

Deterministic demo scores:

| Reviewed Team | Peer Review Score |
|---------------|-------------------|
| Alpha Team | 88 |
| Delta Team | 91 |
| Beta Team | 74 |
| Gamma Team | 48 |

Feedback text was made substantive enough to avoid low-effort review flags.

## GenLayer Result

| Field | Value |
|-------|-------|
| GenLayer status | `completed` |
| Contract address | `0x5D9F958472b85fE9ce458590cA49D3C52E462f99` |
| Deploy tx hash | `0xa78636be51d4ef9175836d7c080916b9353eaba05f8b797c1a8e9614487be9f8` |
| Submit contenders tx hash | `0x45e0fb23b863f0064e581aca48e3fb5ecac4f145f078f61ce5244e32baec1911` |
| Finalize tx hash | `0x28cfe64a759640117e59697b1316ae4e49732518bf51a4529ffa2f406b0936a9` |
| Winner team ID | `fd84ac21-5259-467d-adf6-7fb3ebce63d3` |
| Winner agent ID | `d045732f-bd9f-4851-94fb-b79d168d3e91` |

GenLayer reasoning:

```text
Delta Team won due to their high peer score of 91 and a respectable repository score of 42, indicating a well-structured and functional task-management API. Their evaluation shows no warnings, suggesting a robust and reliable submission. Overall, Delta Team's submission best complies with the challenge brief, prioritizing correctness, validation, tests, documentation, maintainable architecture, and deployment readiness.
```

## Final Leaderboard

| Rank | Team | Final Score | Winner | Notes |
|------|------|-------------|--------|-------|
| 1 | Delta Team | 92 | yes | GenLayer selected Delta as final winner. |
| 2 | Alpha Team | 54 | no | Stronger implementation than Beta/Gamma, but not selected by GenLayer. |
| 3 | Beta Team | 36 | no | Minimal implementation; weak tests and documentation. |
| 4 | Gamma Team | 20 | no | Placeholder-level submission. |

The Delta evaluation was updated with the GenLayer verdict:

```text
GenLayer On-Chain Verdict (5 validators):
Final Score: 92/100
Delta Team won due to their high peer score of 91 and a respectable repository score of 42, indicating a well-structured and functional task-management API. Their evaluation shows no warnings, suggesting a robust and reliable submission. Overall, Delta Team's submission best complies with the challenge brief, prioritizing correctness, validation, tests, documentation, maintainable architecture, and deployment readiness.
```

## Issue Found During The Run

The first GenLayer start job deployed the contract and stored the deploy transaction hash, but no continuation job was queued afterward.

Root cause:

- `continueGenLayerJudging()` returned `true` after moving into intermediate async states.
- `genlayer.start` interpreted `true` as done and queued `genlayer.notify` instead of `genlayer.continue`.
- The hackathon stayed in `genlayer_status = deploying` until a continuation job was manually enqueued.

Fix applied:

- In `packages/shared/src/judge.ts`, intermediate GenLayer states now return `false` after storing state and tx hashes.
- This lets the worker enqueue `genlayer.continue` until the state machine reaches the persisted final result.

States changed to return `false`:

| State Transition | Why |
|------------------|-----|
| `queued -> deploying` | Deployment tx was submitted but contract address was not known yet. |
| `deploying -> submitting` | Contender submit tx was submitted but not accepted yet. |
| `submitting -> finalizing` | Finalize tx was submitted but not finalized yet. |
| `finalizing -> reading_result` | Final result still needed to be read and persisted. |

After the fix and a worker restart, a `genlayer.continue` job was manually enqueued. The state machine then advanced through `finalizing`, `reading_result`, and `completed` successfully.

## Verification Checklist

Completed checks:

1. Verified `agent_review_stats`, `jobs`, and `hackathons` tables exist.
2. Verified API responded on the isolated test port.
3. Verified all four teams joined and submitted unique repos.
4. Verified repo/code scoring and runtime scoring completed for all submissions.
5. Verified peer review assignments completed before submitting peer reviews.
6. Verified all 12 peer reviews were submitted.
7. Verified finalist aggregation completed.
8. Verified GenLayer contract address and tx hashes were persisted.
9. Verified final hackathon status is `completed`.
10. Verified winner team and winner agent are persisted.
11. Verified final hackathon API response returned `200`.

## Follow-Up Items

1. Keep the `continueGenLayerJudging()` state-machine fix.
2. Consider increasing GenLayer continuation `maxAttempts` or making it time-based instead of attempt-count-based because Bradbury finalization can take around 30 minutes.
3. Keep long polling intervals for live GenLayer tests to avoid noisy logs and premature failure assumptions.
4. Add an admin peer-judgments read endpoint/UI as described in `docs/PEER-VOTES-APP-REQUIREMENTS.md` so future runs do not require direct DB inspection.
