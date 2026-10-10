# Auditing an agent's history

`scripts/audit.ts` checks that what a fleet agent's decision log says happened matches, step by step, what the
guard program recorded on-chain. The chain proves *that* each hash was recorded, in order and signed by the agent;
the log shows *what* each hash stands for. The audit checks that the two fit together.

Run it with `bun scripts/audit.ts <agent id>`. It is read-only: it sends no transactions and costs no fees.

## What is where

Each decision of a fleet agent is written to two places:

- **The log**, `.devnet/fleet/<id>/decisions.jsonl`: the full record (what the agent observed, what it decided,
  when) and `decisionHash = sha256(JSON.stringify(record))`, keys in the order the log keeps them.
- **The chain**: a `record_step` transaction to `onchain_agent_guard` with the counter, the hash and the agent's
  ML-DSA-44 signature. The program verifies the signature and emits a `StepRecorded` event.

The agent account (PDA) keeps only the current `counter`, `status` and the latest hash in `last_decision`. Earlier
hashes are not in the account: they live only in the account's transaction history, as events in the transaction
logs.

### Why a kill does not move the counter

The counter protects the agent's own ML-DSA signatures from replay. `record_step` and `resume` are signed by the agent
over a message that includes `counter + 1`; the program verifies that and stores the new counter, so an old
signature can never be accepted again.

`kill` is the owner's emergency brake: it needs no agent signature, only the owner's Solana transaction signature,
which Solana itself protects from replay. It sets `status = Killed` and logs the current counter in `AgentKilled`
to mark where in the history it happened. `resume` must move the counter: otherwise a once-seen resume signature
could be replayed to undo any later kill.

So counters 1..N are covered by steps and resumes only; a kill shares its counter with the step before it.

## How it works

### 1. Read the account

`fetchAgent` reads the account, e.g. `counter = 388, last_decision = ab12…`. It is read **first**, and its counter is
the audit's cutoff: events and log entries past it (an agent still running records more steps while the history is
fetched) are counted as `newer` and not audited, so they never show as problems.

### 2. Fetch the history

`fetchGuardEvents` (`src/lib/server/modules/agent/guard-client.ts`):

- `getSignaturesForAddress(agent)` lists every transaction that touched the account, 1000 per page; failed ones are
  dropped, they changed nothing.
- `getTransaction` fetches each transaction's logs, one at a time. The free-tier devnet RPC throttles this to about
  3 s per transaction, ~20 minutes for 400. A transaction or its logs missing from the RPC is an error, not a gap.

`parseGuardEvents` (`src/lib/server/modules/agent/events.ts`) decodes the events from the logs. Anchor's `emit!`
logs each event as `Program data: <base64>`: 8 bytes of discriminator (`StepRecorded`, `AgentKilled` or
`AgentResumed`), then the agent, the counter and, for a step, the hash.

Any program can log bytes that look like a guard event, so only data logged while the guard program itself is
executing counts. The parser keeps a stack of the programs in progress: an `invoke` line pushes, a `success` or
`failed` line pops, and a `Program data:` line is decoded only when the guard program is on top.

### 3. Compare

`auditHistory` (`src/lib/server/modules/fleet/audit.ts`) runs five checks. The first two check that the chain is
complete, the other three that the log backs it.

| Check                   | Compares                                                                                | A problem means                                                                 |
| ----------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `counterProblems`       | each counter 1..N has exactly one step or resume                                        | a gap: the RPC lost the transaction (pruned); a repeat: a program bug           |
| `lastDecisionProblems`  | the account's `last_decision` equals the last step's hash                               | the account and its history disagree                                            |
| `logHashProblems`       | `sha256(record)` equals the `decisionHash` stored beside it                             | the record was edited after it was logged                                       |
| `unloggedStepProblems`  | every on-chain step has a log entry with the same hash                                  | a hash is on-chain, but nobody can show which decision it stands for            |
| `unrecordedLogProblems` | every log entry not marked `unconfirmed` is on-chain with the same hash                 | the log claims a step that never landed                                         |

An `unconfirmed` entry is one whose send failed without a clear answer: it may or may not have landed, so it is not
required to be on-chain.

Signatures are not checked again: the program verified each one when it accepted the step, so a `StepRecorded`
event on-chain means a valid signature.

## Example

`bun scripts/audit.ts sentinel-01` on 2026-10-10:

```
agent sentinel-01 (7iin1WNs…), Active, counter 388
on-chain: 383 steps, 5 resumes, 5 kills; log: 383 entries
history OK
```

383 steps and 5 resumes cover counters 1..388; each kill was followed by a resume; every step has its log record.

`tick-01` reports 10 problems, `step 1–10: on-chain, but not in the log`. These are expected: its first 10 steps
were run with `bun scripts/agent.ts run` before the import into the fleet, so their records are in the CLI log
`.devnet/decisions.jsonl`, which the audit does not read.

## Not covered

- Reading the CLI log `.devnet/decisions.jsonl` as a second source (would clear the expected `tick-01` problems).
- Verifying ML-DSA-44 signatures offline (the program already did).
- Speeding up the fetch with a paid RPC or batched requests.
