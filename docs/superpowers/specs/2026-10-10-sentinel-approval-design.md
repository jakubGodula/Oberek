# Design: Sentinel approvals, a simulated price shock and a decision feed

Date: 2026-10-10. Branch: `first_agent` (kept local). Status: approved in brainstorming, awaiting spec review.

## Goal

Make Sentinel's decisions readable on the page and add a human approval step. A rebalance worth more than a share
of the treasury becomes a **proposal**: the agent stops itself and waits until a human accepts or rejects it. For the
demo, a button arms a one-off **simulated price shock** that triggers such a proposal on demand; every other decision
still comes from the live Jupiter price.

Two different human actions, kept apart on the page:

- **Kill switch** (exists): an emergency stop from outside, enforced by `onchain_agent_guard` (`kill` / `resume`).
- **Autoryzuj krok** (new): the agent itself asks; the human accepts or rejects.

Builds on the Sentinel spec (`2026-10-10-sentinel-agent-design.md`) and the fleet runtime.

## Scope

In: the approval rule and shock in Sentinel; approval state, verdicts and the shock store on the server; a decision
feed, an approval panel, the shock button, split HITL buttons and verdicts in the observability log on the page.

Out: enforcing approvals in the guard program (a later `AwaitingApproval` status; the page and agent would not
change); approvals for Tick, Arbiter or Guardian; the GUI honesty pass; real trades.

## 1. The approval protocol

**Where it is enforced.** Agents reach the chain only through the server, which holds their ML-DSA keys and signs
their steps, so the server is the gate. The guard program is unchanged: proposals and verdicts are ordinary steps.

**Proposal.** A submission may carry `requiresApproval: true` (a fourth, optional field next to `kind`, `decision`,
`summary`; any other value is a 400). The server records it like any step and copies the flag into the
`DecisionRecord` and so into its hash.

**Awaiting approval** = the agent's latest decision recorded on chain (`latestDecision`, verified against the guard's
`lastDecision`) has `requiresApproval: true`.

**While awaiting**, `submitDecision` refuses the agent's steps with `AwaitingApprovalError` → **409
`AwaitingApproval`**, before the throttle and before any transaction, so a waiting agent costs nothing.

**Verdict.** `POST /api/agents/<id>/approval` with `{ "verdict": "accept" | "reject" }`:

1. The agent must be awaiting approval, else **409 `NoPendingProposal`**.
2. The server records the verdict as the agent's next step (signed with the agent's key, like every step), not
   throttled: it is the owner's action, like kill and resume. A killed agent refuses it (409 `AgentKilled`): resume
   first.
3. Answers 200 `{ "counter" }`; 400 for a bad body; other errors as in `POST …/decisions`.

The verdict record (`kind: "approval"`):

```json
{
  "verdict": "accept",
  "proposal": { "counter": 97, "decisionHash": "ab12…", "kind": "sentinel", "decision": { … }, "summary": "…" },
  "decidedBy": "ftbM…"
}
```

`decidedBy` is the owner address whose key the server holds: as with kill and resume, whoever reaches the server can
decide (a known limitation until wallet signing). Summary: `APPROVED: <proposal summary>` or `REJECTED: <proposal
summary>`.

**Kill switch** is independent: it works while a proposal waits; after resume the proposal is still pending.

**Units:** `fleet/approval.ts` with `pendingProposal(runtime, agentId)` (the latest entry or `null`) and
`recordVerdict(runtime, agentId, verdict)`; `submitDecision` and `parseSubmission` gain the flag and the refusal;
`http-errors.ts` maps `AwaitingApprovalError` and `NoPendingProposalError` to 409; route
`src/routes/api/agents/[id]/approval/+server.ts`, which goes through `blinkService.decideProposal(agentId, verdict)`
so the verdict also lands in the observability log (section 4).

## 2. The simulated price shock

The server keeps at most one armed shock per fleet agent, in memory (a restart drops it).

- `POST /api/agents/<id>/shock` with `{ "pct": -3 }` arms it, replacing an armed one. `pct` must be a finite non-zero
  number with `|pct| ≤ 50`, else 400; an agent not in the fleet → 404.
- `POST /api/agents/<id>/shock/claim` returns `{ "shock": { "pct": -3 } }` and disarms it, or `{ "shock": null }`.
- The agent view model reports `shockArmed: boolean` so the page can show it.

**Unit:** `fleet/shock-store.ts` (`arm`, `claim`, `isArmed`), one instance in the app runtime.

## 3. Sentinel

**Cycle**, in order:

1. `latest()`. If the record has `requiresApproval: true` → log `waiting for approval (#<counter>)` and skip: no
   shock claim, no price, no submission.
2. Continue from the record (see *Continuing from a verdict*).
3. Fetch the Jupiter price, then `claimShock()`. With a shock, `usd = realUsd × (1 + pct / 100)` and the reading
   becomes `{ usd, source, observedAt, simulatedShock: { pct, realUsd } }`. A failed claim is logged and the cycle
   goes on without a shock (the shock stays armed only if the claim never reached the server).
4. `decide()`, then submit with `requiresApproval` when the decision needs approval.

**Approval rule** in `decide`: a `REBALANCE` whose `trade.usdc` exceeds `approvalShare × total value before` gets
`approval: "required"`. The decision is otherwise unchanged: `trade`, and `after` = the portfolio **if approved**, and
`lastRebalanceAt` = its own time. `policy` gains `approvalShare`.

