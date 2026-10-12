# Design: many decisions in one transaction (Merkle root)

Date: 2026-10-11. Branch: `merkle_batch` (off `main` at `574bef8`). Status: design approved in brainstorming, awaiting
spec review.

## Goal

A fast agent submits decisions faster than one transaction each. The server buffers them per agent and flushes the
buffer as one transaction: one ML-DSA-44 signature over the Merkle root of the batch, verified on-chain by a new
`record_batch` instruction. Every decision in the log keeps its Merkle proof, so the audit (and anyone the owner shows a
single decision to) can check it against the root on-chain without the rest of the batch.

Decision 004 left the Merkle root out because every decision was its own transaction, and said it returns "only if many
decisions went into one transaction". This is that case; decision 007 replaces that paragraph of 004.

## Scope

In: `record_batch` in the program and its devnet upgrade, the Merkle module, the per-agent buffer and flush in the
server, `202` for batched agents, Tick accepting `202`, the audit of batches, the GUI (Merkle root box, batch in the
feed), `demo.ts` running Tick batched, decision 007, README.

Out (can be added later): batching agents chosen per fleet entry instead of `.env`; persisting the buffer across
restarts; a CLI that prints one decision with its proof for a third party; SHA3-256 instead of SHA-256.

## Program

New instruction, the others unchanged, same program ID (upgrade):

```
record_batch(root: [u8; 32], size: u32, signature: Vec<u8>)
  accounts: agent (mut, has_one = agent_key), agent_key   — as RecordStep
  require status == Active          else AgentKilled
  require size >= 1                 else EmptyBatch (new error)
  verify ML-DSA-44 over batch_message(agent, counter + 1, root, size)   else VerifyFailed
  counter += 1; last_decision = root
  emit BatchRecorded { agent, counter, root, size }
```

`batch_message = 3 ‖ agent (32 B) ‖ counter (u64 LE) ‖ root (32 B) ‖ size (u32 LE)`, same FIPS 204 context
`onchain-agent-guard:v1`. Tag 3 separates it from a step (1) and a resume (2), so no signature passes as another kind.

The program never sees the decisions: a batch costs one signature check, like a step, whatever its size. The size is a
server policy, not a compute limit.

`last_decision` keeps its name; it now holds the last step's hash or the last batch's root. The account layout does not
change, so registered agents keep working after the upgrade.

## Merkle tree

One TS module, `src/lib/server/modules/fleet/merkle.ts`, used by the flush and the audit:

- leaf = `SHA-256(0x00 ‖ decisionHash)`, where `decisionHash` = SHA-256 of the record JSON, as today;
- node = `SHA-256(0x01 ‖ left ‖ right)`;
- an odd node at the end of a level moves up unchanged (no duplication, so two different leaf lists never share a root;
  `size` is also on-chain);
- `merkleRoot(hashes) → root`, `merkleProof(hashes, index) → siblings[]` (bottom to top, each `{ hash, side }`),
  `verifyProof(hash, proof, root) → boolean`. Hex in, hex out, like the rest of the log.

SHA-256, not SHA3-256: `decisionHash` is already SHA-256, and SHA-256 keeps ~128-bit preimage security against Grover.

## Log record and entry

```ts
interface DecisionRecord { agent; counter; index?: number; kind; decision; summary; requiresApproval?; observedAt }
interface DecisionLogEntry {
  record; decisionHash; unconfirmed?: true;
  batch?: { root: string; size: number; proof: ProofStep[] };   // present iff the record went in a batch
}
```

In a batch every record carries the batch's `counter` and its `index` (0..size-1). Single steps have neither `index` nor
`batch`, so existing log lines stay valid.

## Server

Config (`.env`, read by `loadConfig`):

- `BATCHED_AGENT_IDS` — comma-separated, default empty: those agents batch, the rest work as today;
- `BATCH_FLUSH_MS` — default 10000;
- `BATCH_MAX_DECISIONS` — default 16.

`DecisionBatcher` (new, `fleet/decision-batcher.ts`), one per server, holds per agent a buffer of
`{ submission, observedAt }` and a timer.

Submitting, batched agent (`submitDecision`):

1. as today: agent in the fleet, `readAgent`, refused while a proposal waits, refused (409) while Killed;
2. no `requiresApproval`: push to the buffer, return `202 { queued: true }`; the throttle is not used. The buffer
   reaching `BATCH_MAX_DECISIONS` flushes it at once; the first decision in an empty buffer starts the
   `BATCH_FLUSH_MS` timer;
