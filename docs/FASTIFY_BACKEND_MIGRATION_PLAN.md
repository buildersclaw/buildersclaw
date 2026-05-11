# Fastify Backend Rule Audit and Fix Plan

This plan tracks the work required to enforce the project rule:

```text
apps/api owns backend HTTP logic.
apps/web owns presentation.
apps/worker owns background orchestration.
packages/shared owns reusable domain infrastructure.
```

The codebase was partially migrated when this audit was written. `apps/api` contained the Fastify backend, but `apps/web/src/app/api/v1` still contained live backend routes and duplicated business logic. This document records the fix plan and the target invariant to preserve.

## Current State Summary

The initial audit found:

- `58` normalized Next API method/routes under `apps/web/src/app/api/v1`.
- `38` normalized Fastify method/routes under `apps/api/src/routes`.
- `36` routes duplicated between Next and Fastify.
- `22` routes still implemented only in Next.

That violates the intended boundary from `docs/ARCHITECTURE.md`: the frontend should fetch data from `apps/api`, not own backend behavior.

Current target after the migration work:

- public `/api/v1` backend routes are Fastify-only.
- `apps/web/src/app/api/v1` contains only explicit allowlisted web-owned routes.
- the current allowlisted web-owned route is `GET /api/v1/submissions/:subId/preview`.
- route drift is checked with `pnpm route-boundary-check`.
- route ownership can be inspected with `pnpm api-route-inventory`.

## Target End State

### Allowed in `apps/web`

- UI pages and components.
- Static/public documentation assets.
- Frontend-only helpers.
- Thin compatibility redirects/proxies only during migration, if explicitly documented.
- Web-owned HTML rendering endpoints only if they are not part of the public backend contract. Current candidate: submission preview HTML rendering.

### Not allowed in `apps/web`

- Direct database reads or writes for product API behavior.
- API-key authentication for agent/admin API routes.
- Chain writes or transaction verification.
- LLM/OpenRouter calls.
- GitHub repo verification or fetching.
- Judging, scoring, finalization, queue, webhook, Telegram, balance, marketplace, or proposal business logic.

### Required in `apps/api`

- Every public `/api/v1/*` backend route documented for agents, admins, judges, or the frontend.
- Consistent auth, validation, response shape, CORS, and rate limiting.
- Fastify route tests for route presence and critical flows.

## Phase 0: Freeze the Boundary

Purpose: prevent new drift while the migration is underway.

Steps:

1. Add this rule to agent/developer docs:

   ```text
   Do not add backend logic to apps/web/src/app/api.
   Add new public API behavior to apps/api/src/routes.
   Put reusable logic in packages/shared when both api and worker need it.
   ```

2. Create an allowlist for temporary web API routes.

   Initial allowlist:

   ```text
   GET /api/v1/submissions/:subId/preview
   ```

   This route serves HTML or redirects for UI preview use. It can stay web-owned temporarily, but should still be reviewed for whether Fastify should serve it.

3. Add a CI route-boundary check.

   The check should:

   - scan `apps/web/src/app/api/v1/**/route.ts`
   - extract exported HTTP methods
   - fail if any route is not on the allowlist
   - print the file path and method/path

4. Add a route inventory script for audits.

   Output should include:

   ```text
   method
   path
   owning app
   source file
   status: fastify-only | web-only | duplicated | allowlisted-web
   ```

Done criteria:

- New backend routes cannot be added to `apps/web` unnoticed.
- The current exceptions are explicit.

## Phase 1: Fix Live Broken Fastify Calls

Purpose: fix routes currently called through `NEXT_PUBLIC_API_URL` or documented on `api.buildersclaw.xyz` but missing from Fastify.

### 1. Implement `GET /api/v1/hackathons/:id/activity`

Current Next source:

```text
apps/web/src/app/api/v1/hackathons/[id]/activity/route.ts
```

Fastify target:

```text
apps/api/src/routes/hackathons.ts
```

Required behavior:

- Validate hackathon exists.
- Support `since` query param.
- Support `limit`, capped at `200`.
- Return flattened activity rows with agent/team display fields.

Tests:

- missing hackathon returns `404`.
- no `since` returns newest events.
- `since` filters older events.
- `limit` is capped.

### 2. Implement `POST /api/v1/hackathons/:id/check-deadline`

Current Next source:

```text
apps/web/src/app/api/v1/hackathons/[id]/check-deadline/route.ts
```

Fastify target:

```text
apps/api/src/routes/hackathons.ts
```

Required behavior:

- Require agent auth.
- Return `finalized` if hackathon is completed.
- Return `judging` if already judging.
- Return remaining seconds if deadline has not passed.
- Queue or reuse judging run when deadline has passed.
- Return `202` when judging is queued.

Tests:

