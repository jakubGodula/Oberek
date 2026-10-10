# Sentinel

Rebalances a virtual SOL/USDC treasury from the live SOL price. It trades nothing and holds no tokens: the treasury
is numbers inside its decisions, starting at 1,000 SOL + 100,000 USDC. Each cycle it reads its last decision recorded
on chain from the server, reads the SOL price from the Jupiter Price API, and submits `REBALANCE` (back to 50% SOL)
when the SOL share drifted out of the band or the last rebalance is 15 minutes old, otherwise `HOLD`. Every decision
carries its inputs (price, time, policy) and the portfolio before and after, so anyone can check it against the hash
on chain. Design: `docs/superpowers/specs/2026-10-10-sentinel-agent-design.md`.

## Run

Register it and put it in the fleet once (from the repo root, with `.env` set up as in the root README), then start
it next to the server (`bun run dev`):

```sh
AGENT_FILE=.devnet/agents/sentinel-01.json bun scripts/agent.ts register
bun scripts/fleet.ts import .devnet/agents/sentinel-01.json --as sentinel-01 --name "Aegis Sentinel Alpha — Treasury Rebalancer" --risk MEDIUM
bun agents/sentinel
```

| Variable | Default |
|---|---|
| `SENTINEL_API_URL` | `http://localhost:5173` |
| `SENTINEL_AGENT_ID` | `sentinel-01` |
| `SENTINEL_INTERVAL_MS` | `30000` (each decision is a paid devnet step) |
| `SENTINEL_DRIFT_PP` | `0.02` (band around the 50% target, in percentage points) |
| `SENTINEL_SCHEDULE_MIN` | `15` |

A cycle whose last decision or price is unavailable is skipped: nothing is submitted, and the treasury is never reset
to the initial holdings. While the owner has killed the agent its decisions are refused and the treasury stays frozen.

## Test

```sh
bun test agents/sentinel
```
