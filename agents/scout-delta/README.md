# Scout Delta

A market-signal agent that runs as its own process. Every tick it reads a fake SOL price, decides BUY, SELL or HOLD
(`strategy.ts`) and submits the decision to the server over HTTP (`runtime-client.ts`). The server records it only
while the agent's guard lets it act; after the owner's kill-switch it answers 409 and the agent keeps trying on the
next tick. The agent imports nothing from the server's code, holds no keys and keeps no status of its own.

## Run

Register the agent once (from the repo root), then start it next to the dev server:

```sh
bun scripts/fleet.ts register scout-04 --name "Scout Delta — Market Signals" --risk MEDIUM \
  --owner 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU
bun agents/scout-delta
```

| Variable | Default |
|---|---|
| `SCOUT_API_URL` | `http://localhost:5173` |
| `SCOUT_AGENT_ID` | `scout-04` |
| `SCOUT_TICK_MS` | `5000` |

## Contract

`POST {SCOUT_API_URL}/api/agents/{SCOUT_AGENT_ID}/decisions` with `{ kind, decision, summary }`:
200 `{ counter }` recorded, 409 killed by the owner, 404 not in the fleet, 400 malformed, 429 too soon (on devnet at most one step per agent every 10 s), 502 the guard gave no
verdict (e.g. RPC failure).

## Test

```sh
bun test agents/scout-delta
```
