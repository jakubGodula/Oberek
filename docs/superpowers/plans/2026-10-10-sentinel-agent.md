# Sentinel Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the mock `sentinel-01` card with a real on-chain agent that rebalances a virtual SOL/USDC treasury from the live Jupiter SOL price, each decision recorded by `onchain_agent_guard`.

**Architecture:** Sentinel is its own Bun process in `agents/sentinel/`, like Tick: each cycle it reads its last recorded decision from the server (`GET /api/agents/<id>/decisions/latest`, verified against the chain), reads the Jupiter price, applies a pure policy and submits the decision over HTTP. The server signs and records it exactly as it does Tick's steps. Its state is the `after` portfolio of the last decision that landed on chain.

**Tech Stack:** Bun (runtime and `bun test`), TypeScript (strict), SvelteKit 3 routes, `@solana/kit` (already used by the server), Jupiter Price API v3.

**Spec:** `docs/superpowers/specs/2026-10-10-sentinel-agent-design.md`

## Global Constraints

- Agents (`agents/**`) import nothing from `src/`; HTTP is their only contract with the server.
- Tests: `bun test src agents` from the repo root (`~/.bun/bin/bun` if `bun` is not on PATH); no network in tests.
- Initial holdings: **1,000 SOL + 100,000 USDC**. Target SOL share **0.5**. Drift threshold default **0.02 percentage points** (share `0.0002`). Schedule default **15 minutes**. Interval default **30000 ms**.
- Rounding: SOL to **9** decimals, USDC to **6**, `before.solShare` to **6**. Summary: SOL to 3 decimals, shares as percent with 2 decimals, price with 2 decimals.
- Decision `kind` is `"sentinel"`; price `source` is `"jupiter-price-v3"`; Jupiter URL `https://lite-api.jup.ag/price/v3?ids=So11111111111111111111111111111111111111112`.
- Env variables: `SENTINEL_API_URL` (`http://localhost:5173`), `SENTINEL_AGENT_ID` (`sentinel-01`), `SENTINEL_INTERVAL_MS` (`30000`), `SENTINEL_DRIFT_PP` (`0.02`), `SENTINEL_SCHEDULE_MIN` (`15`); an invalid value stops the agent at start.
- Fleet name `Aegis Sentinel Alpha — Treasury Rebalancer`, risk `MEDIUM`, agent file `.devnet/agents/sentinel-01.json`.
- Style: tabs in `agents/` and `src/lib/server/modules/fleet/`; 2 spaces in `blink.service.ts`; English comments; one-line comments only where the code does not say it. Commit messages in Polish without diacritics, like the history (`git log --oneline`); no `Co-Authored-By` trailer.
- Plan-level deviation from the spec, deliberate: `decide(previous, price, policy)` takes no separate `now`; the decision time is `price.observedAt` (the spec already sets `lastRebalanceAt` to it), so one clock is used.

## Review Focus