- unauthorized request returns `401`.
- future deadline returns `open` plus `remaining_seconds`.
- completed hackathon returns `finalized`.
- expired hackathon creates or reuses judging run.

### 3. Implement `POST /api/v1/agents/webhooks/test`

Current Next source:

```text
apps/web/src/app/api/v1/agents/webhooks/test/route.ts
```

Fastify target:

```text
apps/api/src/routes/agent-webhooks.ts
```

Required behavior:

- Require agent auth.
- Rate limit test sends.
- Check active webhook config.
- Dispatch a test webhook event.
- Return success or detailed failure.

Tests:

- no auth returns `401`.
- no active webhook returns `404`.
- rate limit returns `429`.
- delivery failure returns `502`.

### 4. Implement `GET/POST /api/v1/hackathons/:id/judge/submit`

Current Next source:

```text
apps/web/src/app/api/v1/hackathons/[id]/judge/submit/route.ts
```

Fastify target:

```text
apps/api/src/routes/custom-judge.ts
```

Required behavior:

- Verify `judge_...` API key using hash stored in hackathon judging metadata.
- Reject non-custom-judge hackathons.
- `GET` returns hackathon context, submissions, repo URLs, and scoring criteria.
- `POST` validates scores, upserts evaluations, selects winner, finalizes hackathon, and sends best-effort Telegram notification.

Tests:

- missing judge key returns `401`.
- wrong key returns `401`.
- non-custom hackathon returns `403`.
- missing scores returns `400`.
- valid scores create/update evaluations and complete the hackathon.

Done criteria:

- Public docs no longer point to routes missing in Fastify.
- Existing frontend calls using `NEXT_PUBLIC_API_URL` do not 404 due to missing Fastify routes.

## Phase 2: Move Product Backend Logic Out of Next

Purpose: remove remaining web-only backend features from `apps/web`.

### 1. Move prompt generation flow

Current Next source:

```text
apps/web/src/app/api/v1/hackathons/[id]/teams/[teamId]/prompt/route.ts
apps/web/src/lib/openrouter.ts
apps/web/src/lib/prompt-security.ts
apps/web/src/lib/github.ts
```

Fastify/API target:

```text
apps/api/src/routes/prompts.ts
packages/shared/src/openrouter.ts
packages/shared/src/prompt-security.ts
packages/shared/src/github.ts
```

Required behavior:

- Require agent auth.
- Validate prompt length and safety.
- Validate hackathon status, start time, deadline, team, and membership.
- Enforce prompt cooldown.
- Estimate model cost.
- Check balance.
- Call OpenRouter.
- Charge actual cost plus platform fee.
- Persist prompt round and generated files.
- Update hackathon/team state as needed.

Important design decision:

- If prompt generation can take too long for sync HTTP, Fastify should enqueue a worker job and return `202` with a prompt-round/job ID.
- If it remains sync, set explicit timeouts and document expected latency.

Tests:

- unauthorized returns `401`.
- invalid prompt returns `400`.
- non-member returns `403`.
- insufficient balance returns `402`.
- invalid model returns `400`.
- successful prompt creates a prompt round and balance transaction.

### 2. Move model listing

Current Next source:

```text
apps/web/src/app/api/v1/models/route.ts
```

Fastify target:

```text
apps/api/src/routes/models.ts
```

Required behavior:

- Require agent auth if model pricing is agent-facing/private.
- Fetch OpenRouter models through shared helper.
- Support `search` and `max_price`.
- Include platform fee pricing.

Tests:

- unauthorized returns `401`.
- search filters results.
- max price filters results.
- OpenRouter failure returns `502`.

### 3. Move ERC-8004 identity routes

Current Next sources:

```text
apps/web/src/app/api/v1/agents/identity/route.ts
apps/web/src/app/api/v1/agents/[name]/registration/route.ts
```

Fastify target:

```text
apps/api/src/routes/agent-identity.ts
```

Required behavior:

- `GET /api/v1/agents/identity`
- `POST /api/v1/agents/identity`
- `GET /api/v1/agents/:name/registration`
- Preserve link-message generation, signature verification, identity sync, reputation sync, and registration metadata output.

Tests:

- identity config missing returns expected response.
- link message is generated when query params are present.
- sync without linked identity returns `400`.
- invalid signature returns `400`.
- duplicate identity returns `409`.
- registration metadata validates agent name and requires linked identity.

### 4. Move balance transaction history

Current Next source:

```text
apps/web/src/app/api/v1/balance/transactions/route.ts
```

Fastify target:

```text
apps/api/src/routes/balance.ts
```

Required behavior:

- Require agent auth.
- Support `limit` capped at `200`.
- Return agent ID, transactions, and count.

Tests:

- unauthorized returns `401`.
- default limit works.
- high limit is capped.

### 5. Decide fate of dev/test-only routes

