# Design: self-contained guard kit, the app as its first user

Date: 2026-10-12. Branch: `kit` (off `main`). Status: approved in brainstorming, awaiting spec review.

## Goal

Someone outside the team guards their own agent with the `onchain_agent_guard` program, without running Oberek: they
set up keys once, call `step()` before each action, and the action does not run once the owner has killed the agent.

The kit is self-contained: `kit/` imports nothing from the app. The app (server, scripts) is the kit's first user and
imports it like any library, so it doubles as the worked example. Done means `kit/` in this repo with its own
`package.json`, a quickstart README and a runnable devnet example, and the app running on it. No npm publish.

## Scope

In:

- Move (with `git mv`, no copies) the program client and the guard from `src/lib/server/modules/` into `kit/src/`.
- New: `openGuardedAgent` / `createGuardedAgent` (the one-agent API below), `kit/example.ts`, `kit/README.md`.
- The app imports the kit as the package `pq-agent-guard` through a Bun workspace.
- `spec/ARCHITECTURE.md`: a section on the kit and who uses it. Root `README.md`: a link to `kit/README.md`.

Out (later, if wanted): an npm publish and a build to JavaScript; batches and history in the one-agent API (they stay
available as low-level exports); the parked HTTP kit (`createGuard`, branch
`pq-agent-kit`), which needs the Oberek server.

## Boundary

| Into `kit/src/` | From | Stays in the app |
| --- | --- | --- |
| `instructions.ts`, `message.ts`, `transaction.ts`, `guard-client.ts`, `guard-errors.ts`, `events.ts`, `resume.ts`, `files.ts`, `onchain_agent_guard.idl.json`, with their tests | `modules/agent/` | `config.ts` (reads the app's `.env`), `agent-loop.ts`, `cycle-ports.ts`, `decision.ts` (the Tick loop of `scripts/agent.ts run`), with their tests |
| `guard.ts` without the HTTP and id parts, `onchain-guard.ts`, with its test | `modules/agent-guard/` | `HTTP_STATUS_BY_GUARD_ERROR` → `fleet/http-errors.ts` (its only user); `isAgentId`, `assertAgentId` → `fleet/agent-id.ts` |
| `testing/memory-guard.ts`, exported as `pq-agent-guard/testing` | `fleet/testing/` | |

After the move `modules/agent-guard/` is empty and removed; `modules/agent/` keeps the four app files.

`kit/src/message.test.ts` keeps reading `onchain/fixtures/message-vector.json`: the vector is the program's, shared by
the Rust and TypeScript sides, and the kit is the program's client. That is the kit's only path outside `kit/`.

## Package

- `kit/package.json`: name `pq-agent-guard`, `"type": "module"`, `"exports": { ".": "./src/index.ts", "./testing":
  "./src/testing/memory-guard.ts" }`, dependencies `@solana/kit` 8.4.0, `@solana-program/system` 0.15.0,
  `@noble/post-quantum` ^0.7.1 (the versions the app pins now).
- Root `package.json`: `"workspaces": ["kit"]`, dependency `"pq-agent-guard": "workspace:*"`. The app imports
  `pq-agent-guard` and `pq-agent-guard/testing`, never `kit/src/...`.
- `kit/src/index.ts` exports the public surface: the one-agent API, the guard (`AgentGuard`, `GuardAccount`,
  `GuardError`, `OnchainGuard`, …) and the low-level client (instructions, messages, `connect`, `sendV1`, key files, …),
  everything the app imports today from the moved files.
- Risk: Vite (dev server, SSR) and svelte-check must load TypeScript from a workspace package. The first task checks this
  on a one-line export before anything moves. Fallback if it fails: the subpath import `#kit` in the root
  `package.json`, the pattern `#lib` already uses; everything else in this design stays.

## One-agent API

Amended 2026-10-12 after review: the agent and the owner hold separate handles. `openGuardedAgent({ agentFile, payer })`
returns only `step` and `status`, and refuses the owner's wallet as `payer`; `openAgentOwner({ agentFile, owner })`
returns `status`, `kill` and `resume`. `OnchainGuard`'s owner key is optional; without it kill and resume are refused
(`NotOwner`). A resume needs the owner's wallet, so whoever takes the agent's process cannot undo a kill. The text
below describes the first version, with one handle holding the owner's wallet.

```ts
import { openGuardedAgent } from 'pq-agent-guard';

const agent = await openGuardedAgent({
	agentFile: '.devnet/my-agent.json', // from `AGENT_FILE=.devnet/my-agent.json bun scripts/agent.ts register`
	wallet: '.devnet/payer.json', // the owner's Solana keypair: pays fees, signs kill and resume
	rpcUrl, // optional, default https://api.devnet.solana.com
	wsUrl, // optional, default derived from rpcUrl (a local validator needs it: port 8900)
	programId // optional, default BL6Fjh4pADgjvZwaueeAcc7rYddFrdMNWnqK73x78ZSs
});

const { counter, decisionHash, result } = await agent.step(JSON.stringify({ action: 'transfer', to, lamports }), () =>
	doTransfer()
);
await agent.status(); // GuardAccount: { status: 'Active' | 'Killed' | 'Pending', counter, lastDecision, owner, agentKey }
await agent.kill();
await agent.resume();
```

- `createGuardedAgent(guard: AgentGuard, agentId: string)` holds the logic and does no I/O; it is tested against
  `MemoryGuard`. `openGuardedAgent(options)` loads the agent file and the wallet, connects, builds `OnchainGuard` with
  `identityOf: () => agentFile` and `feePayer = owner = wallet`, and calls `createGuardedAgent`. The checks, the signing
  and the mapping of the program's errors are `OnchainGuard`'s; the API adds no on-chain logic.
- `step(decision, act)`: reads the agent, hashes `decision` (SHA-256 of its UTF-8 bytes, hex), records the step at
  `counter + 1`, and only after the step landed runs `act()` (awaited). Returns `{ counter, decisionHash, result }`.
- The decision is a string the caller serializes; the kit hashes exactly those bytes, so anyone holding the string can
  recompute the hash on chain.
- A refusal throws `GuardError` with its code (`AgentKilled`, `AgentPending`, `CounterMismatch`, `PayerUnfunded`,
  `AgentNotFound`, …) and `act()` does not run.
- If `act()` throws after the step landed, the step stays on chain and the error propagates.
- `kill()` and `resume()` delegate to `OnchainGuard`, so they work only when `wallet` is the agent's owner (`NotOwner`
  otherwise).

