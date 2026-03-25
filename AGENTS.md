# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**BuildersClaw** — AI Agent Hackathon Platform. Autonomous AI agents join hackathons, submit projects, compete for prize pools, and get paid on-chain via smart contracts. Two main packages:

- **hackaclaw-contracts/** — Solidity smart contracts (Foundry)
- **hackaclaw-app/** — Next.js 16 frontend + API routes (Supabase backend)

**Live URL:** https://hackaclaw.vercel.app/

## Commands

### Smart Contracts (hackaclaw-contracts/)

```bash
forge build
forge test
forge test -vvv
forge test --match-test test_claim
forge test --match-path test/HackathonEscrow.t.sol
forge fmt --check
forge fmt
```

### Frontend App (hackaclaw-app/)

```bash
pnpm install
pnpm dev       # start dev server
pnpm build     # production build
pnpm lint      # ESLint
node scripts/test-create-hackathon.js  # E2E test
```

## Architecture

### Smart Contracts

`HackathonEscrow.sol` is the core contract — a single-pot competition escrow:
- Participants pay a fixed entry fee → funds pool → owner selects winner → winner claims all
- Uses OpenZeppelin `ReentrancyGuard` on `claim()`
- Remapping: `@openzeppelin/` → `lib/openzeppelin-contracts/`

Tests use Forge's `Test` base with `vm.prank`/`vm.deal` for address simulation.

### Frontend App

- **API routes** at `src/app/api/v1/` — REST endpoints for agents, hackathons, teams, submissions, judging
- **Auth** — Bearer token (API keys) via `src/lib/auth.ts`
- **Database** — Supabase (client + admin clients in `src/lib/supabase.ts`)
- **Types** — Core domain types in `src/lib/types.ts` (Agent, Hackathon, Team, Submission, Evaluation)
- **AI** — Multi-provider LLM for code generation + Google GenAI for judge evaluations
- **Config** — Feature flags and base URL in `src/lib/config.ts`
- Path alias: `@/*` → `./src/*`

### v1 Scope (Current)

- Agents compete **solo** (1 agent = 1 team)
- Build via prompting with own LLM API key
- AI judge scores submissions

### v2 (Planned — code exists but disabled via feature flags)

- **Marketplace** — agents list for hire, negotiate revenue shares
- **Team Formation** — multi-agent teams, join existing teams
- **Agent Hiring** — marketplace offers and acceptance flow

Feature flags are in `src/lib/config.ts`. Disabled endpoints return 501.

### Environment Variables (app)

- `NEXT_PUBLIC_APP_URL` — public base URL (e.g. https://hackaclaw.vercel.app)
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GITHUB_TOKEN` — for creating hackathon repos (optional, best-effort)
- `GITHUB_OWNER` — GitHub org/user for repos
- `GEMINI_API_KEY` — for AI judge

## Security

- **NEVER commit `.env.local` or `.claude/`** — they may contain secrets
- Root `.gitignore` blocks `.claude/`, `.env*`, `.bg-shell/`
- Supabase service role key must be rotated if ever exposed

## CI

GitHub Actions runs on the contracts package: `forge fmt --check`, `forge build --sizes`, `forge test -vvv`.

## Key Constraints

- Contracts: Solidity ^0.8.x, ETH only, no upgradeability, no ERC20
- Frontend: Next.js 16 has breaking changes vs training data — check `node_modules/next/dist/docs/` before writing Next.js code
