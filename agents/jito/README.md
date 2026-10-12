# JitoSOL steward

Speaks for holders of JitoSOL who also hold JTO and do not read every proposal. With nothing armed, a cycle only
tells the page `No new proposals detected` and counts repeats (`×1`, `×2`, …). That sends no transaction. An upcoming
proposal the steward reads as positive for JitoSOL holders is `FOR`; one it reads as negative is `AGAINST`. The answer
is simulated in the agent. It does not call a model, it trades nothing, and it does not vote on Jito's Realms. A vote,
with the proposal text and the simulated answer, is hashed and signed like Sentinel's steps.

## Run

Register it and put it in the fleet once (from the repo root, with `.env` set up as in the root README), then start
it next to the server (`bun run dev`):

```sh
AGENT_FILE=.devnet/agents/jito-01.json bun scripts/agent.ts register
bun scripts/fleet.ts import .devnet/agents/jito-01.json --as jito-01 --name "JitoSOL Steward" --risk MEDIUM
bun agents/jito
```

| Variable | Default |
|---|---|
| `JITO_API_URL` | `http://localhost:5173` |
| `JITO_AGENT_ID` | `jito-01` |
| `JITO_INTERVAL_MS` | `30000` (a quiet cycle is free; a vote is a paid devnet step) |

Open the **Simulate** panel at the corner of the operator page and arm an upcoming proposal as positive or negative
for JitoSOL holders. The next cycle, within 30 s, records that vote. A server restart forgets an armed proposal and
the quiet count.

## Test

```sh
bun test agents/jito
```