3. `requiresApproval`: flush the buffer, then record the decision as a single step, as today (`200 { counter }`).

Flush (`flushBatch`, next to `recordDecision` in `record-decision.ts`):

1. take the buffer (empty → nothing), `readAgent`, `assertSealed`;
2. build records `{ agent, counter: c + 1, index: i, ...submission, observedAt }`, hash each, `merkleRoot`;
3. `guard.recordBatch(agentId, c + 1, root, size)`;
4. landed: append N entries with `batch: { root, size, proof }`;
5. `GuardError` (e.g. AgentKilled): drop the batch, log nothing — a refusal records nothing, as for a step today;
6. any other error: append the N entries with `unconfirmed: true`, as today.

Flushes and single steps of one agent run one at a time (a per-agent promise chain in the batcher), so they never race
for a counter.

Loss on restart: buffered decisions that got `202` but were not flushed are lost. They never reached the chain, so the
log and the chain still agree; README says so.

`AgentGuard` gets `recordBatch(agentId, counter, root, size)`; `OnchainGuard` signs `batch_message` and sends
`record_batch`; the in-memory guard used by tests implements it too. `GuardEvent`/`LandedTransaction` gain
`BatchRecorded` with `root` and `size`. The IDL is regenerated.

## Agent

Tick treats `202` as success like `200` (log line "queued"). `demo.ts` runs Tick with `TICK_INTERVAL_MS=1000` and the
server with `BATCHED_AGENT_IDS=<tick id>`.

## Audit

- counter: steps, batches and resumes each advance it by one; 1..N exactly once, as today;
- `last_decision` equals the hash of the latest step or the root of the latest batch;
- per `BatchRecorded { counter, root, size }`: the log has exactly `size` entries at that counter with indexes
  0..size-1; each record hashes to its `decisionHash`; each entry's proof verifies against `root`; the root over all of
  them in index order equals `root`;
- a batch with no log entries, and log entries (not `unconfirmed`) with no batch or step on-chain, are problems, like
  steps today.

## GUI

- The hash box: after a batch it reads **"Quantum-Safe Merkle Root (SHA-256)"**, with "batch of N decisions · signed
  once with ML-DSA-44"; after a single step it keeps "Last decision (SHA-256)". The note under it names the
  `last_decision` field and `onchain_agent_guard`, as now.
- The feed shows a batch as one transaction: "Batch #c · N decisions · root ab12…" with its decisions under it.
- The agent card shows how many decisions are queued now.
- The parameter row (`+page.svelte`, "Decision hash") becomes "Decision hash / Merkle root".
- Blink description: "Merkle root (SHA-256)" after a batch, "Last decision (SHA-256)" after a step.

## Testing

- Rust (`guard.rs`): batch passes; wrong root, wrong size, wrong counter fail verification; size 0 → EmptyBatch;
  Killed → AgentKilled; a step after a batch uses the next counter. `message-vector.json` gains a batch vector, checked
  by `message_vector.rs` and `message.test.ts`.
- TS (bun test, TDD): `merkle.ts` (1, 2, 3, 5, 16 leaves; every proof verifies; a changed leaf or index fails);
  batcher (flush on size, on timer, on `requiresApproval`; refusal drops; timeout marks unconfirmed; serial per agent);
  `submitDecision` returns 202 for batched agents; audit (good batch, missing entry, wrong index, tampered record, bad
  proof, batch not in log).
- Live on devnet after the upgrade: `demo.ts`, a few batches from Tick land, `bun scripts/audit.ts tick-01` → history
  OK, the GUI shows the Merkle root.

## Deploy

`anchor build`, then `anchor upgrade` (or `solana program deploy --program-id …`) with the upgrade authority's key and
~2–3 devnet SOL held during the deploy in a buffer account and returned after. Until the upgrade lands, batched agents
fail with an unknown instruction, so `BATCHED_AGENT_IDS` stays empty in `.env.example`.

## Docs

- `spec/decisions/007-korzen-merkle-dla-paczki-decyzji.md` (Polish, like the other decisions): replaces 004's
  "Dlaczego nie ma korzenia Merkle"; what the root protects (one signature for N decisions, single-decision disclosure)
  and what it does not (buffered decisions lost on restart, not on-chain until the flush).
- `README.md`: the "No DMS" bullet no longer says "no Merkle root"; a short paragraph on batched agents and the three
  `.env` settings.