**Continuing from a verdict** (`previousFrom`), for a record of kind `approval` whose `proposal` is a valid Sentinel
decision:

- `accept` → `{ after: proposal.after, lastRebalanceAt: proposal.lastRebalanceAt }`: the trade is applied.
- `reject` → `{ after: proposal.before (sol, usdc), lastRebalanceAt: proposal.lastRebalanceAt }`: the trade is not
  applied, and the schedule restarts so it does not re-propose at once. A real drift still re-proposes on the next
  cycle.

Anything else of kind `approval` → the cycle is skipped, as for a malformed Sentinel record.

**Summaries:**

- `PROPOSE (drift, needs approval): buy 14.603 SOL @ $106.51 (SOL 49.25% → 50.00%) [simulated shock -3%]`
- any decision made at a shocked price ends with ` [simulated shock -3%]`; the other lines are unchanged.

**Client** (`agents/shared/runtime-client.ts`): `submit` takes the optional `requiresApproval`; a 409 whose `error`
is `AwaitingApproval` becomes `{ kind: 'awaiting' }` (logged `refused: waiting for approval`), any other 409 stays
`paused`; new `claimShock()` returns `{ pct } | null` or a failure.

**Config:**

| Variable | Default |
|---|---|
| `SENTINEL_APPROVAL_PCT` | `0.25` (% of the treasury's value) |

For the demo: `SENTINEL_SCHEDULE_MIN=2` (advice every ~2 min) and optionally `SENTINEL_INTERVAL_MS=10000` (the
shock lands within ~15 s instead of ~35 s, ~0.13 SOL a day).

**Why 0.25%.** Replaying the 97 prices recorded on 2026-10-10 (64 min, $109.50–109.81) with a 2-minute schedule gave
trades of $1–60 (≤ 0.03% of the ~$206k treasury). A −3% shock from today's portfolio gives `buy 14.603 SOL` ≈
$1,555 (0.75%). 0.25% (~$520) separates them with a wide margin and would still catch a real move of about 1%.

## 4. The page (fleet agents; the mocks are unchanged)

**Status.** A new card status `AWAITING_APPROVAL` (amber), when the guard says `Active` and a proposal is pending.
`Killed` → `PAUSED` takes precedence.

**View model.** For a fleet agent, `toAgentStatusRecord` adds `pendingProposal` (counter, summary, decision) or
`null`, and `shockArmed`.

**Decision feed** (centre column, under the agent card), from new `GET /api/agents/<id>/decisions?limit=10`: the last
log entries, newest first; an `unconfirmed` entry is shown with an *unconfirmed* mark. Each row: time, `#counter`, an action chip
(HOLD grey, REBALANCE green, AWAITING APPROVAL amber, APPROVED green outline, REJECTED red outline), price, SOL share
before → after, the trade, and a `simulated shock` badge. Records of other kinds (Tick) show their summary only.
Refreshed with the page's existing 5-second refresh.

**Approval panel.** While a proposal waits: an amber panel at the top of the feed with the proposal's trade, reason
and price, and **Zatwierdź** / **Odrzuć**, which call the verdict route.

**HITL console** for fleet agents:

- **Autoryzuj krok** and **Odrzuć**: enabled only while awaiting approval; they send the verdict.
- **Kill-switch** while active or awaiting; **Wznów** while killed (the existing resume).

**Observability log** (right column). Every verdict is an entry, next to kill and resume:

- `accept` → chip **APPROVED** (emerald), `reject` → chip **REJECTED** (amber); operator `decidedBy`, new status
  `ACTIVE`, root = the verdict's decision hash, memo `AEGIS_PQC_DMS:<agent>:ACCEPT|REJECT:<root prefix>`.
- A fleet agent's resume is recorded as `resume` with chip **RESUME**, so it is no longer shown as APPROVE; the
  mocks keep `approve`.

**Shock button** at the bottom of the agent card, Sentinel only: **Symuluj szok ceny (−3%)**; after arming it reads
*Szok uzbrojony — w następnym cyklu* until the agent claims it.

## 5. Testing

TDD with `bun test`, no network:

- Policy: a trade above the approval share is a proposal with `after` as if approved; at or below it is not; a
  `HOLD` never needs approval; a shocked reading puts the shock in the summary.
- `previousFrom`: accept applies the trade; reject keeps `before` and moves `lastRebalanceAt`; an `approval` record
  with a malformed proposal throws.
- Cycle: a pending proposal skips the cycle without claiming a shock; a claimed shock changes the price and keeps
  `realUsd`; a failed claim goes on without a shock; a proposal is submitted with `requiresApproval`.
- Client: `AwaitingApproval` 409 → `awaiting`; other 409 → `paused`; `claimShock` answers and failures.
- Server: `parseSubmission` with and without the flag, a non-`true` flag rejected; `submitDecision` refuses while
  pending and records otherwise; `recordVerdict` accept and reject records, `NoPendingProposal`, killed agent; shock
  store arm, replace, claim once, bad `pct`; `decideProposal` adds an APPROVED / REJECTED history entry and a fleet
  resume adds RESUME; the decisions list route returns the newest entries first and keeps the `unconfirmed` mark.
- Live on devnet: shock → proposal on chain → card AWAITING APPROVAL → accept → APPROVED in the observability log →
  Sentinel continues from the traded portfolio; again with reject → portfolio unchanged; kill while pending → resume → still pending.
