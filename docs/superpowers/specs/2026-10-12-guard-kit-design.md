# Design: guard kit for other agents

Date: 2026-10-12. Branch: `kit` (off `main`). Status: approved in brainstorming, awaiting spec review.

## Goal

Someone outside the team guards their own agent with the `onchain_agent_guard` program on devnet, without running
Oberek: they set up keys once, call `step()` before each action, and the action does not run once the owner has killed
the agent. Done means a `kit/` directory in this repo with a quickstart README and one example runnable on devnet. No
npm package.

## Scope

In:

- `kit/guarded-agent.ts`: `openGuardedAgent` and `createGuardedAgent` (below).
- `kit/index.ts`: the public surface, re-exported from the existing modules.
- `kit/example.ts`: three guarded steps on devnet, with the agent file and wallet from `AGENT_FILE` and
  `OWNER_KEYPAIR`.
- `kit/README.md`: setup, use, kill and resume, limits, gating another on-chain program, trust.
- One line in the root `README.md` linking to the kit, and `kit` in the comment on its `bun test` line (plain
  `bun test` already finds `kit/`).

Out (later, if wanted): moving `src/lib/server/modules/agent/` into `kit/` and an npm package; batches
(`recordBatch`); history and audit (`fetchGuardEvents`); a fee payer separate from the owner; the parked HTTP kit
(`createGuard`, branch `pq-agent-kit`), which needs the Oberek server.

No existing code changes. `kit/` imports `src/lib/server/modules/agent/` and `agent-guard/`; the app, scripts and bot
are untouched.

## API

```ts
import { openGuardedAgent } from './kit';

const agent = await openGuardedAgent({
	agentFile: '.devnet/my-agent.json', // from `AGENT_FILE=.devnet/my-agent.json bun scripts/agent.ts register`
	wallet: '.devnet/payer.json', // the owner's Solana keypair: pays fees, signs kill and resume
	rpcUrl, // optional, default https://api.devnet.solana.com
	programId // optional, default BL6Fjh4pADgjvZwaueeAcc7rYddFrdMNWnqK73x78ZSs
});

const { counter, decisionHash, result } = await agent.step(JSON.stringify({ action: 'transfer', to, lamports }), () =>
	doTransfer()
);
await agent.status(); // { status: 'Active' | 'Killed' | 'Pending', counter, lastDecision }
await agent.kill();
await agent.resume();
```

- `createGuardedAgent(guard: AgentGuard, agentId: string)` holds the logic and does no I/O, so it is tested against
  `MemoryGuard`. `openGuardedAgent(options)` loads the agent file and the wallet, connects, builds `OnchainGuard` with
  `identityOf: () => agentFile` and `feePayer = owner = wallet`, and calls `createGuardedAgent`. The checks, the signing
  and the mapping of the program's errors are `OnchainGuard`'s; the kit adds no on-chain logic.
- `step(decision, act)`: reads the agent, hashes `decision` (SHA-256 of its UTF-8 bytes), records the step at
  `counter + 1`, and only after the step landed runs `act()`. It returns `{ counter, decisionHash, result }`, where
  `decisionHash` is hex and `result` is what `act()` returned.
- The decision is a string the caller serializes. The kit hashes exactly those bytes, so anyone holding the string can
  recompute the hash on chain without guessing a key order.
- A refusal throws `GuardError` with its code (`AgentKilled`, `AgentPending`, `CounterMismatch`, `PayerUnfunded`,
  `AgentNotFound`, …) and `act()` does not run.
- If `act()` throws after the step landed, the step stays on chain and the error propagates: the record says the agent
  decided, not that the action succeeded.
- `kill()` and `resume()` delegate to `OnchainGuard`, so they work only when `wallet` is the agent's owner (`NotOwner`
  otherwise).

## Files

```
kit/
  index.ts               openGuardedAgent, createGuardedAgent, GuardError and its codes, AgentFile, and the low level:
                         connect, fetchAgent, recordStep, stepMessage, signGuardMessage, decodeAgent
  guarded-agent.ts
  guarded-agent.test.ts
  agent-layout.test.ts   pins the Agent account layout the README documents
  example.ts
  README.md
```

## Testing

TDD with `bun test kit`, no network:

- `guarded-agent.test.ts` on `MemoryGuard`: `act()` runs after a recorded step and its result comes back; `act()` does
  not run for a Killed or Pending agent or a refused step, and the `GuardError` code comes through; the recorded hash is
  the SHA-256 of exactly the decision string; consecutive steps record counters 1, 2, 3; an `act()` that throws leaves
  the step recorded; `kill()` then `step()` refuses, `resume()` then `step()` runs.
- `agent-layout.test.ts`: an `Agent` account built byte by byte (discriminator, owner, agent key, status at offset 72,
  counter, last decision, bump) decodes through `decodeAgent` to the status the README states for each byte value
  (0 Active, 1 Killed, 2 Pending).

By hand on devnet: register an agent with the CLI, run `bun kit/example.ts` (three steps), kill it with
`bun scripts/agent.ts kill`, run the example again and see `AgentKilled` with no action run.

Before the PR: `bun run check`, `bun run lint` (no new warnings in touched files), `bun test`.

## README

`kit/README.md`, in this order:

1. What it is: before each action, the agent's decision is signed with its ML-DSA-44 key; the `onchain_agent_guard`
   program verifies that signature on devnet and records it; once the owner kills the agent, every further step is
   refused.
2. Setup, once, with the existing CLI and `.env` (`OWNER_KEYPAIR`, `OWNER_MLDSA_FILE`): `bun scripts/agent.ts
   register-owner`, then `AGENT_FILE=<path> bun scripts/agent.ts register`, which also activates the agent (`activate`
   retries an activation that failed). Back up `owner-mldsa.json` and the agent file. Costs: ~0.2 SOL for the owner key, ~0.2 SOL per agent, ~15,000 lamports per step.
3. Use: the snippet above, and what each error code means.
4. Kill and resume: `agent.kill()` / `agent.resume()` or the CLI; a resume needs the owner's ML-DSA-44 signature.
5. What it protects and what it does not, adapted from the parked kit: decisions get a record no one can forge without
   the ML-DSA-44 key; the agent's own Solana wallet is still Ed25519; only actions that go through `step()` are guarded;
   asking before acting gives a kill switch, recording after acting only an audit trail.
6. Gating your own on-chain program: before acting, it checks the `Agent` account it was given: owned by
   `GUARD_PROGRAM_ID`, the 8-byte `Agent` discriminator, the agent address it expects (kept in its own config), and
   `data[72] == 0` (Active; 1 Killed, 2 Pending). A short Rust snippet, no CPI. Funds held behind such a program are the
   only enforcement against an agent that skips `step()`.
7. Trust: the team holds the program's upgrade authority; the program is not immutable yet.

The root `README.md` gets one line linking to `kit/README.md`.
