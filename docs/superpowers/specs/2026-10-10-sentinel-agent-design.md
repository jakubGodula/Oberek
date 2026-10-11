# Design: Sentinel, a treasury rebalancer driven by the live SOL price

Date: 2026-10-10. Branch: `first_agent`. Status: approved in brainstorming, awaiting spec review.

## Goal

Replace the mock `sentinel-01` card with a real on-chain agent that decides from real data. Sentinel holds a virtual
SOL/USDC treasury, reads the live SOL price from Jupiter every cycle and decides `REBALANCE` or `HOLD`. It trades
nothing and holds no tokens: the treasury is virtual, numbers inside its decisions. Each decision, with its inputs and
the resulting portfolio, is hashed, signed with the agent's ML-DSA-44 key and recorded by `onchain_agent_guard` like
Tick's steps. Demo: the card shows rebalances and holds as the price moves; the owner kills the agent and the treasury
freezes; after resume it continues from the last recorded portfolio.

Builds on the fleet runtime (`src/lib/server/modules/fleet/`) and the Tick agent (`agents/tick/`): agents are separate
processes that talk to the server only over HTTP and hold no keys.

## Scope

In: the Sentinel agent (`agents/sentinel/`), a client shared by the agents (`agents/shared/`), the server endpoint
`GET /api/agents/<id>/decisions/latest`, registering `sentinel-01` on devnet, removing the `sentinel-01` mock.

Out (later specs): Arbiter (spread between two price sources) and Guardian (volatility and drawdown), which replace
the other two mocks on the same base; real trades or any movement of funds; card or page changes beyond the summary
line the page already shows; the Blink endpoint.

## 1. The policy

A pure function `decide(previous, price, now, policy)` with no I/O.

**Portfolio.** `{ sol, usdc }`. With no previous decision it starts from the initial holdings, **1,000 SOL + 100,000
USDC** (constants in the agent). Otherwise it is the `after` portfolio of the previous decision.

**Values.** `solShare = sol × usd / (sol × usd + usdc)`. Target `targetSolShare = 0.5`.

**Triggers, in order:**

1. **Drift:** `|solShare − targetSolShare| > driftThreshold` → `REBALANCE`, reason `drift`.
2. **Schedule:** the last rebalance was `scheduleMinutes` or more ago, or there was none → `REBALANCE`, reason
   `schedule`.
3. Otherwise `HOLD`.

**Trade.** Back to exactly the target: `targetSol = total × targetSolShare / usd`, `tradeSol = sol − targetSol`;
positive means `SELL`, negative `BUY`. SOL amounts are rounded to 9 decimals and USDC to 6 (the tokens' precision);
the USDC leg is `|tradeSol| × usd` rounded, so the total value is kept up to rounding. A trade that rounds to 0 SOL is
a `HOLD`, even when the schedule is due.

**Defaults** (overridable from the environment, see section 3): `driftThreshold` 0.02 percentage points (0.0002),
`scheduleMinutes` 15.

Why so tight: replaying 16.7 h of real 1-minute SOL prices (Binance SOLUSDC, 2026-10-10, range $108.41–110.28)
through the drift rule gave no rebalance at 0.5 pp, one every ~26 min at 0.05 pp and one every ~7 min at 0.02 pp. The
large treasury keeps those trades at ~$90 instead of cents; the schedule guarantees a rebalance in a flat market. At
today's ~$109 the initial holdings are ~52% SOL, so the first cycle is a `REBALANCE` (drift).

**Decision** (`kind: "sentinel"`), the `decision` object the agent submits:

```json
{
  "action": "REBALANCE",
  "reason": "drift",
  "price": { "usd": 109.43, "source": "jupiter-price-v3", "observedAt": "2026-10-10T14:02:31.120Z" },
  "policy": { "targetSolShare": 0.5, "driftThreshold": 0.0002, "scheduleMinutes": 15 },
  "before": { "sol": 1000, "usdc": 100000, "solShare": 0.522513 },
  "trade": { "side": "SELL", "sol": 43.086904871, "usdc": 4715 },
  "after": { "sol": 956.913095129, "usdc": 104715 },
  "lastRebalanceAt": "2026-10-10T14:02:31.120Z"
}
```

`before.solShare` is rounded to 6 decimals. A `HOLD` has no `reason` and no `trade`, its `after` equals `before`, and it carries `lastRebalanceAt` forward
unchanged (`null` until the first rebalance). A `REBALANCE` sets `lastRebalanceAt` to its own `price.observedAt`.

**Summary** (the line the card shows; SOL to 3 decimals, shares to 2 decimals of a percent):

- `REBALANCE (drift): sell 43.087 SOL @ $109.43 (SOL 52.25% → 50.00%)`
- `HOLD @ $109.43 (SOL 50.01%, band ±0.02 pp)`

## 2. Server: `GET /api/agents/<id>/decisions/latest`

General, not Sentinel's: returns the agent's last decision that is recorded on chain, verified against the chain.

1. Reads the agent's on-chain account through the guard; its `lastDecision` is the hash of the last recorded step.
2. All zeros (no step yet) → **200 `{ "latest": null }`**.
3. Otherwise searches `decisions.jsonl` from the end for the entry with that `decisionHash` →
   **200 `{ "latest": { "counter", "record", "decisionHash" } }`**. An entry marked `unconfirmed` that did land
   matches and counts; one that did not land has a different hash and is passed over.
4. No entry matches → **409 `DecisionNotInLog`**: the log and the chain disagree.
5. Agent not in the fleet → 404; fleet not configured → 503; any other failure (e.g. RPC) → 502, as in
   `POST …/decisions`.

Resume does not change `lastDecision`, so after kill and resume the agent continues from the portfolio it had when
it was killed. Steps refused while killed are not recorded, so they never become the latest.

Units:

- `Fleet.findDecision(agentId, decisionHash)`: the newest log entry with that hash, or `undefined`.
- `fleet/latest-decision.ts`: `latestDecision(runtime, agentId)` returns `null` or the entry; throws `GuardError`
  `AgentNotFound` for an agent not in the fleet and `DecisionNotInLogError` when nothing matches.
- `src/routes/api/agents/[id]/decisions/latest/+server.ts`: maps the outcomes to the answers above.

## 3. The agent

Imports nothing from `src/`; HTTP is the only contract with the server.

- `agents/shared/runtime-client.ts`: Tick's client moves here (Tick imports it from there) and gains `latest()`,
  with outcomes `none`, `found` (the record) and `failed` (reason).
- `agents/sentinel/jupiter.ts`: `fetchSolPrice(fetchFn)` calls
  `https://lite-api.jup.ag/price/v3?ids=So11111111111111111111111111111111111111112` and returns
  `{ usd, source: "jupiter-price-v3", observedAt }`, `observedAt` being the agent's clock at the fetch (Jupiter gives no
  publish time). Throws on an HTTP error, a missing `usdPrice`, or a price that is not a positive finite number.
