# onchain_agent_guard

Solana program (Anchor 1.2.1) that guards one server-side agent. It stores the agent's ML-DSA-44 public key, accepts
a step or a resume only with a valid ML-DSA-44 signature over a message it builds itself (FIPS 204 context
`onchain-agent-guard:v1`), and lets the owner's wallet kill the agent. Design:
`docs/superpowers/specs/2026-10-10-pq-agent-program-design.md`.

## Test

```sh
onchain/run-tests.sh    # Docker (x86_64) + Bun; append 2>/dev/null to hide cargo logs
```

Builds the program in Docker (the host's glibc 2.31 is too old for the Agave and Anchor CLIs), copies the IDL to
`src/lib/server/modules/agent/onchain_agent_guard.idl.json`, writes fresh noble fixtures with
`scripts/gen-guard-fixtures.ts` and runs the Mollusk tests in `programs/onchain_agent_guard/tests/`.

The program keypair is `onchain/.devnet/program-keypair.json`: gitignored and the only copy, so back it up.

## Deploy to devnet

```sh
onchain/deploy-devnet.sh      # builds, deploys or upgrades at onchain/.devnet/program-keypair.json, prints GUARD_PROGRAM_ID
cp .env.example .env          # then set GUARD_PROGRAM_ID
```

The payer is `spikes/falcon-noble-compat/.devnet/payer.json`. The program is 423 KB and locks ~2.95 SOL rent. The
upgrade authority stays with the payer until the demo deploy (`solana program set-upgrade-authority --final`).
Deployed: `BL6Fjh4pADgjvZwaueeAcc7rYddFrdMNWnqK73x78ZSs`.

## Agent CLI

```sh
bun scripts/agent.ts register   # new ML-DSA-44 key + Agent; writes .devnet/agent.json (refuses to overwrite it)
bun scripts/agent.ts run        # the agent loop: one TICK step every AGENT_TICK_MS, log in .devnet/decisions.jsonl
bun scripts/agent.ts kill       # owner's wallet only
bun scripts/agent.ts resume     # owner's wallet + the agent's ML-DSA-44 signature
bun scripts/agent.ts status
```

## Devnet end-to-end check

```sh
bun scripts/devnet-e2e.ts       # fresh agent: register → 3 steps → kill (step rejected) → resume → step; PASS/FAIL
```

Costs ~0.15 SOL per run (key account rent). The public devnet RPC rate-limits each method (e.g. 10 `getTransaction`
per window) and answers bursts with HTTP 429; the client retries those after 10 s (`withRateLimitRetry` in
`src/lib/server/modules/agent/transaction.ts`).

### Result (2026-10-10 01:36 Europe/Warsaw: PASS)

| Step | CU | V1 tx |
|---|---:|---:|
| register (create key account + prepare key + init Agent) | 1,093,189 | 1,736 B |
| record_step | 271,845–272,112 | 2,720 B |
| kill | 2,362 | 232 B |
| record_step while killed → `AgentKilled` | 3,639 | 2,720 B |
| resume | 262,281 | 2,689 B |

Program `BL6Fjh4pADgjvZwaueeAcc7rYddFrdMNWnqK73x78ZSs`, agent `GKhjRGXYJSz4cVXBo5kCQCu5Urynr5Nmbzuwfb2e67E7`
([explorer](https://explorer.solana.com/address/GKhjRGXYJSz4cVXBo5kCQCu5Urynr5Nmbzuwfb2e67E7?cluster=devnet)).