1. A server that answers 200 without a `latest` field (an older server, a proxy page) must make `latest()` report `failed`, never `none`, or Sentinel would reset the treasury to the initial holdings. Test in Task 3.
2. A latest record that is not a Sentinel decision (e.g. `sentinel-01` reused by a Tick process, `kind: "tick"`) or has a malformed `after` / `lastRebalanceAt` must skip the cycle, not crash or reset. Tests in Task 6.
3. Jupiter answering 200 with a non-JSON body or with the price as a string (`"109.43"`, the v2 API's format) must be rejected, not turned into `NaN` trades. Tests in Task 5.
4. A fleet agent whose on-chain account has steps but whose `decisions.jsonl` does not exist (e.g. an agent first run by `scripts/agent.ts run`, which logs elsewhere) must answer 409 `DecisionNotInLog`, not 500. Test in Task 1.
5. An env value like `SENTINEL_DRIFT_PP=0.02pp`, `""` or `0` must stop the agent at start with a message naming the variable. Tests in Task 7.

---

### Task 1: Server — the latest recorded decision

**Files:**
- Modify: `src/lib/server/modules/fleet/fleet.ts` (methods `lastDecision`, new `findDecision`, private `readLog`)
- Create: `src/lib/server/modules/fleet/latest-decision.ts`
- Test: `src/lib/server/modules/fleet/latest-decision.test.ts`

**Interfaces:**
- Consumes: `FleetRuntime` (`submit-decision.ts`), `AgentGuard`, `GuardAccount`, `GuardError`, `NO_DECISION` (`agent-guard/guard.ts`), `Fleet`, `DecisionLogEntry` (`fleet.ts`).
- Produces: `Fleet.findDecision(agentId: string, decisionHash: string): DecisionLogEntry | undefined`; `class DecisionNotInLogError extends Error`; `latestDecision(runtime: FleetRuntime, agentId: string): Promise<DecisionLogEntry | null>`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/server/modules/fleet/latest-decision.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { GuardError, NO_DECISION, type AgentGuard, type GuardAccount } from '../agent-guard/guard';
import { Fleet, type DecisionLogEntry } from './fleet';
import { DecisionNotInLogError, latestDecision } from './latest-decision';
import { StepThrottle } from './step-throttle';
import type { FleetRuntime } from './submit-decision';

const AGENT = 'sentinel-01';
const NOW = new Date('2026-10-10T12:00:00.000Z');
const HASH_A = 'aa'.repeat(32);
const HASH_B = 'bb'.repeat(32);

let rootDir: string;
let fleet: Fleet;

/** Only readAgent matters here: it returns an account whose lastDecision the test sets. */
function guardHolding(lastDecision: string): AgentGuard {
	const account: GuardAccount = { owner: 'owner', status: 'Active', counter: 2, lastDecision };
	const unused = async (): Promise<GuardAccount> => {
		throw new Error('not used');
	};
	return { readAgent: async () => account, recordStep: unused, kill: unused, resume: unused };
}

function runtimeWith(guard: AgentGuard): FleetRuntime {
	return { guard, fleet, throttle: new StepThrottle(0), now: () => NOW };
}

function entry(counter: number, decisionHash: string, unconfirmed?: true): DecisionLogEntry {
	const record = {
		agent: AGENT,
		counter,
		kind: 'sentinel',
		decision: { action: 'HOLD' },
		summary: `HOLD #${counter}`,
		observedAt: NOW.toISOString()
	};
	return unconfirmed ? { record, decisionHash, unconfirmed } : { record, decisionHash };
}

beforeEach(() => {
	rootDir = mkdtempSync(join(tmpdir(), 'latest-'));
	fleet = new Fleet(join(rootDir, 'fleet'));
	fleet.register({ id: AGENT, name: 'Sentinel', riskLevel: 'MEDIUM', registeredAt: NOW.getTime() });
});

afterEach(() => rmSync(rootDir, { recursive: true, force: true }));

describe('latestDecision', () => {
	test('is null before the agent recorded any step', async () => {
		expect(await latestDecision(runtimeWith(guardHolding(NO_DECISION)), AGENT)).toBeNull();
	});

	test('returns the log entry whose hash the chain holds', async () => {
		fleet.appendDecision(AGENT, entry(1, HASH_A));
		fleet.appendDecision(AGENT, entry(2, HASH_B));
		expect(await latestDecision(runtimeWith(guardHolding(HASH_A)), AGENT)).toEqual(entry(1, HASH_A));
	});

	test('counts an unconfirmed entry that did land', async () => {
		fleet.appendDecision(AGENT, entry(1, HASH_A));
		fleet.appendDecision(AGENT, entry(2, HASH_B, true));
		expect(await latestDecision(runtimeWith(guardHolding(HASH_B)), AGENT)).toEqual(entry(2, HASH_B, true));
	});

	test('passes over a newer unconfirmed entry that did not land', async () => {
		fleet.appendDecision(AGENT, entry(1, HASH_A));
		fleet.appendDecision(AGENT, entry(2, HASH_B, true));
		expect(await latestDecision(runtimeWith(guardHolding(HASH_A)), AGENT)).toEqual(entry(1, HASH_A));
	});

	test('reports a chain hash that no log entry has', async () => {
		fleet.appendDecision(AGENT, entry(1, HASH_A));
		const error = await latestDecision(runtimeWith(guardHolding(HASH_B)), AGENT).catch((caught: unknown) => caught);
		expect(error).toBeInstanceOf(DecisionNotInLogError);
	});

	test('reports a chain hash as not in the log when the agent has no log at all', async () => {
		const error = await latestDecision(runtimeWith(guardHolding(HASH_A)), AGENT).catch((caught: unknown) => caught);
		expect(error).toBeInstanceOf(DecisionNotInLogError);
	});

	test('refuses an agent that is not in the fleet', async () => {
		const error = await latestDecision(runtimeWith(guardHolding(NO_DECISION)), 'stranger').catch(
			(caught: unknown) => caught
		);
		expect((error as GuardError).code).toBe('AgentNotFound');
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/lib/server/modules/fleet/latest-decision.test.ts`
Expected: FAIL — `Cannot find module './latest-decision'`.

- [ ] **Step 3: Write minimal implementation**

In `src/lib/server/modules/fleet/fleet.ts`, replace the method `lastDecision` with these three methods (keep `agentDir` as it is):

```ts
	lastDecision(agentId: string): DecisionLogEntry | undefined {
		return this.readLog(agentId).at(-1);
	}

	/** The newest log entry with that hash; for the hash the guard holds, the record of the last recorded step. */
	findDecision(agentId: string, decisionHash: string): DecisionLogEntry | undefined {
		return this.readLog(agentId)
			.reverse()
			.find((entry) => entry.decisionHash === decisionHash);
	}

	private readLog(agentId: string): DecisionLogEntry[] {
		const path = join(this.agentDir(agentId), DECISION_LOG_FILE);
		if (!existsSync(path)) return [];
		return readFileSync(path, 'utf8')
			.split('\n')
			.filter((line) => line !== '')
			.map((line) => JSON.parse(line));
	}
```

Create `src/lib/server/modules/fleet/latest-decision.ts`:

```ts
import { GuardError, NO_DECISION } from '../agent-guard/guard';
import type { DecisionLogEntry } from './fleet';
import type { FleetRuntime } from './submit-decision';

/** The chain holds a decision hash that no entry of the agent's log has: the log and the chain disagree. */
export class DecisionNotInLogError extends Error {}

/**
 * The agent's last decision recorded on chain: the log entry whose hash the guard holds, so an entry edited in the log
 * cannot pass for it. Null before the agent's first step.
 */
export async function latestDecision(runtime: FleetRuntime, agentId: string): Promise<DecisionLogEntry | null> {
	if (!runtime.fleet.get(agentId)) throw new GuardError('AgentNotFound', `agent ${agentId} is not in the fleet`);
	const { lastDecision } = await runtime.guard.readAgent(agentId);
	if (lastDecision === NO_DECISION) return null;
	const entry = runtime.fleet.findDecision(agentId, lastDecision);
	if (!entry) {
		throw new DecisionNotInLogError(`agent ${agentId}: the decision ${lastDecision} recorded on chain is not in its log`);
	}
	return entry;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src agents`
Expected: all pass (the existing `submit-decision` tests still use `lastDecision`).

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/modules/fleet/fleet.ts src/lib/server/modules/fleet/latest-decision.ts src/lib/server/modules/fleet/latest-decision.test.ts
git commit -m "fleet: ostatnia decyzja zapisana na lancuchu (latestDecision, Fleet.findDecision)"
```

---

### Task 2: Server — `GET /api/agents/<id>/decisions/latest` and shared error answers

**Files:**
- Create: `src/lib/server/modules/fleet/http-errors.ts`
- Test: `src/lib/server/modules/fleet/http-errors.test.ts`
- Create: `src/routes/api/agents/[id]/decisions/latest/+server.ts`
- Modify: `src/routes/api/agents/[id]/decisions/+server.ts` (use the shared error answer)

**Interfaces:**
- Consumes: `DecisionNotInLogError`, `latestDecision` (Task 1); `FleetNotConfiguredError` (`fleet/runtime.ts`); `GuardError`, `HTTP_STATUS_BY_GUARD_ERROR` (`agent-guard/guard.ts`); `getFleetRuntime` (`fleet/app-runtime.ts`).
- Produces: `fleetErrorResponse(error: unknown, context: string): Response`. HTTP answer of the new route: `200 { latest: null }` or `200 { latest: { counter: number, record: DecisionRecord, decisionHash: string } }`; errors `{ error, message }` with 404 / 409 `DecisionNotInLog` / 503 `FleetNotConfigured` / 502 `GuardUnavailable`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/server/modules/fleet/http-errors.test.ts`:

```ts
import { expect, test } from 'bun:test';
import { GuardError } from '../agent-guard/guard';
import { fleetErrorResponse } from './http-errors';
import { DecisionNotInLogError } from './latest-decision';
import { FleetNotConfiguredError } from './runtime';

async function answer(error: unknown): Promise<{ status: number; body: unknown }> {
	const response = fleetErrorResponse(error, 'test request');
	return { status: response.status, body: await response.json() };
}

test('answers a guard refusal with its status and code', async () => {
	expect(await answer(new GuardError('AgentKilled', 'agent x is killed'))).toEqual({
		status: 409,
		body: { error: 'AgentKilled', message: 'agent x is killed' }
	});
});

test('answers a log that disagrees with the chain with 409 DecisionNotInLog', async () => {
	expect(await answer(new DecisionNotInLogError('not in log'))).toEqual({
		status: 409,
		body: { error: 'DecisionNotInLog', message: 'not in log' }
	});
});

test('answers a fleet without configuration with 503', async () => {
	expect(await answer(new FleetNotConfiguredError('GUARD_PROGRAM_ID is not set'))).toEqual({
		status: 503,
		body: { error: 'FleetNotConfigured', message: 'GUARD_PROGRAM_ID is not set' }
	});
});

test('answers anything else as a guard without a verdict', async () => {
	expect(await answer(new Error('RPC timeout'))).toEqual({
		status: 502,
		body: { error: 'GuardUnavailable', message: 'RPC timeout' }
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/lib/server/modules/fleet/http-errors.test.ts`
Expected: FAIL — `Cannot find module './http-errors'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/server/modules/fleet/http-errors.ts`:

```ts
import { json } from '@sveltejs/kit';
import { GuardError, HTTP_STATUS_BY_GUARD_ERROR } from '../agent-guard/guard';
import { DecisionNotInLogError } from './latest-decision';
import { FleetNotConfiguredError } from './runtime';

const CONFLICT = 409;
/** The guard could not give a verdict (e.g. the Solana RPC failed); the agent may retry on its next cycle. */
const BAD_GATEWAY = 502;
const SERVICE_UNAVAILABLE = 503;
const GUARD_UNAVAILABLE = 'GuardUnavailable';

/** The answer to a fleet request that failed; an unexpected failure is logged with the request's context. */
export function fleetErrorResponse(error: unknown, context: string): Response {
	if (error instanceof FleetNotConfiguredError) return answer(SERVICE_UNAVAILABLE, 'FleetNotConfigured', error.message);
	if (error instanceof DecisionNotInLogError) return answer(CONFLICT, 'DecisionNotInLog', error.message);
	if (error instanceof GuardError) return answer(HTTP_STATUS_BY_GUARD_ERROR[error.code], error.code, error.message);
	console.error(`${context} failed:`, error);
	return answer(BAD_GATEWAY, GUARD_UNAVAILABLE, error instanceof Error ? error.message : String(error));
}

function answer(status: number, error: string, message: string): Response {
	return json({ error, message }, { status });
}
```

Create `src/routes/api/agents/[id]/decisions/latest/+server.ts`:

```ts
import { json, type RequestHandler } from '@sveltejs/kit';
import { getFleetRuntime } from '#lib/server/modules/fleet/app-runtime';
import { fleetErrorResponse } from '#lib/server/modules/fleet/http-errors';
import { latestDecision } from '#lib/server/modules/fleet/latest-decision';

/** The agent's last decision recorded on chain, checked against the hash the guard holds; null before its first step. */
export const GET: RequestHandler = async ({ params }) => {
	try {
		const entry = await latestDecision(await getFleetRuntime(), params.id!);
		const latest = entry && { counter: entry.record.counter, record: entry.record, decisionHash: entry.decisionHash };
		return json({ latest });
	} catch (error) {
		return fleetErrorResponse(error, `latest decision of agent ${params.id}`);
	}
};
```

Replace the whole of `src/routes/api/agents/[id]/decisions/+server.ts` with:

```ts
import { json, type RequestHandler } from '@sveltejs/kit';
import { getFleetRuntime } from '#lib/server/modules/fleet/app-runtime';
import { fleetErrorResponse } from '#lib/server/modules/fleet/http-errors';
import { RateLimitedError } from '#lib/server/modules/fleet/step-throttle';
import { parseSubmission, submitDecision } from '#lib/server/modules/fleet/submit-decision';

const BAD_REQUEST = 400;
const TOO_MANY_REQUESTS = 429;
const MS_PER_SECOND = 1000;

/**
 * An agent process submits its next decision; 409 while the agent is killed, 429 when it submits too often, 503 while
 * the fleet is not configured or the fee payer has no funds.
 */
export const POST: RequestHandler = async ({ params, request }) => {
	const submission = parseSubmission(await request.json().catch(() => null));
	if (!submission) {
		return json({ error: 'BadRequest', message: 'expected { kind, decision, summary }' }, { status: BAD_REQUEST });
	}
	try {
		return json(await submitDecision(await getFleetRuntime(), params.id!, submission));
	} catch (error) {
		if (error instanceof RateLimitedError) {
			const retryAfterSeconds = String(Math.ceil(error.retryAfterMs / MS_PER_SECOND));
			const body = { error: 'RateLimited', message: error.message };
			return json(body, { status: TOO_MANY_REQUESTS, headers: { 'retry-after': retryAfterSeconds } });
		}
		return fleetErrorResponse(error, `decision of agent ${params.id}`);
	}
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src agents`
Expected: all pass.

- [ ] **Step 5: Check the route against the running server**

Make sure port 5173 is served by this checkout, not another clone (`readlink /proc/$(lsof -ti:5173 -sTCP:LISTEN)/cwd` prints the repo root); otherwise stop that server and run `bun run dev` in the repo root. Then:

Run: `curl -s -w ' %{http_code}\n' http://localhost:5173/api/agents/tick-01/decisions/latest`
Expected: `200` with `{"latest":{"counter":…,"record":{…"kind":"tick"…},"decisionHash":"…"}}`, or `409` `DecisionNotInLog` if `tick-01`'s last on-chain step is not in `.devnet/fleet/tick-01/decisions.jsonl`. Either is correct; a 500 is not.

Run: `curl -s -w ' %{http_code}\n' http://localhost:5173/api/agents/nobody/decisions/latest`
Expected: `404` with `"error":"AgentNotFound"`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/server/modules/fleet/http-errors.ts src/lib/server/modules/fleet/http-errors.test.ts "src/routes/api/agents/[id]/decisions/latest/+server.ts" "src/routes/api/agents/[id]/decisions/+server.ts"
git commit -m "api: GET /api/agents/<id>/decisions/latest (ostatnia decyzja zweryfikowana z lancuchem), wspolne odpowiedzi bledow floty"
```

---

### Task 3: Agents — shared runtime client with `latest()`, shared env parsing, Tick moved onto them

**Files:**
- Create: `agents/shared/runtime-client.ts` (moved from `agents/tick/runtime-client.ts`, extended)
- Create: `agents/shared/runtime-client.test.ts` (moved from `agents/tick/runtime-client.test.ts`, extended)
- Create: `agents/shared/env.ts`
- Test: `agents/shared/env.test.ts`
- Delete: `agents/tick/runtime-client.ts`, `agents/tick/runtime-client.test.ts`
- Modify: `agents/tick/index.ts`, `agents/tick/README.md` (test command)

**Interfaces:**
- Consumes: the server's HTTP answers (Task 2 for `latest`).
- Produces:
  - `createRuntimeClient(apiUrl: string, agentId: string, fetchFn?: typeof fetch): RuntimeClient`
  - `interface RuntimeClient { submit(submission: Submission): Promise<SubmitOutcome>; latest(): Promise<LatestOutcome> }`
  - `interface Submission { kind: string; decision: Record<string, unknown>; summary: string }`
  - `type SubmitOutcome = { kind: 'recorded'; counter: number } | { kind: 'paused' } | { kind: 'failed'; reason: string }`
  - `interface RecordedDecision { agent: string; counter: number; kind: string; decision: Record<string, unknown>; summary: string; observedAt: string }`
  - `type LatestOutcome = { kind: 'none' } | { kind: 'found'; record: RecordedDecision } | { kind: 'failed'; reason: string }`
  - `describeSubmitOutcome(outcome: SubmitOutcome): string`
  - `positiveNumber(env: Env, name: string, fallback: number, options?: { integer?: boolean }): number` (throws `Error` naming the variable), `type Env = Record<string, string | undefined>`

- [ ] **Step 1: Move the client and its test**

```bash
mkdir -p agents/shared
git mv agents/tick/runtime-client.ts agents/shared/runtime-client.ts
git mv agents/tick/runtime-client.test.ts agents/shared/runtime-client.test.ts
```

- [ ] **Step 2: Write the failing tests**

Replace the whole of `agents/shared/runtime-client.test.ts` with:

```ts
import { describe, expect, test } from 'bun:test';
import { createRuntimeClient, describeSubmitOutcome } from './runtime-client';

const SUBMISSION = { kind: 'tick', decision: {}, summary: 'TICK' };
const RECORD = {
	agent: 'sentinel-01',
	counter: 7,
	kind: 'sentinel',
	decision: { action: 'HOLD' },
	summary: 'HOLD',
	observedAt: '2026-10-10T12:00:00.000Z'
};

function answering(status: number, body: unknown) {
	const requests: { url: string; init?: RequestInit }[] = [];
	const fetchFn = (async (url: string, init?: RequestInit) => {
		requests.push({ url, init });
		return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
	}) as unknown as typeof fetch;
	return { fetchFn, requests };
}

const unreachable = (async () => {
	throw new Error('connection refused');
}) as unknown as typeof fetch;

describe('submit', () => {
	test('posts the decision as JSON to the agent decisions endpoint', async () => {
		const { fetchFn, requests } = answering(200, { counter: 1 });
		await createRuntimeClient('http://server', 'tick-01', fetchFn).submit(SUBMISSION);
		expect(requests[0].url).toBe('http://server/api/agents/tick-01/decisions');
		expect(requests[0].init?.method).toBe('POST');
		expect(JSON.parse(requests[0].init?.body as string)).toEqual(SUBMISSION);
	});

	test('reports the counter of a recorded decision', async () => {
		const { fetchFn } = answering(200, { counter: 24 });
		expect(await createRuntimeClient('http://server', 'tick-01', fetchFn).submit(SUBMISSION)).toEqual({
			kind: 'recorded',
			counter: 24
		});
	});

	test('reports a refusal of a killed agent as paused', async () => {
		const { fetchFn } = answering(409, { error: 'AgentKilled', message: 'agent tick-01 is killed' });
		expect(await createRuntimeClient('http://server', 'tick-01', fetchFn).submit(SUBMISSION)).toEqual({
			kind: 'paused'
		});
	});

	test('reports any other answer as failed, with the server message', async () => {
		const { fetchFn } = answering(404, { error: 'AgentNotFound', message: 'agent tick-01 is not in the fleet' });
		expect(await createRuntimeClient('http://server', 'tick-01', fetchFn).submit(SUBMISSION)).toEqual({
			kind: 'failed',
			reason: 'HTTP 404: agent tick-01 is not in the fleet'
		});
	});

	test('reports an unreachable server as failed instead of throwing', async () => {
		expect(await createRuntimeClient('http://server', 'tick-01', unreachable).submit(SUBMISSION)).toEqual({
			kind: 'failed',
			reason: 'server unreachable: connection refused'
		});
	});
});

describe('latest', () => {
	test('asks the latest endpoint of the agent', async () => {
		const { fetchFn, requests } = answering(200, { latest: null });
		await createRuntimeClient('http://server', 'sentinel-01', fetchFn).latest();
		expect(requests[0].url).toBe('http://server/api/agents/sentinel-01/decisions/latest');
	});

	test('reports an agent without recorded decisions as none', async () => {
		const { fetchFn } = answering(200, { latest: null });
		expect(await createRuntimeClient('http://server', 'sentinel-01', fetchFn).latest()).toEqual({ kind: 'none' });
	});

	test('returns the recorded decision', async () => {
		const { fetchFn } = answering(200, { latest: { counter: 7, record: RECORD, decisionHash: 'ab'.repeat(32) } });
		expect(await createRuntimeClient('http://server', 'sentinel-01', fetchFn).latest()).toEqual({
			kind: 'found',
			record: RECORD
		});
	});

	test('reports a log that disagrees with the chain as failed', async () => {
		const { fetchFn } = answering(409, { error: 'DecisionNotInLog', message: 'not in its log' });
		expect(await createRuntimeClient('http://server', 'sentinel-01', fetchFn).latest()).toEqual({
			kind: 'failed',
			reason: 'HTTP 409: not in its log'
		});
	});

	test('reports a 200 answer without a latest field as failed, never as none', async () => {
		const { fetchFn } = answering(200, '<html>proxy page</html>');
		expect((await createRuntimeClient('http://server', 'sentinel-01', fetchFn).latest()).kind).toBe('failed');
	});

	test('reports an unreachable server as failed', async () => {
		expect(await createRuntimeClient('http://server', 'sentinel-01', unreachable).latest()).toEqual({
			kind: 'failed',
			reason: 'server unreachable: connection refused'
		});
	});
});

test('describes each submit outcome in one line', () => {
	expect(describeSubmitOutcome({ kind: 'recorded', counter: 3 })).toBe('recorded #3');
	expect(describeSubmitOutcome({ kind: 'paused' })).toBe('refused: the owner killed the agent');
	expect(describeSubmitOutcome({ kind: 'failed', reason: 'HTTP 502: x' })).toBe('failed: HTTP 502: x');
});
```

Create `agents/shared/env.test.ts`:

```ts
import { expect, test } from 'bun:test';
import { positiveNumber } from './env';

test('takes the fallback when the variable is unset', () => {
	expect(positiveNumber({}, 'X', 15)).toBe(15);
});

test('reads a positive number', () => {
	expect(positiveNumber({ X: '0.05' }, 'X', 1)).toBe(0.05);
});

test.each(['', '0', '-1', 'abc', '0.02pp', 'Infinity'])('refuses %p, naming the variable', (raw) => {
	expect(() => positiveNumber({ X: raw }, 'X', 1)).toThrow('X must be a positive number');
});

test('refuses a fraction where a whole number is required', () => {
	expect(() => positiveNumber({ X: '1.5' }, 'X', 1, { integer: true })).toThrow('X must be a positive whole number');
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `bun test agents/shared`
Expected: FAIL — `describeSubmitOutcome` is not exported, `.submit` is not a function, `Cannot find module './env'`.

- [ ] **Step 4: Write minimal implementation**

Replace the whole of `agents/shared/runtime-client.ts` with:

```ts
// The agent's only link to the server: it submits decisions and reads back its last recorded one. The contract is
// HTTP, so nothing here comes from the server's code.

export interface Submission {
	kind: string;
	decision: Record<string, unknown>;
	summary: string;
}

export type SubmitOutcome =
	| { kind: 'recorded'; counter: number }
	| { kind: 'paused' }
	| { kind: 'failed'; reason: string };

/** A decision as the server recorded it: the submission plus the step counter and the server's time. */
export interface RecordedDecision extends Submission {
	agent: string;
	counter: number;
	observedAt: string;
}

export type LatestOutcome =
	| { kind: 'none' }
	| { kind: 'found'; record: RecordedDecision }
	| { kind: 'failed'; reason: string };

export interface RuntimeClient {
	submit(submission: Submission): Promise<SubmitOutcome>;
	/** The agent's last decision recorded on chain; `none` before its first step. */
	latest(): Promise<LatestOutcome>;
}

/** The server answers 409 when the guard refuses the step because the owner killed the agent. */
const HTTP_CONFLICT = 409;

type Answer = { kind: 'answered'; response: Response; body: any } | { kind: 'unreachable'; reason: string };

export function createRuntimeClient(apiUrl: string, agentId: string, fetchFn: typeof fetch = fetch): RuntimeClient {
	const decisionsUrl = `${apiUrl}/api/agents/${encodeURIComponent(agentId)}/decisions`;

	async function request(url: string, init?: RequestInit): Promise<Answer> {
		try {
			const response = await fetchFn(url, init);
			return { kind: 'answered', response, body: await response.json().catch(() => ({})) };
		} catch (error) {
			return { kind: 'unreachable', reason: `server unreachable: ${error instanceof Error ? error.message : error}` };
		}
	}

	return {
		async submit(submission) {
			const answer = await request(decisionsUrl, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(submission)
			});
			if (answer.kind === 'unreachable') return { kind: 'failed', reason: answer.reason };
			if (answer.response.ok) return { kind: 'recorded', counter: answer.body.counter };
			if (answer.response.status === HTTP_CONFLICT) return { kind: 'paused' };
			return { kind: 'failed', reason: httpFailure(answer) };
		},

		async latest() {
			const answer = await request(`${decisionsUrl}/latest`);
			if (answer.kind === 'unreachable') return { kind: 'failed', reason: answer.reason };
			if (!answer.response.ok) return { kind: 'failed', reason: httpFailure(answer) };
			// Only an explicit null means "no decisions yet"; anything else must not reset the agent's state.
			if (answer.body.latest === null) return { kind: 'none' };
			if (typeof answer.body.latest?.record !== 'object') {
				return { kind: 'failed', reason: 'unexpected answer: no latest decision in it' };
			}
			return { kind: 'found', record: answer.body.latest.record };
		}
	};
}

function httpFailure({ response, body }: Extract<Answer, { kind: 'answered' }>): string {
	return `HTTP ${response.status}: ${body.message ?? response.statusText}`;
}

export function describeSubmitOutcome(outcome: SubmitOutcome): string {
	switch (outcome.kind) {
		case 'recorded':
			return `recorded #${outcome.counter}`;
		case 'paused':
			return 'refused: the owner killed the agent';
		case 'failed':
			return `failed: ${outcome.reason}`;
	}
}
```

Note: `typeof null === 'object'`, so a body `{ latest: { record: null } }` would pass the check; that shape is not something the server produces, and the agent's own record validation (Task 6) rejects it.

Create `agents/shared/env.ts`:

```ts
export type Env = Record<string, string | undefined>;

/** A positive number from the environment, or the fallback when unset; anything else throws, naming the variable. */
export function positiveNumber(env: Env, name: string, fallback: number, { integer = false } = {}): number {
	const raw = env[name];
	if (raw === undefined) return fallback;
	const value = Number(raw);
	const valid = raw !== '' && Number.isFinite(value) && value > 0 && (!integer || Number.isInteger(value));
	if (!valid) throw new Error(`${name} must be a positive ${integer ? 'whole number' : 'number'}, got "${raw}"`);
	return value;
}
```

Replace the whole of `agents/tick/index.ts` with:

```ts
// Tick: the simplest agent. Every tick it submits the same decision, TICK, so what the guard does is easy to see.
// It runs as its own process, holds no keys and keeps no status of its own.
import { positiveNumber } from '../shared/env';
import { createRuntimeClient, describeSubmitOutcome } from '../shared/runtime-client';

const KIND = 'tick';
const DECISION = {};
const SUMMARY = 'TICK';
const DEFAULT_API_URL = 'http://localhost:5173';
const DEFAULT_AGENT_ID = 'tick-01';
/** On devnet every step is a paid transaction and the public RPC rate-limits, hence the slow default. */
const DEFAULT_INTERVAL_MS = 30_000;

const apiUrl = process.env.TICK_API_URL ?? DEFAULT_API_URL;
const agentId = process.env.TICK_AGENT_ID ?? DEFAULT_AGENT_ID;
const intervalMs = intervalFromEnv();

const { submit } = createRuntimeClient(apiUrl, agentId);

/** An invalid interval stops the agent instead of spinning. */
function intervalFromEnv(): number {
	try {
		return positiveNumber(process.env, 'TICK_INTERVAL_MS', DEFAULT_INTERVAL_MS, { integer: true });
	} catch (error) {
		console.error(error instanceof Error ? error.message : error);
		process.exit(1);
	}
}

console.log(`Tick (${agentId}) → ${apiUrl}, one TICK every ${intervalMs} ms; Ctrl+C stops`);
while (true) {
	const outcome = await submit({ kind: KIND, decision: DECISION, summary: SUMMARY });
	console.log(`${new Date().toISOString()} TICK → ${describeSubmitOutcome(outcome)}`);
	await new Promise((resolve) => setTimeout(resolve, intervalMs));
}
```

In `agents/tick/README.md`, replace the Test section's command `bun test agents/tick` with `bun test agents/shared` (Tick's client is now shared and tested there).

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test src agents`
Expected: all pass.

- [ ] **Step 6: Check that Tick still starts and refuses a bad interval**

Run: `TICK_INTERVAL_MS=abc bun agents/tick; echo "exit $?"`
Expected: `TICK_INTERVAL_MS must be a positive whole number, got "abc"` and `exit 1`.

- [ ] **Step 7: Commit**

```bash
git add -A agents
git commit -m "agents: wspolny klient serwera (latest) i odczyt zmiennych srodowiska, Tick na nich"
```

---

### Task 4: Sentinel — the policy

**Files:**
- Create: `agents/sentinel/policy.ts`
- Test: `agents/sentinel/policy.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface Portfolio { sol: number; usdc: number }`
  - `interface PriceReading { usd: number; source: string; observedAt: string }`
  - `interface Policy { targetSolShare: number; driftThreshold: number; scheduleMinutes: number }`
  - `interface Previous { after: Portfolio; lastRebalanceAt: string | null }`
  - `type SentinelDecision = { action: 'REBALANCE' | 'HOLD'; reason?: 'drift' | 'schedule'; price: PriceReading; policy: Policy; before: Portfolio & { solShare: number }; trade?: Trade; after: Portfolio; lastRebalanceAt: string | null }` (a `type`, so it is assignable to `Record<string, unknown>`)
  - `type Trade = { side: 'SELL' | 'BUY'; sol: number; usdc: number }`
  - `const INITIAL_PORTFOLIO: Portfolio` (1,000 SOL + 100,000 USDC)
  - `decide(previous: Previous | null, price: PriceReading, policy: Policy): SentinelDecision`
  - `summarize(decision: SentinelDecision): string`

- [ ] **Step 1: Write the failing test**

Create `agents/sentinel/policy.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';
import { decide, INITIAL_PORTFOLIO, summarize, type Policy, type PriceReading } from './policy';

const POLICY: Policy = { targetSolShare: 0.5, driftThreshold: 0.0002, scheduleMinutes: 15 };
const T0 = '2026-10-10T14:00:00.000Z';
const BALANCED = { sol: 956.913095129, usdc: 104715 };

const price = (usd: number, observedAt = T0): PriceReading => ({ usd, source: 'jupiter-price-v3', observedAt });
const minutesAfterT0 = (minutes: number, seconds = 0) =>
	new Date(Date.parse(T0) + (minutes * 60 + seconds) * 1000).toISOString();
const totalValue = ({ sol, usdc }: { sol: number; usdc: number }, usd: number) => sol * usd + usdc;

describe('decide', () => {
	test('starts from the initial holdings and sells back to the target when SOL drifted above it', () => {
		const decision = decide(null, price(109.43), POLICY);
		expect(decision).toEqual({
			action: 'REBALANCE',
			reason: 'drift',
			price: price(109.43),
			policy: POLICY,
			before: { ...INITIAL_PORTFOLIO, solShare: 0.522513 },
			trade: { side: 'SELL', sol: 43.086904871, usdc: 4715 },
			after: { sol: 956.913095129, usdc: 104715 },
			lastRebalanceAt: T0
		});
	});

	test('buys back to the target when SOL drifted below it, keeping the total value', () => {
		const previous = { after: BALANCED, lastRebalanceAt: T0 };
		const decision = decide(previous, price(108, minutesAfterT0(1)), POLICY);
		expect(decision.action).toBe('REBALANCE');
		expect(decision.reason).toBe('drift');
		expect(decision.trade).toEqual({ side: 'BUY', sol: 6.335119102, usdc: 684.192863 });
		expect(decision.after).toEqual({ sol: 963.248214231, usdc: 104030.807137 });
		expect(Math.abs(totalValue(decision.after, 108) - totalValue(BALANCED, 108))).toBeLessThan(0.000001);
	});

	test('holds within the band and carries the last rebalance forward', () => {
		const previous = { after: BALANCED, lastRebalanceAt: T0 };
		const decision = decide(previous, price(109.44, minutesAfterT0(1)), POLICY);
		expect(decision).toEqual({
			action: 'HOLD',
			price: price(109.44, minutesAfterT0(1)),
			policy: POLICY,
			before: { ...BALANCED, solShare: 0.500023 },
			after: BALANCED,
			lastRebalanceAt: T0
		});
	});

	test('rebalances on schedule within the band once the schedule is due', () => {
		const previous = { after: BALANCED, lastRebalanceAt: T0 };
		const due = decide(previous, price(109.44, minutesAfterT0(15)), POLICY);
		expect(due.action).toBe('REBALANCE');
		expect(due.reason).toBe('schedule');
		expect(due.trade).toEqual({ side: 'SELL', sol: 0.043718617, usdc: 4.784565 });
		expect(due.lastRebalanceAt).toBe(minutesAfterT0(15));
	});

	test('holds within the band one second before the schedule is due', () => {
		const previous = { after: BALANCED, lastRebalanceAt: T0 };
		expect(decide(previous, price(109.44, minutesAfterT0(14, 59)), POLICY).action).toBe('HOLD');
	});

	test('holds when the trade to the target rounds to nothing, even with the schedule due', () => {
		const onTarget = { after: { sol: 1000, usdc: 109430 }, lastRebalanceAt: null };
		const decision = decide(onTarget, price(109.43), POLICY);
		expect(decision.action).toBe('HOLD');
		expect(decision.trade).toBeUndefined();
		expect(decision.lastRebalanceAt).toBeNull();
	});
});

describe('summarize', () => {
	test('describes a rebalance with its reason, trade, price and shares', () => {
		expect(summarize(decide(null, price(109.43), POLICY))).toBe(
			'REBALANCE (drift): sell 43.087 SOL @ $109.43 (SOL 52.25% → 50.00%)'
		);
	});

	test('describes a buy', () => {
		const decision = decide({ after: BALANCED, lastRebalanceAt: T0 }, price(108, minutesAfterT0(1)), POLICY);
		expect(summarize(decision)).toBe('REBALANCE (drift): buy 6.335 SOL @ $108.00 (SOL 49.67% → 50.00%)');
	});

	test('describes a hold with the band', () => {
		const decision = decide({ after: BALANCED, lastRebalanceAt: T0 }, price(109.44, minutesAfterT0(1)), POLICY);
		expect(summarize(decision)).toBe('HOLD @ $109.44 (SOL 50.00%, band ±0.02 pp)');
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test agents/sentinel/policy.test.ts`
Expected: FAIL — `Cannot find module './policy'`.

- [ ] **Step 3: Write minimal implementation**

Create `agents/sentinel/policy.ts`:

```ts
// Sentinel's policy: keep a virtual SOL/USDC treasury at its target SOL share. Rebalances when the share drifts out of
// the band, or on schedule when the last rebalance is old enough. Pure: no I/O, the decision time is the price's.

export interface Portfolio {
	sol: number;
	usdc: number;
}

export interface PriceReading {
	usd: number;
	source: string;
	observedAt: string;
}

export interface Policy {
	targetSolShare: number;
	/** How far the SOL share may drift from the target, as a share (0.0002 = 0.02 percentage points). */
	driftThreshold: number;
	scheduleMinutes: number;
}

/** What Sentinel continues from: the portfolio after its last recorded decision. */
export interface Previous {
	after: Portfolio;
	lastRebalanceAt: string | null;
}

export type Trade = { side: 'SELL' | 'BUY'; sol: number; usdc: number };

export type SentinelDecision = {
	action: 'REBALANCE' | 'HOLD';
	reason?: 'drift' | 'schedule';
	price: PriceReading;
	policy: Policy;
	before: Portfolio & { solShare: number };
	trade?: Trade;
	after: Portfolio;
	lastRebalanceAt: string | null;
};

export const INITIAL_PORTFOLIO: Portfolio = { sol: 1000, usdc: 100_000 };

/** The tokens' precision. */
const SOL_DECIMALS = 9;
const USDC_DECIMALS = 6;
const SHARE_DECIMALS = 6;
const MS_PER_MINUTE = 60_000;
const PERCENT = 100;

export function decide(previous: Previous | null, price: PriceReading, policy: Policy): SentinelDecision {
	const before = previous?.after ?? INITIAL_PORTFOLIO;
	const lastRebalanceAt = previous?.lastRebalanceAt ?? null;
	const solShare = solShareOf(before, price.usd);
	const reason = rebalanceReason(solShare, lastRebalanceAt, price.observedAt, policy);
	const trade = reason && tradeToTarget(before, price.usd, policy.targetSolShare);
	const inputs = { price, policy, before: { ...before, solShare: round(solShare, SHARE_DECIMALS) } };
	if (!reason || !trade) return { action: 'HOLD', ...inputs, after: before, lastRebalanceAt };
	return {
		action: 'REBALANCE',
		reason,
		...inputs,
		trade,
		after: applyTrade(before, trade),
		lastRebalanceAt: price.observedAt
	};
}

export function summarize(decision: SentinelDecision): string {
	const at = `@ $${decision.price.usd.toFixed(2)}`;
	const share = percent(decision.before.solShare);
	if (decision.action === 'HOLD' || !decision.trade) {
		return `HOLD ${at} (SOL ${share}, band ±${(decision.policy.driftThreshold * PERCENT).toFixed(2)} pp)`;
	}
	const { side, sol } = decision.trade;
	const afterShare = percent(solShareOf(decision.after, decision.price.usd));
	return `REBALANCE (${decision.reason}): ${side.toLowerCase()} ${sol.toFixed(3)} SOL ${at} (SOL ${share} → ${afterShare})`;
}

function rebalanceReason(
	solShare: number,
	lastRebalanceAt: string | null,
	now: string,
	policy: Policy
): 'drift' | 'schedule' | null {
	if (Math.abs(solShare - policy.targetSolShare) > policy.driftThreshold) return 'drift';
	if (lastRebalanceAt === null) return 'schedule';
	const sinceLastMs = Date.parse(now) - Date.parse(lastRebalanceAt);
	return sinceLastMs >= policy.scheduleMinutes * MS_PER_MINUTE ? 'schedule' : null;
}

/** The trade that brings the SOL share back to the target; null when it rounds to nothing. */
function tradeToTarget(portfolio: Portfolio, usd: number, targetSolShare: number): Trade | null {
	const targetSol = (totalValue(portfolio, usd) * targetSolShare) / usd;
	const excessSol = round(portfolio.sol - targetSol, SOL_DECIMALS);
	if (excessSol === 0) return null;
	const sol = Math.abs(excessSol);
	return { side: excessSol > 0 ? 'SELL' : 'BUY', sol, usdc: round(sol * usd, USDC_DECIMALS) };
}

function applyTrade(portfolio: Portfolio, { side, sol, usdc }: Trade): Portfolio {
	const solOut = side === 'SELL' ? 1 : -1;
	return {
		sol: round(portfolio.sol - solOut * sol, SOL_DECIMALS),
		usdc: round(portfolio.usdc + solOut * usdc, USDC_DECIMALS)
	};
}

function solShareOf(portfolio: Portfolio, usd: number): number {
	return (portfolio.sol * usd) / totalValue(portfolio, usd);
}

function totalValue({ sol, usdc }: Portfolio, usd: number): number {
	return sol * usd + usdc;
}

function round(value: number, decimals: number): number {
	return Number(value.toFixed(decimals));
}

function percent(share: number): string {
	return `${(share * PERCENT).toFixed(2)}%`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test agents/sentinel/policy.test.ts`
Expected: PASS (9 tests). If an exact amount differs in the last decimal, recompute it with the formulas in the spec (section 1) rather than loosening the assertion; the values above were computed with exactly this arithmetic.

- [ ] **Step 5: Commit**

```bash
git add agents/sentinel/policy.ts agents/sentinel/policy.test.ts
git commit -m "sentinel: polityka rebalansu (dryf i harmonogram) i opis decyzji"
```

---

### Task 5: Sentinel — the Jupiter price

**Files:**
- Create: `agents/sentinel/jupiter.ts`
- Test: `agents/sentinel/jupiter.test.ts`

**Interfaces:**
- Consumes: `PriceReading` (Task 4).
- Produces: `JUPITER_PRICE_URL: string`, `fetchSolPrice(fetchFn?: typeof fetch, now?: () => Date): Promise<PriceReading>` (throws `Error` on any invalid answer).

- [ ] **Step 1: Write the failing test**

Create `agents/sentinel/jupiter.test.ts`:

```ts
import { expect, test } from 'bun:test';
import { fetchSolPrice, JUPITER_PRICE_URL } from './jupiter';

const SOL_MINT = 'So11111111111111111111111111111111111111112';
const NOW = new Date('2026-10-10T14:00:00.000Z');

function answering(status: number, body: unknown) {
	const urls: string[] = [];
	const fetchFn = (async (url: string) => {
		urls.push(url);
		return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
	}) as unknown as typeof fetch;
	return { fetchFn, urls };
}

const fetchWith = (status: number, body: unknown) => fetchSolPrice(answering(status, body).fetchFn, () => NOW);

test('reads the SOL price from the Jupiter Price API v3, timed by the agent clock', async () => {
	const { fetchFn, urls } = answering(200, { [SOL_MINT]: { usdPrice: 109.43, priceChange24h: -0.3 } });
	expect(await fetchSolPrice(fetchFn, () => NOW)).toEqual({
		usd: 109.43,
		source: 'jupiter-price-v3',
		observedAt: NOW.toISOString()
	});
	expect(urls).toEqual([JUPITER_PRICE_URL]);
	expect(JUPITER_PRICE_URL).toBe(`https://lite-api.jup.ag/price/v3?ids=${SOL_MINT}`);
});

test('refuses an HTTP error', async () => {
	await expect(fetchWith(429, { error: 'rate limited' })).rejects.toThrow('HTTP 429');
});

test('refuses an answer without the SOL price', async () => {
	await expect(fetchWith(200, {})).rejects.toThrow('no valid SOL price');
});

test.each([0, -1, '109.43', null])('refuses the price %p', async (usdPrice) => {
	await expect(fetchWith(200, { [SOL_MINT]: { usdPrice } })).rejects.toThrow('no valid SOL price');
});

test('refuses a body that is not JSON', async () => {
	await expect(fetchWith(200, '<html>maintenance</html>')).rejects.toThrow('not JSON');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test agents/sentinel/jupiter.test.ts`
Expected: FAIL — `Cannot find module './jupiter'`.

- [ ] **Step 3: Write minimal implementation**

Create `agents/sentinel/jupiter.ts`:

```ts
import type { PriceReading } from './policy';

// The SOL price in USD from Jupiter, aggregated from Solana DEX liquidity. Free, no API key.

const SOL_MINT = 'So11111111111111111111111111111111111111112';
const PRICE_SOURCE = 'jupiter-price-v3';
export const JUPITER_PRICE_URL = `https://lite-api.jup.ag/price/v3?ids=${SOL_MINT}`;

/** Jupiter gives no publish time, so the reading is timed by the agent's clock when the answer arrives. */
export async function fetchSolPrice(fetchFn: typeof fetch = fetch, now: () => Date = () => new Date()): Promise<PriceReading> {
	const response = await fetchFn(JUPITER_PRICE_URL);
	if (!response.ok) throw new Error(`Jupiter price API answered HTTP ${response.status}`);
	const text = await response.text();
	let body: any;
	try {
		body = JSON.parse(text);
	} catch {
		throw new Error(`Jupiter price API answer is not JSON: ${text.slice(0, 80)}`);
	}
	const usd = body?.[SOL_MINT]?.usdPrice;
	if (typeof usd !== 'number' || !Number.isFinite(usd) || usd <= 0) {
		throw new Error(`Jupiter gave no valid SOL price: ${JSON.stringify(body).slice(0, 200)}`);
	}
	return { usd, source: PRICE_SOURCE, observedAt: now().toISOString() };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test agents/sentinel/jupiter.test.ts`
Expected: PASS.

- [ ] **Step 5: Check against the live API once**

Run: `bun -e 'import { fetchSolPrice } from "./agents/sentinel/jupiter"; console.log(await fetchSolPrice())'`
Expected: `{ usd: <about 100–120>, source: "jupiter-price-v3", observedAt: "<now>" }`.

- [ ] **Step 6: Commit**

```bash
git add agents/sentinel/jupiter.ts agents/sentinel/jupiter.test.ts
git commit -m "sentinel: cena SOL z Jupiter Price API v3"
```

---

### Task 6: Sentinel — continuing from the recorded decision, and one cycle

**Files:**
- Create: `agents/sentinel/previous.ts`
- Test: `agents/sentinel/previous.test.ts`
- Create: `agents/sentinel/cycle.ts`
- Test: `agents/sentinel/cycle.test.ts`

**Interfaces:**
- Consumes: `RuntimeClient`, `RecordedDecision`, `describeSubmitOutcome` (Task 3); `decide`, `summarize`, `Policy`, `PriceReading`, `Previous` (Task 4).
- Produces: `SENTINEL_KIND = 'sentinel'`; `previousFrom(record: RecordedDecision): Previous` (throws `Error` when the record is not a valid Sentinel decision); `runCycle(deps: CycleDeps): Promise<string>`, `interface CycleDeps { client: RuntimeClient; fetchPrice: () => Promise<PriceReading>; policy: Policy }`.

- [ ] **Step 1: Write the failing tests**

Create `agents/sentinel/previous.test.ts`:

```ts
import { expect, test } from 'bun:test';
import type { RecordedDecision } from '../shared/runtime-client';
import { previousFrom } from './previous';

const record = (kind: string, decision: Record<string, unknown>): RecordedDecision => ({
	agent: 'sentinel-01',
	counter: 3,
	kind,
	decision,
	summary: 'HOLD',
	observedAt: '2026-10-10T14:00:00.000Z'
});
const AFTER = { sol: 956.913095129, usdc: 104715 };

test('continues from the portfolio after the recorded decision', () => {
	const decision = { action: 'HOLD', after: AFTER, lastRebalanceAt: '2026-10-10T13:50:00.000Z' };
	expect(previousFrom(record('sentinel', decision))).toEqual({
		after: AFTER,
		lastRebalanceAt: '2026-10-10T13:50:00.000Z'
	});
});

test('accepts a decision made before any rebalance', () => {
	expect(previousFrom(record('sentinel', { after: AFTER, lastRebalanceAt: null })).lastRebalanceAt).toBeNull();
});

test('refuses a decision of another kind of agent', () => {
	expect(() => previousFrom(record('tick', {}))).toThrow('not a sentinel decision');
});

test.each([
	['a missing portfolio', { lastRebalanceAt: null }],
	['a negative amount', { after: { sol: -1, usdc: 100 }, lastRebalanceAt: null }],
	['an amount that is not a number', { after: { sol: '10', usdc: 100 }, lastRebalanceAt: null }],
	['a last rebalance that is not a time', { after: AFTER, lastRebalanceAt: 'yesterday' }],
	['a missing last rebalance', { after: AFTER }]
])('refuses %s', (_, decision) => {
	expect(() => previousFrom(record('sentinel', decision))).toThrow('malformed');
});
```

Create `agents/sentinel/cycle.test.ts`:

```ts
import { expect, test } from 'bun:test';
import type { LatestOutcome, RecordedDecision, RuntimeClient, Submission, SubmitOutcome } from '../shared/runtime-client';
import { runCycle } from './cycle';
import type { Policy, PriceReading } from './policy';

const POLICY: Policy = { targetSolShare: 0.5, driftThreshold: 0.0002, scheduleMinutes: 15 };
const PRICE: PriceReading = { usd: 109.43, source: 'jupiter-price-v3', observedAt: '2026-10-10T14:00:00.000Z' };
const AFTER = { sol: 956.913095129, usdc: 104715 };

function clientWith(latest: LatestOutcome, outcome: SubmitOutcome = { kind: 'recorded', counter: 5 }) {
	const submitted: Submission[] = [];
	const client: RuntimeClient = {
		latest: async () => latest,
		submit: async (submission) => {
			submitted.push(submission);
			return outcome;
		}
	};
	return { client, submitted };
}

const sentinelRecord = (decision: Record<string, unknown>): RecordedDecision => ({
	agent: 'sentinel-01',
	counter: 4,
	kind: 'sentinel',
	decision,
	summary: 'x',
	observedAt: PRICE.observedAt
});

const priceOf = (reading: PriceReading) => async () => reading;

test('submits the first decision from the initial holdings', async () => {
	const { client, submitted } = clientWith({ kind: 'none' });
	const line = await runCycle({ client, fetchPrice: priceOf(PRICE), policy: POLICY });
	expect(submitted).toHaveLength(1);
	expect(submitted[0].kind).toBe('sentinel');
	expect(submitted[0].decision).toMatchObject({ action: 'REBALANCE', before: { sol: 1000, usdc: 100000 } });
	expect(submitted[0].summary).toBe('REBALANCE (drift): sell 43.087 SOL @ $109.43 (SOL 52.25% → 50.00%)');
	expect(line).toBe('REBALANCE (drift): sell 43.087 SOL @ $109.43 (SOL 52.25% → 50.00%) → recorded #5');
});

test('continues from the portfolio of the recorded decision', async () => {
	const { client, submitted } = clientWith({
		kind: 'found',
		record: sentinelRecord({ after: AFTER, lastRebalanceAt: PRICE.observedAt })
	});
	await runCycle({ client, fetchPrice: priceOf(PRICE), policy: POLICY });
	expect(submitted[0].decision).toMatchObject({ action: 'HOLD', before: AFTER });
});

test('skips the cycle when the last decision is unavailable, without submitting', async () => {
	const { client, submitted } = clientWith({ kind: 'failed', reason: 'HTTP 409: not in its log' });
	const line = await runCycle({ client, fetchPrice: priceOf(PRICE), policy: POLICY });
	expect(submitted).toEqual([]);
	expect(line).toBe('skipped: last decision unavailable (HTTP 409: not in its log)');
});

test('skips the cycle when the recorded decision is not one Sentinel can continue from', async () => {
	const { client, submitted } = clientWith({ kind: 'found', record: { ...sentinelRecord({}), kind: 'tick' } });
	const line = await runCycle({ client, fetchPrice: priceOf(PRICE), policy: POLICY });
	expect(submitted).toEqual([]);
	expect(line).toStartWith('skipped: ');
});

test('skips the cycle when the price is unavailable, without submitting', async () => {
	const { client, submitted } = clientWith({ kind: 'none' });
	const failingPrice = async (): Promise<PriceReading> => {
		throw new Error('Jupiter price API answered HTTP 503');
	};
	const line = await runCycle({ client, fetchPrice: failingPrice, policy: POLICY });
	expect(submitted).toEqual([]);
	expect(line).toBe('skipped: price unavailable (Jupiter price API answered HTTP 503)');
});

test('reports a decision refused while the agent is killed', async () => {
	const { client } = clientWith({ kind: 'none' }, { kind: 'paused' });
	expect(await runCycle({ client, fetchPrice: priceOf(PRICE), policy: POLICY })).toEndWith(
		'→ refused: the owner killed the agent'
	);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test agents/sentinel/previous.test.ts agents/sentinel/cycle.test.ts`
Expected: FAIL — `Cannot find module './previous'` and `'./cycle'`.

- [ ] **Step 3: Write minimal implementation**

Create `agents/sentinel/previous.ts`:

```ts
import type { RecordedDecision } from '../shared/runtime-client';
import type { Portfolio, Previous } from './policy';

export const SENTINEL_KIND = 'sentinel';

/**
 * What Sentinel continues from, read from its last recorded decision. Throws when the record is not a Sentinel
 * decision with a sound portfolio, so the agent skips the cycle instead of resetting the treasury.
 */
export function previousFrom(record: RecordedDecision): Previous {
	if (record.kind !== SENTINEL_KIND) throw new Error(`the last decision is not a sentinel decision (${record.kind})`);
	const { after, lastRebalanceAt } = record.decision;
	if (!isPortfolio(after)) throw new Error(`malformed decision: bad portfolio ${JSON.stringify(after)}`);
	if (!isTimeOrNull(lastRebalanceAt)) {
		throw new Error(`malformed decision: bad lastRebalanceAt ${JSON.stringify(lastRebalanceAt)}`);
	}
	return { after: { sol: after.sol, usdc: after.usdc }, lastRebalanceAt };
}

function isPortfolio(value: unknown): value is Portfolio {
	if (typeof value !== 'object' || value === null) return false;
	const { sol, usdc } = value as Record<string, unknown>;
	return isAmount(sol) && isAmount(usdc);
}

function isAmount(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isTimeOrNull(value: unknown): value is string | null {
	return value === null || (typeof value === 'string' && !Number.isNaN(Date.parse(value)));
}
```

Create `agents/sentinel/cycle.ts`:

```ts
import { describeSubmitOutcome, type RuntimeClient } from '../shared/runtime-client';
import { decide, summarize, type Policy, type Previous, type PriceReading } from './policy';
import { previousFrom, SENTINEL_KIND } from './previous';

export interface CycleDeps {
	client: RuntimeClient;
	fetchPrice: () => Promise<PriceReading>;
	policy: Policy;
}

/** One cycle: last recorded decision → price → policy → submit. Returns the line to log; never throws. */
export async function runCycle({ client, fetchPrice, policy }: CycleDeps): Promise<string> {
	const latest = await client.latest();
	if (latest.kind === 'failed') return `skipped: last decision unavailable (${latest.reason})`;
	let previous: Previous | null;
	try {
		previous = latest.kind === 'none' ? null : previousFrom(latest.record);
	} catch (error) {
		return `skipped: ${messageOf(error)}`;
	}
	let price: PriceReading;
	try {
		price = await fetchPrice();
	} catch (error) {
		return `skipped: price unavailable (${messageOf(error)})`;
	}
	const decision = decide(previous, price, policy);
	const summary = summarize(decision);
	const outcome = await client.submit({ kind: SENTINEL_KIND, decision, summary });
	return `${summary} → ${describeSubmitOutcome(outcome)}`;
}

function messageOf(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test agents`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add agents/sentinel/previous.ts agents/sentinel/previous.test.ts agents/sentinel/cycle.ts agents/sentinel/cycle.test.ts
git commit -m "sentinel: kontynuacja od ostatniej zapisanej decyzji i jeden cykl agenta"
```

---

### Task 7: Sentinel — configuration, the process and its README

**Files:**
- Create: `agents/sentinel/config.ts`
- Test: `agents/sentinel/config.test.ts`
- Create: `agents/sentinel/index.ts`
- Create: `agents/sentinel/package.json`
- Create: `agents/sentinel/README.md`
- Modify: `README.md` (root: mention Sentinel next to Tick)

**Interfaces:**
- Consumes: `positiveNumber`, `Env` (Task 3); `Policy` (Task 4); `runCycle` (Task 6); `fetchSolPrice` (Task 5); `createRuntimeClient` (Task 3).
- Produces: `interface SentinelConfig { apiUrl: string; agentId: string; intervalMs: number; policy: Policy }`, `loadSentinelConfig(env: Env): SentinelConfig` (throws on an invalid value).

- [ ] **Step 1: Write the failing test**

Create `agents/sentinel/config.test.ts`:

```ts
import { expect, test } from 'bun:test';
import { loadSentinelConfig } from './config';

test('defaults to sentinel-01 on the local server, every 30 s, a 0.02 pp band and a 15-minute schedule', () => {
	expect(loadSentinelConfig({})).toEqual({
		apiUrl: 'http://localhost:5173',
		agentId: 'sentinel-01',
		intervalMs: 30_000,
		policy: { targetSolShare: 0.5, driftThreshold: 0.0002, scheduleMinutes: 15 }
	});
});

test('reads the band in percentage points and the schedule in minutes', () => {
	const config = loadSentinelConfig({ SENTINEL_DRIFT_PP: '0.05', SENTINEL_SCHEDULE_MIN: '5' });
	expect(config.policy).toEqual({ targetSolShare: 0.5, driftThreshold: 0.0005, scheduleMinutes: 5 });
});

test('reads the server, the agent id and the interval', () => {
	const config = loadSentinelConfig({
		SENTINEL_API_URL: 'http://other:5174',
		SENTINEL_AGENT_ID: 'sentinel-02',
		SENTINEL_INTERVAL_MS: '60000'
	});
	expect(config).toMatchObject({ apiUrl: 'http://other:5174', agentId: 'sentinel-02', intervalMs: 60_000 });
});

test.each([
	['SENTINEL_DRIFT_PP', '0.02pp'],
	['SENTINEL_DRIFT_PP', ''],
	['SENTINEL_SCHEDULE_MIN', '0'],
	['SENTINEL_INTERVAL_MS', '1.5']
])('refuses %s=%p, naming the variable', (name, raw) => {
	expect(() => loadSentinelConfig({ [name]: raw })).toThrow(name);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test agents/sentinel/config.test.ts`
Expected: FAIL — `Cannot find module './config'`.

- [ ] **Step 3: Write minimal implementation**

Create `agents/sentinel/config.ts`:

```ts
import { positiveNumber, type Env } from '../shared/env';
import type { Policy } from './policy';

export interface SentinelConfig {
	apiUrl: string;
	agentId: string;
	intervalMs: number;
	policy: Policy;
}

const DEFAULT_API_URL = 'http://localhost:5173';
const DEFAULT_AGENT_ID = 'sentinel-01';
/** Each decision is a paid devnet step (~15,000 lamports): 30 s is ~0.043 SOL a day. */
const DEFAULT_INTERVAL_MS = 30_000;
const TARGET_SOL_SHARE = 0.5;
/** Tight on purpose: on a quiet day SOL moves ~0.08% in a few minutes, so the demo shows rebalances. */
const DEFAULT_DRIFT_PP = 0.02;
const DEFAULT_SCHEDULE_MINUTES = 15;
const PERCENTAGE_POINTS_PER_SHARE = 100;

export function loadSentinelConfig(env: Env): SentinelConfig {
	const driftPp = positiveNumber(env, 'SENTINEL_DRIFT_PP', DEFAULT_DRIFT_PP);
	return {
		apiUrl: env.SENTINEL_API_URL ?? DEFAULT_API_URL,
		agentId: env.SENTINEL_AGENT_ID ?? DEFAULT_AGENT_ID,
		intervalMs: positiveNumber(env, 'SENTINEL_INTERVAL_MS', DEFAULT_INTERVAL_MS, { integer: true }),
		policy: {
			targetSolShare: TARGET_SOL_SHARE,
			driftThreshold: driftPp / PERCENTAGE_POINTS_PER_SHARE,
			scheduleMinutes: positiveNumber(env, 'SENTINEL_SCHEDULE_MIN', DEFAULT_SCHEDULE_MINUTES)
		}
	};
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test agents/sentinel/config.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the process, package.json and README**

Create `agents/sentinel/index.ts`:

```ts
// Sentinel: rebalances a virtual SOL/USDC treasury from the live Jupiter SOL price. It runs as its own process, holds
// no keys and keeps no state: each cycle it continues from its last decision recorded on chain.
import { createRuntimeClient } from '../shared/runtime-client';
import { loadSentinelConfig, type SentinelConfig } from './config';
import { runCycle } from './cycle';
import { fetchSolPrice } from './jupiter';

const config = configFromEnv();
const client = createRuntimeClient(config.apiUrl, config.agentId);

/** An invalid value stops the agent at start instead of running with a policy nobody asked for. */
function configFromEnv(): SentinelConfig {
	try {
		return loadSentinelConfig(process.env);
	} catch (error) {
		console.error(error instanceof Error ? error.message : error);
		process.exit(1);
	}
}

const { targetSolShare, driftThreshold, scheduleMinutes } = config.policy;
console.log(
	`Sentinel (${config.agentId}) → ${config.apiUrl}, every ${config.intervalMs} ms; target SOL ${targetSolShare}, ` +
		`band ±${driftThreshold}, schedule ${scheduleMinutes} min; Ctrl+C stops`
);
while (true) {
	const line = await runCycle({ client, fetchPrice: () => fetchSolPrice(), policy: config.policy });
	console.log(`${new Date().toISOString()} ${line}`);
	await new Promise((resolve) => setTimeout(resolve, config.intervalMs));
}
```

Create `agents/sentinel/package.json`:

```json
{
	"name": "sentinel-agent",
	"private": true,
	"type": "module",
	"main": "index.ts",
	"scripts": {
		"start": "bun index.ts",
		"test": "bun test"
	}
}
```

Create `agents/sentinel/README.md`:

````markdown
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
````

In the root `README.md`, in the bullet list at the top, replace the `agents/` bullet with:

```markdown
- `agents/`: the agents, each its own process that talks to the server over HTTP and holds no keys:
  `agents/tick` (the simplest one) and `agents/sentinel` (rebalances a virtual SOL/USDC treasury from the live price).
```

- [ ] **Step 6: Check the process refuses a bad value and runs one cycle against the server**

Run: `SENTINEL_DRIFT_PP=0.02pp bun agents/sentinel; echo "exit $?"`
Expected: `SENTINEL_DRIFT_PP must be a positive number, got "0.02pp"` and `exit 1`.

Run (main dev server running, `sentinel-01` not yet in the fleet): `timeout 5 bun agents/sentinel`
Expected: a line ending `skipped: last decision unavailable (HTTP 404: agent sentinel-01 is not in the fleet)`.

- [ ] **Step 7: Run all tests and commit**

Run: `bun test src agents`
Expected: all pass.

```bash
git add agents/sentinel README.md
git commit -m "sentinel: konfiguracja ze srodowiska, proces agenta i README"
```

---

### Task 8: Devnet — register `sentinel-01`, retire its mock, check it live

**Files:**
- Modify: `src/lib/server/modules/solana-blink/blink.service.ts` (remove the `sentinel-01` mock and its two seeded history entries)

**Interfaces:**
- Consumes: everything above; `scripts/agent.ts register`, `scripts/fleet.ts import`; the main repo's `.env` (payer and owner `ftbM4rfEotUq8EvPc6kJ1yBJ6iivjiok37sQwAoJ5cq`).
- Produces: fleet agent `sentinel-01` on devnet, listed once on the page.

- [ ] **Step 1: Remove the mock**

In `src/lib/server/modules/solana-blink/blink.service.ts`:
- delete the whole `['sentinel-01', { … }]` entry from the `agentsStore` map (the first entry, `name: 'Aegis Sentinel Alpha'`), leaving `arbiter-02` and `guardian-03`;
- delete the two entries with `agentId: 'sentinel-01'` from the `entries` array in `_seedHistory`, leaving the `arbiter-02` one;
- change the comment `// In-memory store z 3 wstępnie zdefiniowanymi agentami` to `// In-memory store: the two mock agents not yet replaced by fleet agents`.

Run: `grep -n "sentinel-01" src/lib/server/modules/solana-blink/blink.service.ts`
Expected: no output.

Run: `bun test src agents`
Expected: all pass.

- [ ] **Step 2: Register the agent on devnet (~0.15 SOL)**

From the repo root (main checkout, whose `.env` points at the `ftbM…` payer):

Run: `AGENT_FILE=.devnet/agents/sentinel-01.json bun scripts/agent.ts register`
Expected: `register: ok, … CU` with an explorer link, then `agent <address> saved to .devnet/agents/sentinel-01.json`.

- [ ] **Step 3: Put it in the fleet**

Run: `bun scripts/fleet.ts import .devnet/agents/sentinel-01.json --as sentinel-01 --name "Aegis Sentinel Alpha — Treasury Rebalancer" --risk MEDIUM`
Expected: `imported <address> as sentinel-01: owner ftbM4rfE…, Active, counter 0`.

- [ ] **Step 4: Check the page lists it once**

With the main dev server running (restart it with `bun run dev` so it reloads the changed service):

Run: `curl -s http://localhost:5173/api/agents | grep -o '"id":"[a-z0-9-]*"'`
Expected: `"id":"arbiter-02"`, `"id":"guardian-03"`, `"id":"sentinel-01"`, `"id":"tick-01"` — each once.

Run: `curl -s -w ' %{http_code}\n' http://localhost:5173/api/agents/sentinel-01/decisions/latest`
Expected: `{"latest":null} 200`.

- [ ] **Step 5: Run Sentinel live and check the demo scenario**

Run: `bun agents/sentinel` (leave it running; Ctrl+C at the end)
Expected, in order:
1. first line: `REBALANCE (drift): sell … SOL @ $… (SOL 52.…% → 50.00%) → recorded #1` (the initial holdings are ~52% SOL at ~$109);
2. then `HOLD @ $… (SOL 50.0…%, band ±0.02 pp) → recorded #N` lines;
3. a `REBALANCE (drift)` when the price moves ~0.08%, or `REBALANCE (schedule)` at the latest 15 minutes after the last rebalance;
4. on the page (http://localhost:5173), the Sentinel card's text is the latest summary line and its counter grows.

Then on the page select Sentinel and press Kill-Switch:
5. the agent logs `… → refused: the owner killed the agent` each cycle;
6. `curl -s http://localhost:5173/api/agents/sentinel-01/decisions/latest` shows the same `record.counter` on every call while killed.

Press Autoryzuj Krok (resume):
7. the next recorded decision's `before` equals the `after` of the decision returned in point 6.

- [ ] **Step 6: Commit**

```bash
git add src/lib/server/modules/solana-blink/blink.service.ts
git commit -m "gui: makieta sentinel-01 zastapiona agentem Sentinel z floty (devnet)"
```