- `agents/sentinel/policy.ts`: `decide` and the summary (section 1).
- `agents/sentinel/index.ts`: the loop, one cycle every interval: `latest()` → `fetchSolPrice()` → `decide()` →
  `submit()`, logging one line per cycle. Any failure skips the cycle without submitting. In particular, only `none`
  starts from the initial holdings; `failed`, or a latest record that is not a valid `sentinel` decision, skips the
  cycle, so the treasury is never silently reset.
- `agents/sentinel/README.md`, `agents/sentinel/package.json`, as for Tick.

| Variable | Default |
|---|---|
| `SENTINEL_API_URL` | `http://localhost:5173` |
| `SENTINEL_AGENT_ID` | `sentinel-01` |
| `SENTINEL_INTERVAL_MS` | `30000` (each decision is a paid devnet step, ~0.043 SOL a day) |
| `SENTINEL_DRIFT_PP` | `0.02` |
| `SENTINEL_SCHEDULE_MIN` | `15` |

An invalid value stops the agent at start, as Tick does for its interval.

## 4. Devnet and the page

- Register a new agent from the main repo, paid and owned by the server's wallet `ftbM…` (~0.15 SOL of rent):
  `AGENT_FILE=.devnet/agents/sentinel-01.json bun scripts/agent.ts register`, then
  `bun scripts/fleet.ts import .devnet/agents/sentinel-01.json --as sentinel-01 --name "Aegis Sentinel Alpha — Treasury Rebalancer" --risk MEDIUM`.
- Remove the `sentinel-01` mock and its seeded history entries from `blink.service.ts`, so the page lists the agent
  once, from the fleet. `arbiter-02` and `guardian-03` stay mocks until their own specs.

## 5. Testing

TDD with `bun test`, no network:

- Policy: drift above the threshold rebalances; a due schedule rebalances below the threshold; a trade that rounds to
  zero is a `HOLD`; sell and buy directions; total value kept up to rounding; `lastRebalanceAt` set on a rebalance and
  carried by a hold; first decision from the initial holdings; summary lines.
- Jupiter: a valid answer; HTTP error; missing price; zero, negative or non-numeric price.
- Client `latest()`: `{ latest: null }` → `none`; a record → `found`; 409, other errors and an unreachable server →
  `failed`.
- `latestDecision`: no step → `null`; hash match → the entry; an unconfirmed entry that landed counts; a newer
  unconfirmed entry that did not land is passed over; no match → `DecisionNotInLogError`; an agent not in the fleet →
  `AgentNotFound`.
- Live on devnet: the first cycle is `REBALANCE (drift)`, then `HOLD`s, then a rebalance by drift or by the 15-minute
  schedule; Kill freezes the portfolio (refused cycles, `latest` unchanged); Resume continues from it.
