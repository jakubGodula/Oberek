# Tick

The simplest agent: every tick it submits the same decision, `TICK`, to the server over HTTP. It runs as its own
process, imports nothing from the server's code, holds no keys and keeps no status of its own. With `CHAIN=devnet` the
server signs each TICK with the agent's ML-DSA-44 key and records it with the `onchain_agent_guard` program; after the
owner's kill-switch the server answers 409 and Tick keeps trying on the next tick.

## Run

Put the agent in the devnet fleet once (from the repo root), run the server in devnet mode (`CHAIN=devnet` in `.env`,
or in `.env.devnet` with `bun run dev -- --mode devnet`), then start the agent:

```sh
CHAIN=devnet bun scripts/fleet.ts import .devnet/agent.json --as tick-01 --name "Tick One — on-chain heartbeat"
bun agents/tick
```

| Variable | Default |
|---|---|
| `TICK_API_URL` | `http://localhost:5173` |
| `TICK_AGENT_ID` | `tick-01` |
| `TICK_INTERVAL_MS` | `30000` (each step is a paid devnet transaction) |

## Contract

`POST {TICK_API_URL}/api/agents/{TICK_AGENT_ID}/decisions` with `{ kind, decision, summary }`: 200 `{ counter }`
recorded, 409 killed by the owner, 404 not in the fleet, 400 malformed, 429 too soon (on devnet at most one step per agent every 10 s), 502 the guard gave no verdict (e.g. RPC failure).

## Test

```sh
bun test agents/tick
```