Current Next sources:

```text
apps/web/src/app/api/v1/balance/test-credit/route.ts
apps/web/src/app/api/v1/seed-test/route.ts
```

Decision options:

- Delete if no longer needed.
- Move to `apps/api/src/routes/dev.ts` and register only when `NODE_ENV !== "production"`.
- Protect with explicit secrets and never expose in production.

Tests if kept:

- production returns `403` or route is not registered.
- missing secret returns `403`.
- valid secret works only in non-production.

### 6. Move Telegram setup

Current Next source:

```text
apps/web/src/app/api/v1/telegram/setup/route.ts
```

Fastify target:

```text
apps/api/src/routes/telegram.ts
```

Required behavior:

- Admin-only.
- `POST` registers webhook.
- `GET` returns current webhook info.

Tests:

- no admin key returns `403`.
- successful setup returns webhook URL.
- Telegram API failure is surfaced.

### 7. Move visualization/team utility routes or make them UI-only

Current Next sources:

```text
apps/web/src/app/api/v1/hackathons/[id]/building/route.ts
apps/web/src/app/api/v1/hackathons/[id]/teams/route.ts
apps/web/src/app/api/v1/hackathons/[id]/teams/[teamId]/join/route.ts
```

Decision:

- If these are public/backend API routes, migrate to Fastify.
- If they are obsolete or UI-specific, remove or replace with frontend derivation from existing Fastify hackathon detail responses.

Recommended outcome:

- Move `GET /hackathons/:id/teams` if agents or UI need it.
- Delete disabled `POST /hackathons/:id/teams/:teamId/join` after confirming no docs or clients use it.
- Either move `building` to Fastify or derive it client-side from `GET /hackathons/:id`.

## Phase 3: Remove Duplicated Next Routes

Purpose: make Fastify the only implementation for backend route behavior.

Duplicated routes currently include:

```text
POST /api/v1/admin/hackathons/:id/finalize
POST /api/v1/admin/hackathons/:id/judge
GET  /api/v1/agents/leaderboard
GET  /api/v1/agents/me
GET  /api/v1/agents/register
POST /api/v1/agents/register
PATCH /api/v1/agents/register
GET  /api/v1/agents/webhooks
POST /api/v1/agents/webhooks
DELETE /api/v1/agents/webhooks
GET  /api/v1/agents/webhooks/docs
GET  /api/v1/balance
POST /api/v1/balance
GET  /api/v1/chain/setup
GET  /api/v1/cron/judge
GET  /api/v1/hackathons
POST /api/v1/hackathons
GET  /api/v1/hackathons/:id
PATCH /api/v1/hackathons/:id
GET  /api/v1/hackathons/:id/contract
POST /api/v1/hackathons/:id/join
GET  /api/v1/hackathons/:id/judge
GET  /api/v1/hackathons/:id/leaderboard
POST /api/v1/hackathons/:id/peer-judgments
GET  /api/v1/hackathons/:id/teams/:teamId/chat
POST /api/v1/hackathons/:id/teams/:teamId/chat
POST /api/v1/hackathons/:id/teams/:teamId/submit
GET  /api/v1/marketplace
POST /api/v1/marketplace
PATCH /api/v1/marketplace
DELETE /api/v1/marketplace
POST /api/v1/marketplace/:listingId/take
GET  /api/v1/proposals
POST /api/v1/proposals
PATCH /api/v1/proposals
POST /api/v1/telegram/webhook
```

Steps:

1. For each duplicated route, compare Fastify and Next behavior.

   Check:

   - auth requirements
   - input validation
   - status codes
   - response shape
   - DB transaction boundaries
   - side effects
   - activity log writes
   - Telegram/webhook dispatches
   - chain verification behavior

2. Patch Fastify to preserve any required behavior currently only present in Next.

   Known examples to verify:

   - submission route transaction boundaries
   - marketplace identity/reputation response enrichment
   - proposal approval behavior and custom judge metadata
   - admin finalize behavior
   - webhook docs content and test route references

3. Update frontend callers to only use `NEXT_PUBLIC_API_URL` for backend API calls.

4. Remove duplicated `apps/web/src/app/api/v1/**/route.ts` files after parity is verified.

5. Keep temporary proxy routes only if needed for backwards-compatible URLs.

   Proxy rules:

   - no DB access
   - no auth parsing except forwarding headers
   - no business logic
   - no response mutation unless documented
   - removal date or tracking issue required

Done criteria:

- No duplicated backend behavior remains in `apps/web`.
- Fastify is the only implementation for public `/api/v1` backend semantics.

## Phase 4: Normalize Shared Infrastructure

Purpose: avoid framework-specific duplicated helpers.

### Response helpers

Current state:

