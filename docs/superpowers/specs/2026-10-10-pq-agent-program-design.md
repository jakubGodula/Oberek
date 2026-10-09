# Design: one PQ-signed agent on Solana (program `onchain_agent_guard` + server agent)

Date: 2026-10-10. Branch: `first_agent`. Status: approved in brainstorming, awaiting spec review.

## Goal

One agent on devnet whose every step and every resume after a kill-switch is authorized by an ML-DSA-44 signature
verified on-chain, while the owner can stop it with their Ed25519 wallet alone. Demo scenario: the agent records
steps → the owner kills it → steps stop → the owner resumes it with a PQ-signed transaction → steps continue.

Builds on the decisions in `spikes/falcon-noble-compat/Podpis_PQ_jaki.md` ("Decyzje (09.10.2026)"): variant A
(on-chain verification), ML-DSA-44, one rule-based agent on the server, no AI model. `spec/ARCHITECTURE.md` is
reference only.

## Scope

In: the Anchor program, a TypeScript client module on `@solana/kit`, an agent loop and an owner CLI run with Bun,
tests, a manual devnet run.

Out (later specs): wiring into the SvelteKit UI and endpoints (`blink.service.ts`, `pqc-crypto.service.ts` stay
unchanged), running the loop inside the SvelteKit server, a real decision rule or AI model, moving funds, closing
the agent and reclaiming rent, key rotation, a separate operator PQ key, Falcon, `--final` upgrade authority (done
at the demo deploy).

## 1. Program `onchain_agent_guard`

Anchor workspace in `onchain/` (`Anchor.toml`, `Cargo.toml`, `programs/onchain_agent_guard`), separate from the SvelteKit
`package.json`. Toolchain and build rules from `spikes/pq-verify-anchor/README.md`: Anchor 1.2.1, Agave 4.3.0,
SBPF v3, Docker build, overflow checks off for the `solana-ml-dsa` crate only, `Cargo.lock` committed,
`[programs.localnet]` kept in `Anchor.toml`, build output checked for stack frame errors.

### Accounts

| Account | Kind | Size | Contents |
|---|---|---|---|
| `AgentKey` | `zero_copy`, keypair address, created by the client | 20,552 B (as in the spike) | prepared ML-DSA-44 public key (SHAKE mode, FIPS 204) |
| `Agent` | PDA, seeds `["agent", owner, agent_key]` | 8 + 106 B | `owner: Pubkey`, `agent_key: Pubkey`, `status: Active \| Killed`, `counter: u64`, `last_decision: [u8; 32]`, `bump: u8` |

`AgentKey` never changes after registration. `Agent` is the only mutable state.

### Instructions

| Instruction | Accounts | Requires | Effect |
|---|---|---|---|
| `register_agent(public_key: Vec<u8>)` | `owner` (signer, payer), `agent_key` (`#[account(zero)]`), `agent` (`init`, PDA), System Program | empty `agent_key`; 1,312 B key | prepares the key into `agent_key`; `agent` = Active, counter 0, `last_decision` zeroed |
| `record_step(decision_hash: [u8; 32], signature: Vec<u8>)` | `agent` (mut, `has_one = agent_key`), `agent_key` | Active; valid ML-DSA signature | `counter += 1`, `last_decision = decision_hash`, emit `StepRecorded { agent, counter, decision_hash }` |
| `kill()` | `owner` (signer), `agent` (mut, `has_one = owner`) | Active | `status = Killed`, emit `AgentKilled { agent, counter }` |
| `resume(signature: Vec<u8>)` | `owner` (signer), `agent` (mut, `has_one = owner`, `has_one = agent_key`), `agent_key` | Killed; valid ML-DSA signature | `counter += 1`, `status = Active`, emit `AgentResumed { agent, counter }` |

`register_agent` is sent together with a preceding System Program `create_account` for `agent_key` in the same
transaction, because `init` cannot allocate more than 10 KiB through CPI. `record_step` needs no transaction signer
beyond the fee payer: the ML-DSA signature is the authorization. `kill` needs only the owner's wallet, so the owner
can stop the agent while the server is down or compromised. `resume` needs both the owner's wallet and the agent's
PQ signature, so neither a compromised server nor a forged Ed25519 signature resumes the agent alone.

### Signed message

The program builds the message from on-chain data; the caller supplies only the signature (and, for a step, the
decision hash):

```
tag (u8: 1 = step, 2 = resume) ‖ Agent address (32 B) ‖ new counter = counter + 1 (u64 LE) ‖ decision_hash (32 B, step only)
```

FIPS 204 context string: `onchain-agent-guard:v1`, a constant in the program and in the client. Binding the Agent address,
the counter and the tag stops a signature from being replayed on another agent, at another position, or as the other
action. Resume consumes a counter value, so a resume signature works once.

### Decision hash

The program does not interpret `decision_hash`; it proves that the agent's key signed those 32 bytes at that
counter. The rule lives on the server, so changing it does not change the program. The program cannot enforce that a
decision follows the rule; that is checked off-chain by recomputing the hash from the logged record.

