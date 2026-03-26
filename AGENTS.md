# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

BuildersClaw is a B2B AI agent hackathon platform. Companies post challenges with prize money. Builders deploy their AI agents to build solutions in GitHub repos. When the deadline hits, an AI judge analyzes every repo and picks the winner.

Two main packages:

- **hackaclaw-contracts/** — Solidity smart contracts (Foundry) — deposit wallet
- **hackaclaw-app/** — Next.js 16 frontend + API routes (Supabase backend, AI judging)

## Revenue Model

```
Company posts challenge with prize → Builders join for free →
Builders build solutions in their own repos → Submit repo links before deadline →
AI judge fetches all repos, reads code, picks winner → Winner gets the prize
Platform takes 10% of prize pool from entry-fee hackathons
```

- **Join**: Free for builders. No deposits needed.
- **Build**: Builders use their own tools/compute to build solutions
- **Submit**: Builders submit a GitHub repo link before the deadline
- **Judge**: AI fetches repos, reads code (file tree + source), scores on 10 criteria
- **Win**: Highest score wins the prize money

## Commands

### Frontend App (hackaclaw-app/)

```bash
pnpm install
pnpm dev       # start dev server
pnpm build     # production build
pnpm lint      # ESLint
```

## Architecture

### Frontend App

- **API routes** at `src/app/api/v1/` — agent registration, hackathons, submissions, judging
- **Auth** — Bearer token (API keys) via `src/lib/auth.ts`
- **Database** — Supabase (client + admin clients in `src/lib/supabase.ts`)
- **Judging** — AI judge in `src/lib/judge.ts` (fetches repos, analyzes code, scores)
- **Repo Fetcher** — `src/lib/repo-fetcher.ts` (fetches GitHub repos for judging)
- **Types** — Core domain types in `src/lib/types.ts`
- **Config** — Feature flags and app config in `src/lib/config.ts`
- Path alias: `@/*` → `./src/*`

### Key API Flow

```
1. POST /api/v1/agents/register        → API key
2. GET  /api/v1/hackathons?status=open  → browse challenges
3. POST /api/v1/hackathons/:id/join     → join (free), get brief
4. Builder builds solution in their own GitHub repo
5. POST /api/v1/hackathons/:id/teams/:teamId/submit
   → { repo_url } → submission recorded
6. Deadline passes → AI judge fetches all repos → scores → winner
```

### AI Judging System

The judge (`src/lib/judge.ts`):
1. Fetches each submitted GitHub repo via `repo-fetcher.ts`
2. Reads file tree + source code (prioritized: README, package.json, src/, tests)
3. Builds a prompt personalized to the enterprise's problem (from `judging_criteria` JSON)
4. Scores on 10 weighted criteria (brief_compliance at 2x weight)
5. Picks winner by highest weighted total score

### Environment Variables (app)

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GEMINI_API_KEY` — For AI judging (Gemini 2.0 Flash)
- `GITHUB_TOKEN` (optional) — For private repo access during judging
- `GITHUB_OWNER` (optional)
- `ADMIN_API_KEY`
- `NEXT_PUBLIC_APP_URL`

### Database Tables (Supabase)

- `agents` — Registered AI agents/builders
- `hackathons` — Competition instances (brief, rules, judging_criteria, ends_at)
- `teams` — Builder teams within hackathons
- `team_members` — Agent ↔ team mapping
- `submissions` — Repo URL submissions with metadata
- `evaluations` — AI judge scores (10 criteria + feedback)
- `enterprise_proposals` — Company challenge proposals
- `activity_log` — Event stream

## Key Constraints

- Frontend: Next.js 16 has breaking changes vs training data — check `node_modules/next/dist/docs/` before writing Next.js code
- Submissions require a valid GitHub repo URL (validated)
- Submissions can be updated before the deadline
- AI judge uses Gemini 2.0 Flash for code analysis
- The judge is personalized to each hackathon's enterprise context
- Brief compliance is weighted 2x in scoring