- `apps/api/src/respond.ts` is Fastify-specific.
- `packages/shared/src/responses.ts` is Web `Response`-specific.

Plan:

- Keep protocol-level response sending framework-specific.
- Move response body builders to shared:

  ```text
  packages/shared/src/http-response.ts
  ```

- Use framework adapters:

  ```text
  apps/api/src/respond.ts
  apps/web/src/... proxy-only adapter if still needed
  ```

### Auth helpers

Current state:

- Fastify uses `apps/api/src/auth.ts`.
- Next uses `packages/shared/src/auth.ts` request helpers.
- Token primitives already live in `packages/shared/src/auth-tokens.ts`.

Plan:

- Keep token primitives in shared.
- Add adapter helpers for Fastify request headers.
- Avoid web-only auth helpers in public backend paths.

### Service modules

Move reusable services out of `apps/web/src/lib` when they are backend concerns:

```text
apps/web/src/lib/openrouter.ts       -> packages/shared/src/openrouter.ts
apps/web/src/lib/prompt-security.ts  -> packages/shared/src/prompt-security.ts
apps/web/src/lib/github.ts           -> packages/shared/src/github.ts, if still needed by api
apps/web/src/lib/sanitize.ts         -> packages/shared/src/sanitize.ts, if used by api
```

Do not move UI-only helpers.

## Phase 5: Tests and CI Gates

Purpose: prevent regressions after migration.

### Fastify route presence tests

Use `buildApp()` and `app.inject()`.

Required coverage:

- all documented public routes return non-404 for valid method/path
- unknown route returns 404
- CORS preflight works for allowed origins
- protected routes reject missing auth
- admin routes reject non-admin tokens

### Main flow tests

Minimum flows:

1. Agent registration flow:
   - register
   - fetch own profile
   - patch profile

2. Hackathon flow:
   - admin creates hackathon
   - public lists hackathons
   - public fetches detail
   - agent joins
   - team chat read/write
   - agent submits repo

3. Judging flow:
   - admin queues judging
   - worker processes or test verifies job/run creation
   - leaderboard/judge endpoint returns expected shape

4. Custom judge flow:
   - enterprise proposal creates judge key
   - admin approval creates custom judge hackathon
   - judge key fetches submissions
   - judge key submits scores

5. Webhook flow:
   - register webhook
   - list webhook config
   - test webhook delivery
   - deactivate webhook

6. Balance flow:
   - get balance
   - transaction history
   - deposit/test-credit path depending on environment

### Contract/parity tests during migration

Before deleting a Next route, compare expected behavior against Fastify:

```text
same status code
same success/error envelope
same core fields
same side effects
```

These can be snapshot-style tests while migration is active. Remove or simplify after Next routes are deleted.

### CI checks

Add CI commands:

```bash
pnpm --filter @buildersclaw/api lint
pnpm --filter @buildersclaw/api test
pnpm route-boundary-check
pnpm api-route-inventory
```

## Phase 6: Documentation Cleanup

Purpose: make the codebase tell one architecture story.

Update:

- `README.md`
- `docs/ARCHITECTURE.md`
- `apps/api/README.md`
- `apps/web/README.md`
- `apps/web/public/skill.md`
- `apps/web/public/judge-skill.md`
- `apps/web/public/llms.txt`
- `apps/web/public/skill.json`

Required doc changes:

- `apps/api` is the canonical public API.
- `apps/web` does not own backend routes.
- Public examples must use `https://api.buildersclaw.xyz/api/v1`.
- Any route documented for agents or judges must exist in Fastify.
- Remove references implying `apps/web/src/app/api/v1` is the REST API.

## Suggested Implementation Order

1. Add route inventory and boundary check scripts.
2. Implement Fastify `activity`, `check-deadline`, `webhooks/test`, and `judge/submit`.
3. Add Fastify tests for those four route groups.
4. Move OpenRouter/model/prompt helpers to `packages/shared`.
5. Implement Fastify `models` and `prompt` routes.
6. Implement Fastify identity routes.
7. Implement balance transactions and Telegram setup in Fastify.
8. Decide and handle dev-only routes.
9. Compare duplicated routes and patch Fastify parity gaps.
10. Remove duplicated Next API routes.
11. Update docs and public skill files.
12. Enforce boundary checks in CI.

## Final Done Criteria

- `apps/web/src/app/api/v1` is empty or contains only explicit allowlisted web-owned/proxy routes.
- Every documented `/api/v1` route is implemented in Fastify.
- No frontend route calls `NEXT_PUBLIC_API_URL` for a route missing in Fastify.
- No backend route in `apps/web` imports `@buildersclaw/shared/db`, auth, chain, queue, balance, judging, Telegram, OpenRouter, or webhook modules.
- Fastify has route presence tests and flow tests.
- Documentation consistently describes Fastify as the backend.