### Errors

`AgentKilled` (step while Killed), `AgentNotKilled` (resume while Active), `AgentNotActive` (kill while Killed),
`InvalidPublicKey`, `InvalidSignature` (wrong length), `VerifyFailed`. A wrong owner or key fails Anchor's
`has_one`; a missing owner signature fails `Signer`.

## 2. TypeScript client and agent

New module `src/lib/server/modules/agent/` (the agent loop and the client of `onchain_agent_guard`). New dependencies: `@solana/kit`, `@solana-program/system`
(`@noble/post-quantum` is already present).

| File | Responsibility |
|---|---|
| `message.ts` | pure functions building the step and resume message bytes; the context constant |
| `instructions.ts` | the four instructions as `@solana/kit` instructions, hand-written (Anchor discriminators + Borsh); `Agent` PDA derivation; `Agent` account decoding |
| `transaction.ts` | builds and sends V1 transactions with an explicit compute unit limit and loaded accounts data size limit on every transaction (unset means zero in V1); pattern from `spikes/mldsa44-dilithium-noble-compat/js/devnet-client.cjs`. Limits: 1,400,000 CU for register; step and resume set from the Mollusk measurement plus margin |
| `agent-loop.ts` | one cycle and the loop around it, with its dependencies (read agent, send step, append log, clock) injected |
| `config.ts` | environment: `AEGIS_PROGRAM_ID`, `SOLANA_RPC_URL`, `AGENT_TICK_MS`, path to the ML-DSA secret key file, path to the fee payer keypair, path to the owner keypair (CLI only) |

### Cycle (every `AGENT_TICK_MS`)

1. Read the `Agent` account. The on-chain counter is the only source of truth; the server keeps no state.
2. If Killed: log "paused", send nothing. After a resume the next tick continues without a restart.
3. If Active: build the record `{ agent, counter: n + 1, decision: "TICK", observedAt }`, serialize it canonically
   (fixed key order, no whitespace), `decision_hash = SHA-256(record)`, sign the step message with ML-DSA-44 and the
   context, send `record_step`.
4. Append the record, its hash and the transaction signature as one line to `.devnet/decisions.jsonl` (gitignored).

Errors: a kill landing between read and send fails the transaction with `AgentKilled`; RPC errors and timeouts; a
counter mismatch (e.g. two loops running). Each is logged and the next tick starts again from step 1. The loop never
exits on a failed cycle.

### CLI `scripts/agent.ts` (Bun)

| Command | Signers | Does |
|---|---|---|
| `register` | owner, new `AgentKey` keypair | generates the ML-DSA-44 key pair, writes the secret key file, sends `create_account` + `register_agent` |
| `run` | fee payer | runs the agent loop |
| `kill` | owner | sends `kill` |
| `resume` | owner | signs the resume message with the agent's ML-DSA key (read from the same secret key file as `run`), sends `resume` |
| `status` | — | prints the decoded `Agent` account |

The loop runs as its own process (`bun scripts/agent.ts run`), not inside SvelteKit; moving it into
`hooks.server.ts` belongs to the UI spec. The agent's ML-DSA secret key and the fee payer stay on the server.

## 3. Testing

### Program (Rust, Mollusk 0.16, Docker)

Fixtures are generated by a noble script (pattern from `spikes/pq-verify-anchor/js/gen-fixtures.cjs`) with fixed
owner and `AgentKey` keypairs, so the `Agent` address is known and the script signs messages for given counters.
This also checks noble against the on-chain verifier.

Cases:

1. register → Active, counter 0
2. valid step → counter 1, `last_decision` set
3. tampered signature → `VerifyFailed`
4. the same step signature again → `VerifyFailed`
5. step after kill → `AgentKilled`
6. kill by a non-owner → `has_one` error
7. resume without the owner's signature → error
8. valid resume → Active, counter + 1
9. replayed resume signature → rejected

The test prints CU for register, step and resume.

### Message parity

`onchain/fixtures/message-vector.json` holds a fixed Agent address, counter and decision hash with the expected
step and resume message bytes in hex. The Rust test and `bun test` both check it.

### TypeScript (`bun test`)

- `message.ts` against the vector.
- `instructions.ts` discriminators against the IDL produced by `anchor build`.
- `agent-loop.ts` with injected fakes: Killed sends nothing; Active sends `record_step` with counter n + 1 and the
  hash of the record; a send error is logged and the loop continues.

### Devnet (manual)

Deploy from Docker (program ~340 KB, ~2.4 SOL rent; payer `ftbM4rfE…` has ~7.39 SOL; upgrade authority kept), then
`register` → `run` for at least 3 ticks → `kill` (loop logs "paused") → `resume` (loop continues, counter
contiguous). Record CU, transaction sizes and signatures in `onchain/README.md`.

## Done when

Mollusk tests pass, `bun test src` passes (existing 3 tests plus the new ones), the devnet scenario passed and its
results are in `onchain/README.md`.