## Testing

- The move: every moved test moves with its file and passes unchanged except for import paths. `bun test` (the whole
  repo, kit included) passes with the same count as before plus the new kit tests; `bun run check` 0 errors; `bun run
  lint` exit 0, Biome also covering `kit/**`.
- The app still runs: the dev server answers `/api/agents` and the page with the fleet from `.env` (smoke run on a spare
  port against the main checkout's `.env` and `.devnet`, as for PR #29).
- New, TDD, no network (`kit/src/guarded-agent.test.ts` on `MemoryGuard`): `act()` runs after a recorded step and its
  result comes back; an async `act()` is awaited; a non-ASCII decision hashes its UTF-8 bytes; consecutive steps record
  counters 1, 2, 3; `act()` does not run for a Killed or Pending agent or a step the guard refuses (`CounterMismatch`),
  and the code comes through; an `act()` that throws leaves the step recorded; after `kill()` steps are refused, after
  `resume()` the next step takes the counter after the resume; the WebSocket URL is derived from http(s) RPC URLs.
- New, `kit/src/agent-layout.test.ts`: pins the bytes the README tells on-chain programs to check: the `Agent`
  discriminator `[47, 166, 112, 147, 155, 197, 86, 7]` and the status at offset 72 (0 Active, 1 Killed, 2 Pending).
- By hand on devnet, only after the user agrees to spend ~0.2 SOL: register an agent with the CLI, run
  `bun kit/example.ts` (three steps), kill it with `bun scripts/agent.ts kill`, run the example again and see
  `AgentKilled` with no action run.

## README

`kit/README.md`, in this order:

1. What it is: before each action, the agent's decision is signed with its ML-DSA-44 key; the program verifies that
   signature on devnet and records it; once the owner kills the agent, every further step is refused.
2. Setup, once, with the CLI from this repo and `.env` (`OWNER_KEYPAIR`, `OWNER_MLDSA_FILE`): `bun scripts/agent.ts
   register-owner`, then `AGENT_FILE=<path> bun scripts/agent.ts register`, which also activates the agent (`activate`
   retries an activation that failed). Back up `owner-mldsa.json` and the agent file. Costs: ~0.2 SOL for the owner
   key, ~0.2 SOL per agent, ~15,000 lamports per step.
3. Use: the snippet above and a table of error codes.
4. Kill and resume: `agent.kill()` / `agent.resume()` or the CLI; a resume needs the agent's ML-DSA-44 signature.
5. What it protects and what it does not: decisions get a record no one can forge without the ML-DSA-44 key; the
   agent's own Solana wallet is still Ed25519; only actions that go through `step()` are guarded; asking before acting
   gives a kill switch, recording after acting only an audit trail.
6. Gating your own on-chain program: check the `Agent` account it was given: the address you expect, owned by
   `BL6Fjh4pADgjvZwaueeAcc7rYddFrdMNWnqK73x78ZSs`, the 8-byte discriminator, byte 72 == 0. A short Anchor sketch, marked
   as not compiled here. No CPI. Funds behind such a program are the only enforcement against an agent that skips
   `step()`.
7. Lower level: the server in this repo (`src/lib/server/modules/fleet/`) runs many agents on `OnchainGuard` and the
   low-level client; it is the larger worked example.
8. Trust: the team holds the program's upgrade authority; the program is not immutable yet.
9. Test: `bun test kit`.
