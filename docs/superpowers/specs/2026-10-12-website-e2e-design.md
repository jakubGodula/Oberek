# Design: real end-to-end tests of the website on devnet

Date: 2026-10-12. Branch: `e2e` (off `development`, which has the kit). Status: approved in brainstorming, awaiting
spec review.

## Goal

A browser drives the dashboard the way the owner does, through the real API and the real `onchain_agent_guard` program
on devnet, and every test checks the chain as well as the page. Done means `bun run e2e` passes four scenarios (read,
kill switch, live steps, proposal verdicts) against a test fleet that the demo never sees.

## Scope

In: Playwright Test, a test fleet on devnet, its one-off setup, the four scenarios, a README line.

Out: Telegram (a later round), `jito-01` (not in the test fleet), CI (devnet and keys stay on the laptop), any GUI
change. The tests find elements by role and visible text; no `data-testid` is added.

## Decisions

- **Devnet, not a local validator.** The keys, program and `.env` already exist; the cost is a few transactions a run.
- **A separate test fleet, set up once and reused.** The demo fleet in `.devnet/fleet/` is never touched by the tests.
- **Same agent ids, own directory.** `ProposalSim.svelte` hardcodes `sentinel-01` and `jito-01`, so the test fleet uses
  the ids `sentinel-01` and `tick-01` in `.devnet/e2e-fleet/`. They are different agents on chain, named
  `E2E Sentinel` and `E2E Tick`, owned by the same owner (`.devnet/owner-*` keys are shared with the demo).
- **Playwright Test as the runner**, not `bun test`: traces, screenshots on failure, an HTML report and per-test
  timeouts suit slow devnet steps. Test files are `e2e/*.e2e.ts`, so `bun test` (which picks up `*.test.ts` and
  `*.spec.ts`) never runs them.
- **Headless by default.** `bun run e2e --headed` shows the browser; `bun run e2e --ui` is Playwright's interactive mode.
- **Serial.** `workers: 1`: the tests share two agents.

## Architecture

### App change: the fleet directory comes from the environment

`FLEET_DIR` (`src/lib/server/modules/fleet/runtime.ts`) becomes a variable declared in `src/env.ts`, defaulting to
`.devnet/fleet`. The server's runtime and the scripts that import the constant (`setup.ts`, `demo.ts`) read it through
one function, so the default behaviour is unchanged. This is the only change outside `e2e/` and the setup script.

The test server gets the value from Vite's mode files: `vite dev --mode e2e` loads a committed `.env.e2e` holding only
`FLEET_DIR=.devnet/e2e-fleet` on top of `.env`. The plan's first task confirms that the server sees it; if SvelteKit's
`defineEnvVars` ignores mode files, the fallback is the shell environment of the `webServer` command.

### Test fleet setup

`scripts/setup.ts` gets a profile: the default one is today's (three agents, `.devnet/fleet/`, `.devnet/agents/`), and
`--e2e` sets up `E2E Sentinel` and `E2E Tick` in `.devnet/e2e-fleet/` and `.devnet/e2e-agents/`. Same steps, same
idempotence, same funding check. One-off cost about 0.3 SOL (key account rent).

### Harness

- `playwright.config.ts` at the repo root: `testDir: 'e2e'`, `testMatch: '*.e2e.ts'`, `workers: 1`, `headless: true`,
  trace and screenshot on failure, base URL `http://localhost:5174`.
- `webServer`: `vite dev --mode e2e --port 5174 --strictPort`, so a demo on 5173 can run alongside (memory permitting:
  each Vite server can reach ~2 GB).
- Before the tests, a check that `.devnet/e2e-fleet/` has both agents; otherwise fail with
  `run bun scripts/setup.ts --e2e first`.
- Fixtures in `e2e/fixtures.ts`:
  - `agentProcess(name, env)`: starts `agents/tick` or `agents/sentinel` pointed at port 5174, stops it with SIGTERM and
    waits for exit, so a step in flight lands.
  - `chain`: reads an agent's account with `fetchAgent` from `pq-agent-guard` (status, counter, last decision, key
    account), using `.env` and the identity file in the test fleet.
  - `dashboard`: page helpers (select an agent, read its card status and counter, wait for a status).
- `package.json`: `"e2e": "playwright test"`, `@playwright/test` as a devDependency.

## Scenarios

The page refreshes every 5 s; UI assertions wait up to 60 s unless stated otherwise. A killed agent shows as `PAUSED`
in the UI and `Killed` on chain.

1. **Read** (no agent process). The fleet shows 2 agents, both `ACTIVE`, named `E2E Sentinel` and `E2E Tick`.
   Selecting `E2E Tick` shows its counter, PQ key account and last commitment root, each equal to the chain's. The
   decision feed loads without an error message.
2. **Kill switch** (no agent process). Select `E2E Tick`, click `Kill-Switch`: the card shows `PAUSED`, the chain
   `Killed`. Click `Resume agent`: `ACTIVE` on both. `afterEach` resumes through `/api/agents/tick-01/control` if the
   chain still says `Killed`, so a failure never leaves the agent stopped.
3. **Live steps** (Tick process, fast pace). Note the counter N; the UI shows at least N+2 and new `TICK` entries in
   the feed, and the chain counter matches the UI. Passes whether or not `BATCHED_AGENT_IDS` in `.env` batches
   `tick-01`. Timeout 2 min.
4. **Proposal verdicts**, two tests, Approve and Reject (Sentinel process at demo pace,
   `SENTINEL_INTERVAL_MS=10000`). Click `Simulate a price shock (−3%)`: the agent shows `AWAITING_APPROVAL` and the
   approval panel. Click `Approve Step` (or `Reject`): back to `ACTIVE`, the chain counter grows, the verdict is in the
   feed. Timeout 3 min.

   Why the shock always asks for a verdict: Sentinel rebalances to a 50% SOL share, and a −3% price move from there is
   a trade of about 0.75% of the treasury, above the 0.25% approval share (`agents/sentinel/config.ts`). Sentinel also
   reads the real SOL price from Jupiter, so this test needs that API up.

## Error handling

- A missing test fleet, a busy port 5174 or an unfunded payer stops the run before any test, with the command to fix it.
- Every test that changes an agent's status restores it in `afterEach`, through the API, checked on chain.
- Agent processes are stopped in fixture teardown even when the test fails.

## Testing the harness itself

The fixtures are thin wrappers over Playwright and the kit, so they are covered by the e2e run itself. The `FLEET_DIR`
change and the setup profile get unit tests next to the existing ones (`bun test`), with no network.

## Cost

A run is about a dozen devnet transactions (kill, resume, a few ticks, Sentinel steps, two verdicts): a fraction of a
cent. The setup is about 0.3 SOL once.
