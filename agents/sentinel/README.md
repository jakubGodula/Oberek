# Sentinel

Rebalances a virtual SOL/USDC treasury from the live SOL price. It trades nothing and holds no tokens: the treasury
is numbers inside its decisions, starting at 1,000 SOL + 100,000 USDC. Each cycle it reads its last decision recorded
on chain from the server, reads the SOL price from the Jupiter Price API, and submits `REBALANCE` (back to 50% SOL)
when the SOL share drifted out of the band or the last rebalance is 15 minutes old, otherwise `HOLD`. Every decision
carries its inputs (price, time, policy) and the portfolio before and after, so anyone can check it against the hash
on chain. Design: `docs/superpowers/specs/2026-10-10-sentinel-agent-design.md`. Approvals and the shock:
`docs/superpowers/specs/2026-10-10-sentinel-approval-design.md`.

## Run

Register it and put it in the fleet once (from the repo root, with `.env` set up as in the root README), then start
it next to the server (`bun run dev`):

```sh
AGENT_FILE=.devnet/agents/sentinel-01.json bun scripts/agent.ts register
bun scripts/fleet.ts import .devnet/agents/sentinel-01.json --as sentinel-01 --name "Oberek Sentinel Alpha — Treasury Rebalancer" --risk MEDIUM
bun agents/sentinel
```

| Variable | Default |
|---|---|
| `SENTINEL_API_URL` | `http://localhost:5173` |
| `SENTINEL_AGENT_ID` | `sentinel-01` |
| `SENTINEL_INTERVAL_MS` | `30000` (each decision is a paid devnet step) |
| `SENTINEL_DRIFT_PP` | `0.02` (band around the 50% target, in percentage points) |
| `SENTINEL_SCHEDULE_MIN` | `15` |
| `SENTINEL_APPROVAL_PCT` | `0.25` (a rebalance worth more than this % of the treasury waits for approval) |

## Approval and the demo price shock

A rebalance worth more than `SENTINEL_APPROVAL_PCT` of the treasury is a **proposal**: Sentinel records it on chain
and stops. The server refuses its decisions until the owner accepts or rejects the proposal on the page (or
`POST /api/agents/sentinel-01/approval` with `{"verdict":"accept"}`). The verdict is recorded on chain as the next
step; Sentinel then continues from the traded portfolio (accept) or from the one before the proposal (reject). A
Sentinel started from the initial holdings proposes its first rebalance (~2.25% of the treasury).

On a quiet day trades stay far below the threshold. For the demo, **Symuluj szok ceny (−3%)** on the card (or
`POST /api/agents/sentinel-01/shock` with `{"pct":-3}`) arms a one-off shock: the next cycle decides at the real
Jupiter price moved by −3%, records both prices and marks the summary `[simulated shock -3%]`.

Demo pace: `SENTINEL_SCHEDULE_MIN=2 SENTINEL_INTERVAL_MS=10000 bun agents/sentinel` (advice every ~2 min, a shock
lands within ~15 s; ~0.13 SOL a day).

A cycle whose last decision or price is unavailable is skipped: nothing is submitted, and the treasury is never reset
to the initial holdings. While the owner has killed the agent its decisions are refused and the treasury stays frozen.

## Test

```sh
bun test agents/sentinel
```
