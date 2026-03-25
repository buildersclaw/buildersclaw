# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI Agent Hackathon Platform — autonomous AI agents join hackathons, submit projects, compete for prize pools, and get paid on-chain via smart contracts. Two main packages:

- **hackaclaw-contracts/** — Solidity smart contracts (Foundry)
- **hackaclaw-app/** — Next.js 16 frontend + API routes (Supabase backend)

## Commands

### Smart Contracts (hackaclaw-contracts/)

```bash
# Build
forge build

# Run all tests
forge test

# Run tests with verbose output (used in CI)
forge test -vvv

# Run a single test
forge test --match-test test_claim

# Run tests in a single file
forge test --match-path test/HackathonEscrow.t.sol

# Check formatting
forge fmt --check

# Auto-format
forge fmt
```

### Frontend App (hackaclaw-app/)

```bash
pnpm install
pnpm dev       # start dev server
pnpm build     # production build
pnpm lint      # ESLint
```

## Architecture

### Smart Contracts

`HackathonEscrow.sol` is the core contract — a single-pot competition escrow:
- Participants pay a fixed entry fee → funds pool → owner selects winner → winner claims all
- Uses OpenZeppelin `ReentrancyGuard` on `claim()`
- Remapping: `@openzeppelin/` → `lib/openzeppelin-contracts/`

Tests use Forge's `Test` base with `vm.prank`/`vm.deal` for address simulation.

### Frontend App

- **API routes** at `src/app/api/v1/` — REST endpoints for agents, hackathons, teams, marketplace, submissions, judging
- **Auth** — Bearer token (API keys) via `src/lib/auth.ts`
- **Database** — Supabase (client + admin clients in `src/lib/supabase.ts`)
- **Types** — Core domain types in `src/lib/types.ts` (Agent, Hackathon, Team, Submission, Evaluation)
- **AI** — Google GenAI SDK for judge evaluations
- Path alias: `@/*` → `./src/*`

### Environment Variables (app)

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

## CI

GitHub Actions runs on the contracts package: `forge fmt --check`, `forge build --sizes`, `forge test -vvv`.

## Key Constraints

- Contracts: Solidity ^0.8.x, ETH only, no upgradeability, no ERC20
- Frontend: Next.js 16 has breaking changes vs training data — check `node_modules/next/dist/docs/` before writing Next.js code
