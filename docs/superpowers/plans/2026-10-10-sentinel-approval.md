# Sentinel Approvals, Price Shock and Decision Feed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Sentinel rebalance worth more than 0.25% of the treasury becomes a proposal that stops the agent until a human accepts or rejects it on the page; a demo button arms a one-off simulated price shock that triggers one; the page shows the agent's decisions as a feed and verdicts in the observability log.

**Architecture:** The server is the gate: agents reach the chain only through it, so `submitDecision` refuses steps while the agent's latest on-chain decision is a proposal (`requiresApproval: true`), and the owner's verdict is recorded as the agent's next step (`kind: "approval"`). The shock is an in-memory, one-off value per agent that Sentinel claims each cycle. The page reads a new decision list route and the view model's new `fleet` details. The guard program does not change.

**Tech Stack:** Bun (runtime, `bun test`), TypeScript, SvelteKit 3 + Svelte 5 runes, Tailwind 4, `lucide-svelte`.

**Spec:** `docs/superpowers/specs/2026-10-10-sentinel-approval-design.md` (builds on `docs/superpowers/specs/2026-10-10-sentinel-agent-design.md`).

## Global Constraints

- Agents (`agents/**`) import nothing from `src/`; HTTP is their only contract with the server.
- Tests: `~/.bun/bin/bun test src agents` from the repo root; no network in tests. Baseline before Task 1: 152 pass, 0 fail.
- `bun run check` already reports ~52 errors (unresolved `#lib/…`, `bun:test` types, older files). Gate: no error or warning in a file this plan creates, and no new one in a file it modifies.
- Approval threshold: `SENTINEL_APPROVAL_PCT`, default **0.25** (% of the treasury value before the trade); `policy.approvalShare` = pct / 100. A trade needs approval when `trade.usdc > approvalShare × total value before` (strictly greater).
- Submission field `requiresApproval`: absent or exactly `true`; any other value → 400.
- Record kinds: `"sentinel"` (Sentinel), `"approval"` (verdict). Verdicts: `"accept" | "reject"`. Verdict summaries: `APPROVED: <proposal summary>` / `REJECTED: <proposal summary>`. Verdict decision: `{ verdict, proposal: { counter, decisionHash, kind, decision, summary }, decidedBy }`, `decidedBy` = the on-chain owner from the guard account.
- Error codes: `AwaitingApproval` → 409, `NoPendingProposal` → 409 (body `{ error, message }` as in `fleetErrorResponse`).
- Routes: `POST /api/agents/<id>/approval` `{ verdict }`; `POST /api/agents/<id>/shock` `{ pct }`; `POST /api/agents/<id>/shock/claim` → `{ shock: { pct } | null }`; `GET /api/agents/<id>/decisions?limit=N` → `{ entries }` newest first (default 10, max 50).
- Shock: `pct` a finite non-zero number with `|pct| ≤ 50`; the page button sends **−3**. Shocked reading: `usd = realUsd × (1 + pct / 100)`, `simulatedShock: { pct, realUsd }`.
- Summaries: proposal `PROPOSE (<reason>, needs approval): <side> <sol> SOL @ $<usd> (SOL <before> → <after>)`; any decision at a shocked price ends with ` [simulated shock <pct>%]` (e.g. `-3`).
- Page copy in Polish: **Autoryzuj Krok**, **Odrzuć**, **Zatwierdź**, **Kill-Switch 🛑**, **Wznów agenta**, **Symuluj szok ceny (−3%)**, **Szok uzbrojony — w następnym cyklu**; card status `AWAITING_APPROVAL` amber; log chips **APPROVED** (emerald), **REJECTED** (amber), **RESUME** (sky).
- Style: tabs in `agents/`, `src/lib/server/modules/fleet/`, `src/lib/fleet-feed*.ts` and new routes; 2 spaces in `blink.service.ts`, `action-history.ts`, `+page.svelte` and `DecisionFeed.svelte`. English comments, one line where the code does not say it. Commits in Polish without diacritics, like `git log --oneline`; **no `Co-Authored-By` trailer**. Branch `first_agent`, local only: **do not push**.
- Deliberate deviations from the spec: `fleet/record-decision.ts` (shared step recording) and `solana-blink/action-history.ts` (testable log) are extracted; the view model puts the new fields under `fleet: { pendingProposal, shockArmed, lastDecisionKind }`; the shock button shows when `lastDecisionKind` is `sentinel` or `approval` (the server does not know an agent's program). Consequence to document: a Sentinel started from the initial holdings proposes its first rebalance (~2.25% of the treasury) and waits for approval.

## Review Focus

1. A double click on Zatwierdź: the second verdict must be 409 `NoPendingProposal`, never a second verdict on chain. Test in Task 2.
2. A shock armed while a proposal waits must survive until after the verdict: a waiting cycle must not claim it. Test in Task 8.
3. Kill while a proposal waits, then resume: the proposal is still pending (resume does not change `lastDecision`), and a verdict while killed is refused with nothing logged. Tests in Task 2.
4. A verdict record whose proposal is malformed or of another kind must skip Sentinel's cycle, never reset the treasury. Tests in Task 7.
5. Tick's records (`action: "SELL"`, no price or portfolio) in the feed must render as a plain summary row, not throw. Test in Task 9.

---

### Task 1: Server — proposals and the refusal while one waits

**Files:**
- Create: `src/lib/server/modules/fleet/testing/memory-guard.ts`
- Create: `src/lib/server/modules/fleet/record-decision.ts`
- Create: `src/lib/server/modules/fleet/approval.ts`
- Modify: `src/lib/server/modules/fleet/fleet.ts` (`DecisionRecord`)
- Modify: `src/lib/server/modules/fleet/submit-decision.ts`
- Modify: `src/lib/server/modules/fleet/http-errors.ts`
- Modify: `src/routes/api/agents/[id]/decisions/+server.ts` (400 message)
- Test: `src/lib/server/modules/fleet/submit-decision.test.ts`, `src/lib/server/modules/fleet/http-errors.test.ts`

**Interfaces:**
- Consumes: `AgentGuard`, `GuardAccount`, `GuardError`, `NO_DECISION` (`agent-guard/guard.ts`); `Fleet`, `DecisionLogEntry`, `DecisionRecord` (`fleet.ts`); `StepThrottle`.
- Produces:
  - `class MemoryGuard implements AgentGuard` — `new MemoryGuard(agentId: string, owner: string)`.
  - `DecisionRecord.requiresApproval?: true`; `DecisionSubmission.requiresApproval?: true`.
  - `recordDecision(runtime: FleetRuntime, agentId: string, account: GuardAccount, submission: DecisionSubmission): Promise<DecisionLogEntry>`; `assertInFleet(runtime: FleetRuntime, agentId: string): void`.
  - `class AwaitingApprovalError extends Error`; `proposalAwaiting(fleet: Fleet, agentId: string, account: GuardAccount): DecisionLogEntry | null`.

- [ ] **Step 1: Move the in-memory guard out of the test file**

Create `src/lib/server/modules/fleet/testing/memory-guard.ts`:

```ts
import { GuardError, NO_DECISION, type AgentGuard, type GuardAccount } from '../../agent-guard/guard';

/** Stands in for the program in tests: one agent's account in memory, with the step, kill and resume rules. */
export class MemoryGuard implements AgentGuard {
	private account: GuardAccount;

	constructor(
		private readonly agentId: string,
		owner: string
	) {
		this.account = { owner, status: 'Active', counter: 0, lastDecision: NO_DECISION };
	}

	async readAgent(agentId: string): Promise<GuardAccount> {
		if (agentId !== this.agentId) throw new GuardError('AgentNotFound', `no ${agentId}`);
		return this.account;
	}

	async recordStep(agentId: string, counter: number, decisionHash: string): Promise<GuardAccount> {
		const account = await this.readAgent(agentId);
		if (account.status === 'Killed') throw new GuardError('AgentKilled', 'killed');
		if (counter !== account.counter + 1) throw new GuardError('CounterMismatch', 'stale counter');
		return (this.account = { ...account, counter, lastDecision: decisionHash });
	}

	async kill(agentId: string): Promise<GuardAccount> {
		return (this.account = { ...(await this.readAgent(agentId)), status: 'Killed' });
	}

	async resume(agentId: string): Promise<GuardAccount> {
		const account = await this.readAgent(agentId);
		return (this.account = { ...account, status: 'Active', counter: account.counter + 1 });
	}
}
```

In `src/lib/server/modules/fleet/submit-decision.test.ts`, delete the local `class MemoryGuard` (and its doc comment), import the shared one, and construct it with the agent and owner:

```ts
import { MemoryGuard } from './testing/memory-guard';
```

```ts
	const guard = new MemoryGuard(AGENT, OWNER);
```

Drop `NO_DECISION` and `GuardAccount` from the `../agent-guard/guard` import if no longer used. Run `~/.bun/bin/bun test src/lib/server/modules/fleet` — expected: all pass (pure move).

- [ ] **Step 2: Write the failing tests**

Append to `src/lib/server/modules/fleet/submit-decision.test.ts` (add `AwaitingApprovalError` to imports: `import { AwaitingApprovalError } from './approval';`):

```ts
const PROPOSAL = { ...SUBMISSION, requiresApproval: true as const };

describe('proposals', () => {
	test('records the approval flag in the record whose hash the guard keeps', async () => {
		await submitDecision(runtime, AGENT, PROPOSAL);
		const logged = runtime.fleet.lastDecision(AGENT)!;
		expect(logged.record.requiresApproval).toBe(true);
		expect((await runtime.guard.readAgent(AGENT)).lastDecision).toBe(logged.decisionHash);
	});

	test('refuses the next decision while the proposal waits, before the throttle and the guard', async () => {
		const throttled = { ...runtime, throttle: new StepThrottle(10_000) };
		await submitDecision(runtime, AGENT, PROPOSAL);
		const error = await submitDecision(throttled, AGENT, SUBMISSION).catch((caught: unknown) => caught);
		expect(error).toBeInstanceOf(AwaitingApprovalError);
		expect((await runtime.guard.readAgent(AGENT)).counter).toBe(1);
		expect(() => throttled.throttle.claim(AGENT, NOW.getTime())).not.toThrow();
	});

	test('accepts the next decision when the latest one is not a proposal', async () => {
		await submitDecision(runtime, AGENT, SUBMISSION);
		expect(await submitDecision(runtime, AGENT, SUBMISSION)).toEqual({ counter: 2 });
	});
});
```

Extend the `parseSubmission` describe:

```ts
	test('accepts a submission that requires approval', () => {
		expect(parseSubmission(PROPOSAL)).toEqual(PROPOSAL);
	});

	test.each([
		['false', false],
		['a string', 'yes'],
		['null', null]
	])('rejects requiresApproval set to %s', (_, requiresApproval) => {
		expect(parseSubmission({ ...SUBMISSION, requiresApproval })).toBeNull();
	});
```

Note: `PROPOSAL` is declared at module level after `SUBMISSION`, so `parseSubmission` tests can use it.

Append to `src/lib/server/modules/fleet/http-errors.test.ts` (import `AwaitingApprovalError` from `./approval`):

```ts
test('answers a decision submitted while a proposal waits with 409 AwaitingApproval', async () => {
	expect(await answer(new AwaitingApprovalError('waiting'))).toEqual({
		status: 409,
		body: { error: 'AwaitingApproval', message: 'waiting' }
	});
});
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `~/.bun/bin/bun test src/lib/server/modules/fleet`
Expected: FAIL — `Cannot find module './approval'`.

- [ ] **Step 4: Implement**

In `src/lib/server/modules/fleet/fleet.ts`, extend `DecisionRecord`:

```ts
/** What the agent decided, as hashed for the guard. */
export interface DecisionRecord {
	agent: string;
	counter: number;
	kind: string;
	decision: Record<string, unknown>;
	summary: string;
	/** The agent stops after this decision until the owner accepts or rejects it. */
	requiresApproval?: true;
	observedAt: string;
}
```

Create `src/lib/server/modules/fleet/record-decision.ts`:

```ts
import { createHash } from 'crypto';
import { GuardError, type GuardAccount } from '../agent-guard/guard';
import type { DecisionLogEntry, DecisionRecord } from './fleet';
import type { DecisionSubmission, FleetRuntime } from './submit-decision';

export function assertInFleet(runtime: FleetRuntime, agentId: string): void {
	if (!runtime.fleet.get(agentId)) throw new GuardError('AgentNotFound', `agent ${agentId} is not in the fleet`);
}

/**
 * Hashes the decision as the agent's next step after `account`, records it with the guard and logs it. The log keeps
 * the full record, so anyone can recompute the hash the guard holds.
 */
export async function recordDecision(
	runtime: FleetRuntime,
	agentId: string,
	account: GuardAccount,
	submission: DecisionSubmission
): Promise<DecisionLogEntry> {
	const record: DecisionRecord = {
		agent: agentId,
		counter: account.counter + 1,
		...submission,
		observedAt: runtime.now().toISOString()
	};
	const decisionHash = createHash('sha256').update(JSON.stringify(record)).digest('hex');
	try {
		await runtime.guard.recordStep(agentId, record.counter, decisionHash);
	} catch (error) {
		// A refusal is a verdict: nothing was recorded. Any other failure (e.g. a confirmation timeout on the chain) may
		// still end with the step recorded, and the log is the only way to recompute its hash.
		if (!(error instanceof GuardError)) runtime.fleet.appendDecision(agentId, { record, decisionHash, unconfirmed: true });
		throw error;
	}
	const entry = { record, decisionHash };
	runtime.fleet.appendDecision(agentId, entry);
	return entry;
}
```

Create `src/lib/server/modules/fleet/approval.ts`:

```ts
import { NO_DECISION, type GuardAccount } from '../agent-guard/guard';
import type { DecisionLogEntry, Fleet } from './fleet';

// Approvals: an agent marks a decision as a proposal and stops; the owner accepts or rejects it. The server is the gate,
// since agents reach the chain only through it.

/** The agent submitted a decision while its proposal waits for the owner's verdict. */
export class AwaitingApprovalError extends Error {}

/**
 * The proposal waiting for a verdict: the decision recorded on chain last, when it requires approval. A hash the log
 * does not hold counts as none here; `latestDecision` reports that disagreement.
 */
export function proposalAwaiting(fleet: Fleet, agentId: string, account: GuardAccount): DecisionLogEntry | null {
	if (account.lastDecision === NO_DECISION) return null;
	const entry = fleet.findDecision(agentId, account.lastDecision);
	return entry?.record.requiresApproval ? entry : null;
}
```

Replace the body of `src/lib/server/modules/fleet/submit-decision.ts` above `isPlainObject` with:

```ts
import type { AgentGuard } from '../agent-guard/guard';
import { AwaitingApprovalError, proposalAwaiting } from './approval';
import type { Fleet } from './fleet';
import { assertInFleet, recordDecision } from './record-decision';
import type { StepThrottle } from './step-throttle';

/** What an agent process sends: its own kind, its decision, one line describing it and whether it must wait. */
export interface DecisionSubmission {
	kind: string;
	decision: Record<string, unknown>;
	summary: string;
	/** The agent stops after this decision until the owner accepts or rejects it. */
	requiresApproval?: true;
}

export interface FleetRuntime {
	guard: AgentGuard;
	fleet: Fleet;
	throttle: StepThrottle;
	now(): Date;
}

/**
 * Records the agent's decision as its next step. Refused while its proposal waits for a verdict (before the throttle,
 * so a waiting agent spends nothing) and, by the guard, while the agent is killed.
 */
export async function submitDecision(
	runtime: FleetRuntime,
	agentId: string,
	submission: DecisionSubmission
): Promise<{ counter: number }> {
	assertInFleet(runtime, agentId);
	const account = await runtime.guard.readAgent(agentId);
	if (proposalAwaiting(runtime.fleet, agentId, account)) {
		throw new AwaitingApprovalError(`agent ${agentId} is waiting for the owner's verdict on its proposal`);
	}
	runtime.throttle.claim(agentId, runtime.now().getTime());
	const { record } = await recordDecision(runtime, agentId, account, submission);
	return { counter: record.counter };
}

/** Returns the submission with exactly its fields, or null when the body does not have that shape. */
export function parseSubmission(body: unknown): DecisionSubmission | null {
	if (!isPlainObject(body)) return null;
	const { kind, decision, summary, requiresApproval } = body;
	if (typeof kind !== 'string' || kind === '' || typeof summary !== 'string' || !isPlainObject(decision)) return null;
	if (requiresApproval === undefined) return { kind, decision, summary };
	return requiresApproval === true ? { kind, decision, summary, requiresApproval } : null;
}
```

(Keep `isPlainObject` unchanged; remove the now unused `createHash`, `GuardError` and `DecisionRecord` imports.)

In `src/lib/server/modules/fleet/http-errors.ts`, import `AwaitingApprovalError` from `./approval` and add, after the `DecisionNotInLogError` line:

```ts
	if (error instanceof AwaitingApprovalError) return answer(CONFLICT, 'AwaitingApproval', error.message);
```

In `src/routes/api/agents/[id]/decisions/+server.ts`, change the 400 message to `'expected { kind, decision, summary, requiresApproval? }'` and the doc comment's first line to `An agent process submits its next decision; 409 while the agent is killed or its proposal waits for a verdict,`.

- [ ] **Step 5: Run the tests**

Run: `~/.bun/bin/bun test src agents`
Expected: PASS, 152 + 7 new = 159 (exact count may differ by `test.each` expansion; 0 fail).

- [ ] **Step 6: Commit**

```bash
git add src/lib/server/modules/fleet src/routes/api/agents
git commit -m "fleet: propozycje wymagajace zatwierdzenia, odmowa krokow agenta dopoki czeka na werdykt"
```

---

### Task 2: Server — the owner's verdict

**Files:**
- Modify: `src/lib/server/modules/fleet/approval.ts`
- Modify: `src/lib/server/modules/fleet/http-errors.ts`
- Test: `src/lib/server/modules/fleet/approval.test.ts` (create), `src/lib/server/modules/fleet/http-errors.test.ts`

**Interfaces:**
- Consumes: `recordDecision`, `assertInFleet` (Task 1), `proposalAwaiting`, `submitDecision`, `MemoryGuard`.
- Produces: `type Verdict = 'accept' | 'reject'`; `APPROVAL_KIND = 'approval'`; `class NoPendingProposalError extends Error`; `recordVerdict(runtime: FleetRuntime, agentId: string, verdict: Verdict): Promise<DecisionLogEntry>`; `parseVerdict(body: unknown): Verdict | null`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/server/modules/fleet/approval.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { GuardError } from '../agent-guard/guard';
import { NoPendingProposalError, parseVerdict, proposalAwaiting, recordVerdict } from './approval';
import { Fleet } from './fleet';
import { StepThrottle } from './step-throttle';
import { submitDecision, type FleetRuntime } from './submit-decision';
import { MemoryGuard } from './testing/memory-guard';

const OWNER = 'ftbMowner1111111111111111111111111111111111';
const AGENT = 'sentinel-01';
const NOW = new Date('2026-10-10T15:00:00.000Z');
const PROPOSAL = {
	kind: 'sentinel',
	decision: { action: 'REBALANCE', approval: 'required' },
	summary: 'PROPOSE (drift, needs approval): buy 14.798 SOL @ $106.15 (SOL 49.24% → 50.00%)',
	requiresApproval: true as const
};
const HOLD = { kind: 'sentinel', decision: { action: 'HOLD' }, summary: 'HOLD' };

let rootDir: string;
let runtime: FleetRuntime;

const pending = async () => proposalAwaiting(runtime.fleet, AGENT, await runtime.guard.readAgent(AGENT));
const failure = (promise: Promise<unknown>) => promise.then(() => undefined, (caught: unknown) => caught);

beforeEach(() => {
	rootDir = mkdtempSync(join(tmpdir(), 'approval-'));
	const fleet = new Fleet(join(rootDir, 'fleet'));
	fleet.register({ id: AGENT, name: 'Sentinel', riskLevel: 'MEDIUM', registeredAt: NOW.getTime() });
	runtime = { guard: new MemoryGuard(AGENT, OWNER), fleet, throttle: new StepThrottle(0), now: () => NOW };
});

afterEach(() => rmSync(rootDir, { recursive: true, force: true }));

describe('proposalAwaiting', () => {
	test('is null before any step', async () => {
		expect(await pending()).toBeNull();
	});

	test('is null when the latest decision is not a proposal', async () => {
		await submitDecision(runtime, AGENT, HOLD);
		expect(await pending()).toBeNull();
	});

	test('is the latest decision when it is a proposal', async () => {
		await submitDecision(runtime, AGENT, PROPOSAL);
		expect((await pending())?.record.counter).toBe(1);
	});

	test('survives a kill and a resume, which do not change the latest decision', async () => {
		await submitDecision(runtime, AGENT, PROPOSAL);
		await runtime.guard.kill(AGENT, OWNER);
		await runtime.guard.resume(AGENT, OWNER);
		expect((await pending())?.record.counter).toBe(1);
	});
});

describe('recordVerdict', () => {
	test('records an accept as the next step, carrying the proposal and the owner', async () => {
		await submitDecision(runtime, AGENT, PROPOSAL);
		const proposalHash = runtime.fleet.lastDecision(AGENT)!.decisionHash;

		const { record, decisionHash } = await recordVerdict(runtime, AGENT, 'accept');

		expect(record).toEqual({
			agent: AGENT,
			counter: 2,
			kind: 'approval',
			decision: {
				verdict: 'accept',
				proposal: {
					counter: 1,
					decisionHash: proposalHash,
					kind: PROPOSAL.kind,
					decision: PROPOSAL.decision,
					summary: PROPOSAL.summary
				},
				decidedBy: OWNER
			},
			summary: `APPROVED: ${PROPOSAL.summary}`,
			observedAt: NOW.toISOString()
		});
		expect((await runtime.guard.readAgent(AGENT)).lastDecision).toBe(decisionHash);
		expect(await pending()).toBeNull();
	});

	test('records a reject with its own summary', async () => {
		await submitDecision(runtime, AGENT, PROPOSAL);
		const { record } = await recordVerdict(runtime, AGENT, 'reject');
		expect(record.summary).toBe(`REJECTED: ${PROPOSAL.summary}`);
		expect(record.decision.verdict).toBe('reject');
	});

	test('refuses a verdict when no proposal waits', async () => {
		await submitDecision(runtime, AGENT, HOLD);
		expect(await failure(recordVerdict(runtime, AGENT, 'accept'))).toBeInstanceOf(NoPendingProposalError);
	});

	test('refuses a second verdict on the same proposal (double click)', async () => {
		await submitDecision(runtime, AGENT, PROPOSAL);
		await recordVerdict(runtime, AGENT, 'accept');
		expect(await failure(recordVerdict(runtime, AGENT, 'accept'))).toBeInstanceOf(NoPendingProposalError);
		expect((await runtime.guard.readAgent(AGENT)).counter).toBe(2);
	});

	test('is refused by the guard while the agent is killed, logging nothing', async () => {
		await submitDecision(runtime, AGENT, PROPOSAL);
		await runtime.guard.kill(AGENT, OWNER);
		const error = await failure(recordVerdict(runtime, AGENT, 'accept'));
		expect((error as GuardError).code).toBe('AgentKilled');
		expect(runtime.fleet.lastDecision(AGENT)!.record.counter).toBe(1);
	});

	test('is not throttled: it is the owner acting, like kill and resume', async () => {
		const throttled = { ...runtime, throttle: new StepThrottle(10_000) };
		await submitDecision(throttled, AGENT, PROPOSAL);
		expect((await recordVerdict(throttled, AGENT, 'reject')).record.counter).toBe(2);
	});

	test('refuses an agent outside the fleet', async () => {
		const error = await failure(recordVerdict(runtime, 'stranger', 'accept'));
		expect((error as GuardError).code).toBe('AgentNotFound');
	});
});

describe('parseVerdict', () => {
	test.each(['accept', 'reject'])('accepts %s', (verdict) => {
		expect(parseVerdict({ verdict })).toBe(verdict as 'accept' | 'reject');
	});

	test.each([['no body', null], ['another word', { verdict: 'approve' }], ['no verdict', {}]])('rejects %s', (_, body) => {
		expect(parseVerdict(body)).toBeNull();
	});
});
```

Append to `src/lib/server/modules/fleet/http-errors.test.ts` (import `NoPendingProposalError` from `./approval`):

```ts
test('answers a verdict without a waiting proposal with 409 NoPendingProposal', async () => {
	expect(await answer(new NoPendingProposalError('none'))).toEqual({
		status: 409,
		body: { error: 'NoPendingProposal', message: 'none' }
	});
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `~/.bun/bin/bun test src/lib/server/modules/fleet`
Expected: FAIL — `NoPendingProposalError` / `recordVerdict` / `parseVerdict` not exported.

- [ ] **Step 3: Implement**

Append to `src/lib/server/modules/fleet/approval.ts` (add imports `import { assertInFleet, recordDecision } from './record-decision';` and `import type { FleetRuntime } from './submit-decision';`):

```ts
export type Verdict = 'accept' | 'reject';

export const APPROVAL_KIND = 'approval';
const VERDICT_LABELS: Record<Verdict, string> = { accept: 'APPROVED', reject: 'REJECTED' };

/** A verdict arrived while no proposal waits (none was made, or it was already decided). */
export class NoPendingProposalError extends Error {}

/**
 * Records the owner's verdict on the waiting proposal as the agent's next step. Not throttled: like kill and resume it
 * is the owner acting. The guard refuses it while the agent is killed.
 */
export async function recordVerdict(runtime: FleetRuntime, agentId: string, verdict: Verdict): Promise<DecisionLogEntry> {
	assertInFleet(runtime, agentId);
	const account = await runtime.guard.readAgent(agentId);
	const proposal = proposalAwaiting(runtime.fleet, agentId, account);
	if (!proposal) throw new NoPendingProposalError(`agent ${agentId} has no proposal waiting for a verdict`);
	const { counter, kind, decision, summary } = proposal.record;
	return recordDecision(runtime, agentId, account, {
		kind: APPROVAL_KIND,
		decision: {
			verdict,
			proposal: { counter, decisionHash: proposal.decisionHash, kind, decision, summary },
			decidedBy: account.owner
		},
		summary: `${VERDICT_LABELS[verdict]}: ${summary}`
	});
}

export function parseVerdict(body: unknown): Verdict | null {
	const verdict = typeof body === 'object' && body !== null ? (body as Record<string, unknown>).verdict : undefined;
	return verdict === 'accept' || verdict === 'reject' ? verdict : null;
}
```

In `http-errors.ts` add, next to the `AwaitingApprovalError` line (and import `NoPendingProposalError`):

```ts
	if (error instanceof NoPendingProposalError) return answer(CONFLICT, 'NoPendingProposal', error.message);
```

- [ ] **Step 4: Run the tests**

Run: `~/.bun/bin/bun test src agents`
Expected: PASS, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/modules/fleet
git commit -m "fleet: werdykt wlasciciela (accept/reject) zapisany jako kolejny krok agenta"
```

---

### Task 3: Server — the simulated price shock

**Files:**
- Create: `src/lib/server/modules/fleet/shock-store.ts`
- Modify: `src/lib/server/modules/fleet/app-runtime.ts`
- Create: `src/routes/api/agents/[id]/shock/+server.ts`
- Create: `src/routes/api/agents/[id]/shock/claim/+server.ts`
- Test: `src/lib/server/modules/fleet/shock-store.test.ts`

**Interfaces:**
- Consumes: `assertInFleet` (Task 1), `getFleetRuntime`, `fleetErrorResponse`.
- Produces: `class ShockStore { arm(agentId: string, pct: number): void; claim(agentId: string): number | null; isArmed(agentId: string): boolean }`; `parseShockPct(body: unknown): number | null`; `shockStore: ShockStore` exported from `app-runtime.ts`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/server/modules/fleet/shock-store.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';
import { parseShockPct, ShockStore } from './shock-store';

describe('ShockStore', () => {
	test('has nothing armed at first', () => {
		const store = new ShockStore();
		expect(store.isArmed('sentinel-01')).toBe(false);
		expect(store.claim('sentinel-01')).toBeNull();
	});

	test('hands an armed shock out once', () => {
		const store = new ShockStore();
		store.arm('sentinel-01', -3);
		expect(store.isArmed('sentinel-01')).toBe(true);
		expect(store.claim('sentinel-01')).toBe(-3);
		expect(store.isArmed('sentinel-01')).toBe(false);
		expect(store.claim('sentinel-01')).toBeNull();
	});

	test('replaces a shock armed earlier', () => {
		const store = new ShockStore();
		store.arm('sentinel-01', -3);
		store.arm('sentinel-01', 5);
		expect(store.claim('sentinel-01')).toBe(5);
	});

	test('keeps each agent apart', () => {
		const store = new ShockStore();
		store.arm('sentinel-01', -3);
		expect(store.claim('tick-01')).toBeNull();
		expect(store.claim('sentinel-01')).toBe(-3);
	});
});

describe('parseShockPct', () => {
	test.each([-3, 2.5, 50, -50])('accepts %p', (pct) => {
		expect(parseShockPct({ pct })).toBe(pct);
	});

	test.each([
		['zero', { pct: 0 }],
		['above 50', { pct: 50.5 }],
		['below -50', { pct: -51 }],
		['a string', { pct: '-3' }],
		['not finite', { pct: Infinity }],
		['no pct', {}],
		['no body', null]
	])('rejects %s', (_, body) => {
		expect(parseShockPct(body)).toBeNull();
	});
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `~/.bun/bin/bun test src/lib/server/modules/fleet/shock-store.test.ts`
Expected: FAIL — `Cannot find module './shock-store'`.

- [ ] **Step 3: Implement**

Create `src/lib/server/modules/fleet/shock-store.ts`:

```ts
/** The largest shock the demo accepts, in percent of the price, either way. */
const MAX_SHOCK_PCT = 50;

/**
 * One-off simulated price shocks for the demo: armed from the page, claimed by the agent's next cycle. Kept in memory;
 * a server restart drops an armed shock.
 */
export class ShockStore {
	private readonly armed = new Map<string, number>();

	arm(agentId: string, pct: number): void {
		this.armed.set(agentId, pct);
	}

	/** The armed shock, which this call disarms; null when none is armed. */
	claim(agentId: string): number | null {
		const pct = this.armed.get(agentId);
		this.armed.delete(agentId);
		return pct ?? null;
	}

	isArmed(agentId: string): boolean {
		return this.armed.has(agentId);
	}
}

/** The shock in a request body: a finite, non-zero percent, at most 50 either way; null otherwise. */
export function parseShockPct(body: unknown): number | null {
	const pct = typeof body === 'object' && body !== null ? (body as Record<string, unknown>).pct : undefined;
	const valid = typeof pct === 'number' && Number.isFinite(pct) && pct !== 0 && Math.abs(pct) <= MAX_SHOCK_PCT;
	return valid ? (pct as number) : null;
}
```

In `src/lib/server/modules/fleet/app-runtime.ts` add (import `ShockStore` from `./shock-store`):

```ts
/** The server's one store of armed demo shocks. */
export const shockStore = new ShockStore();
```

Create `src/routes/api/agents/[id]/shock/+server.ts`:

```ts
import { json, type RequestHandler } from '@sveltejs/kit';
import { getFleetRuntime, shockStore } from '#lib/server/modules/fleet/app-runtime';
import { fleetErrorResponse } from '#lib/server/modules/fleet/http-errors';
import { assertInFleet } from '#lib/server/modules/fleet/record-decision';
import { parseShockPct } from '#lib/server/modules/fleet/shock-store';

const BAD_REQUEST = 400;

/** Arms a one-off simulated price shock for the agent's next cycle (demo); replaces one already armed. */
export const POST: RequestHandler = async ({ params, request }) => {
	const pct = parseShockPct(await request.json().catch(() => null));
	if (pct === null) {
		const message = 'expected { pct }: a non-zero number of percent, at most 50 either way';
		return json({ error: 'BadRequest', message }, { status: BAD_REQUEST });
	}
	try {
		assertInFleet(await getFleetRuntime(), params.id!);
		shockStore.arm(params.id!, pct);
		return json({ armed: { pct } });
	} catch (error) {
		return fleetErrorResponse(error, `shock for agent ${params.id}`);
	}
};
```

Create `src/routes/api/agents/[id]/shock/claim/+server.ts`:

```ts
import { json, type RequestHandler } from '@sveltejs/kit';
import { getFleetRuntime, shockStore } from '#lib/server/modules/fleet/app-runtime';
import { fleetErrorResponse } from '#lib/server/modules/fleet/http-errors';
import { assertInFleet } from '#lib/server/modules/fleet/record-decision';

/** The agent claims the shock armed for it, which disarms it; `{ shock: null }` when none is armed. */
export const POST: RequestHandler = async ({ params }) => {
	try {
		assertInFleet(await getFleetRuntime(), params.id!);
		const pct = shockStore.claim(params.id!);
		return json({ shock: pct === null ? null : { pct } });
	} catch (error) {
		return fleetErrorResponse(error, `shock claim of agent ${params.id}`);
	}
};
```

- [ ] **Step 4: Run the tests**

Run: `~/.bun/bin/bun test src agents`
Expected: PASS, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/modules/fleet src/routes/api/agents
git commit -m "fleet: jednorazowy symulowany szok ceny (uzbrojenie z GUI, odbior przez agenta)"
```

---

### Task 4: Server — the decision list

**Files:**
- Modify: `src/lib/server/modules/fleet/fleet.ts` (new `recentDecisions`)
- Modify: `src/routes/api/agents/[id]/decisions/+server.ts` (new `GET`)
- Test: `src/lib/server/modules/fleet/fleet.test.ts` (create)

**Interfaces:**
- Consumes: `assertInFleet` (Task 1).
- Produces: `Fleet.recentDecisions(agentId: string, limit: number): DecisionLogEntry[]` (newest first); `GET /api/agents/<id>/decisions?limit=N` → `{ entries: DecisionLogEntry[] }`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/server/modules/fleet/fleet.test.ts`:

```ts
import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Fleet, type DecisionLogEntry } from './fleet';

const AGENT = 'sentinel-01';
let rootDir: string;
let fleet: Fleet;

function entry(counter: number, unconfirmed?: true): DecisionLogEntry {
	const record = {
		agent: AGENT,
		counter,
		kind: 'sentinel',
		decision: { action: 'HOLD' },
		summary: `HOLD #${counter}`,
		observedAt: '2026-10-10T15:00:00.000Z'
	};
	const decisionHash = String(counter).padStart(64, '0');
	return unconfirmed ? { record, decisionHash, unconfirmed } : { record, decisionHash };
}

beforeEach(() => {
	rootDir = mkdtempSync(join(tmpdir(), 'fleet-'));
	fleet = new Fleet(join(rootDir, 'fleet'));
	fleet.register({ id: AGENT, name: 'Sentinel', riskLevel: 'MEDIUM', registeredAt: 0 });
});

afterEach(() => rmSync(rootDir, { recursive: true, force: true }));

test('lists the newest decisions first, at most the limit', () => {
	[1, 2, 3].forEach((counter) => fleet.appendDecision(AGENT, entry(counter)));
	expect(fleet.recentDecisions(AGENT, 2)).toEqual([entry(3), entry(2)]);
});

test('keeps the unconfirmed mark', () => {
	fleet.appendDecision(AGENT, entry(1, true));
	expect(fleet.recentDecisions(AGENT, 10)).toEqual([entry(1, true)]);
});

test('is empty before the first decision', () => {
	expect(fleet.recentDecisions(AGENT, 10)).toEqual([]);
});
```

- [ ] **Step 2: Run the test to see it fail**

Run: `~/.bun/bin/bun test src/lib/server/modules/fleet/fleet.test.ts`
Expected: FAIL — `fleet.recentDecisions is not a function`.

- [ ] **Step 3: Implement**

In `src/lib/server/modules/fleet/fleet.ts`, add after `lastDecision`:

```ts
	/** The newest `limit` log entries, newest first, `unconfirmed` marks included. */
	recentDecisions(agentId: string, limit: number): DecisionLogEntry[] {
		return this.readLog(agentId).slice(-limit).reverse();
	}
```

In `src/routes/api/agents/[id]/decisions/+server.ts`, add (import `assertInFleet` from `#lib/server/modules/fleet/record-decision`):

```ts
const DEFAULT_FEED_LIMIT = 10;
const MAX_FEED_LIMIT = 50;

/** The agent's newest log entries, newest first, for the page's decision feed. */
export const GET: RequestHandler = async ({ params, url }) => {
	try {
		const runtime = await getFleetRuntime();
		assertInFleet(runtime, params.id!);
		return json({ entries: runtime.fleet.recentDecisions(params.id!, feedLimit(url.searchParams.get('limit'))) });
	} catch (error) {
		return fleetErrorResponse(error, `decisions of agent ${params.id}`);
	}
};

function feedLimit(raw: string | null): number {
	const limit = Number(raw);
	return Number.isInteger(limit) && limit > 0 ? Math.min(limit, MAX_FEED_LIMIT) : DEFAULT_FEED_LIMIT;
}
```

- [ ] **Step 4: Run the tests**

Run: `~/.bun/bin/bun test src agents`
Expected: PASS, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/modules/fleet src/routes/api/agents
git commit -m "api: GET /api/agents/<id>/decisions - ostatnie decyzje agenta dla GUI"
```

---

### Task 5: Server — verdicts in the observability log, the approval route and the view model

**Files:**
- Create: `src/lib/server/modules/solana-blink/action-history.ts`
- Modify: `src/lib/server/modules/solana-blink/blink.service.ts`
- Create: `src/routes/api/agents/[id]/approval/+server.ts`
- Test: `src/lib/server/modules/solana-blink/action-history.test.ts` (create)

**Interfaces:**
- Consumes: `recordVerdict`, `parseVerdict`, `proposalAwaiting`, `Verdict` (Tasks 1–2), `shockStore`, `getFleetRuntime` (Task 3).
- Produces:
  - `type HistoryDecision = 'approve' | 'pause' | 'resume' | 'accept' | 'reject' | 'system'`; `interface ActionHistoryEntry`; `interface HistoryEvent`; `class ActionHistory { record(event: HistoryEvent): void; recent(limit: number, agentId?: string): ActionHistoryEntry[] }`; `memoText(agentId: string, decision: HistoryDecision, root: string): string`.
  - `AgentStatusRecord.status` gains `'AWAITING_APPROVAL'`; `AgentStatusRecord.fleet?: FleetDetails` with `FleetDetails = { pendingProposal: { counter: number; summary: string; decision: Record<string, unknown> } | null; shockArmed: boolean; lastDecisionKind: string | null }`.
  - `blinkService.decideProposal(agentId: string, verdict: Verdict): Promise<{ counter: number }>`.
  - `POST /api/agents/<id>/approval`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/server/modules/solana-blink/action-history.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';
import { ActionHistory, memoText, type HistoryEvent } from './action-history';

const ROOT = 'ab'.repeat(32);
const event = (decision: HistoryEvent['decision'], agentId = 'sentinel-01', timestamp = 1): HistoryEvent => ({
	agentId,
	agentName: 'Sentinel',
	decision,
	userAccount: 'ftbM1111111111111111111111111111111111111xyz',
	newRoot: ROOT,
	newStatus: 'ACTIVE',
	timestamp
});

describe('ActionHistory', () => {
	test('records an event with a short operator and its memo', () => {
		const history = new ActionHistory();
		history.record(event('accept'));
		expect(history.recent(10)).toEqual([
			{
				id: 'hist-1',
				agentId: 'sentinel-01',
				agentName: 'Sentinel',
				decision: 'accept',
				operator: 'ftbM...xyz',
				newRoot: ROOT,
				newStatus: 'ACTIVE',
				timestamp: 1,
				memoHash: `AEGIS_PQC_DMS:sentinel-01:ACCEPT:${ROOT.slice(0, 16)}`
			}
		]);
	});

	test('lists the newest first, at most the limit, optionally of one agent', () => {
		const history = new ActionHistory();
		history.record(event('pause', 'sentinel-01', 1));
		history.record(event('resume', 'tick-01', 2));
		history.record(event('reject', 'sentinel-01', 3));
		expect(history.recent(2).map((entry) => entry.decision)).toEqual(['reject', 'resume']);
		expect(history.recent(10, 'sentinel-01').map((entry) => entry.decision)).toEqual(['reject', 'pause']);
	});

	test('gives every entry its own id, even at the same time', () => {
		const history = new ActionHistory();
		history.record(event('accept'));
		history.record(event('reject'));
		expect(history.recent(10).map((entry) => entry.id)).toEqual(['hist-2', 'hist-1']);
	});
});

test('memoText names the agent, the decision and the root prefix', () => {
	expect(memoText('tick-01', 'resume', ROOT)).toBe(`AEGIS_PQC_DMS:tick-01:RESUME:${ROOT.slice(0, 16)}`);
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `~/.bun/bin/bun test src/lib/server/modules/solana-blink`
Expected: FAIL — `Cannot find module './action-history'`.

- [ ] **Step 3: Implement the history**

Create `src/lib/server/modules/solana-blink/action-history.ts`:

```ts
// The page's observability log: what people did to agents (approve and kill on the mocks; kill, resume and verdicts
// on fleet agents). Kept in memory.

export type HistoryDecision = 'approve' | 'pause' | 'resume' | 'accept' | 'reject' | 'system';

export interface ActionHistoryEntry {
  id: string;
  agentId: string;
  agentName: string;
  decision: HistoryDecision;
  operator: string;
  newRoot: string;
  newStatus: string;
  timestamp: number;
  memoHash: string;
}

export interface HistoryEvent {
  agentId: string;
  agentName: string;
  decision: HistoryDecision;
  userAccount: string;
  newRoot: string;
  newStatus: string;
  timestamp: number;
}

export class ActionHistory {
  private readonly entries: ActionHistoryEntry[] = [];

  record({ userAccount, ...event }: HistoryEvent): void {
    this.entries.push({
      ...event,
      id: `hist-${this.entries.length + 1}`,
      operator: shortAddress(userAccount),
      memoHash: memoText(event.agentId, event.decision, event.newRoot)
    });
  }

  /** The newest entries first, at most `limit`, optionally of one agent. */
  recent(limit: number, agentId?: string): ActionHistoryEntry[] {
    const entries = agentId ? this.entries.filter((entry) => entry.agentId === agentId) : this.entries;
    return entries.slice(-limit).reverse();
  }
}

export function memoText(agentId: string, decision: HistoryDecision, root: string): string {
  return `AEGIS_PQC_DMS:${agentId}:${decision.toUpperCase()}:${root.slice(0, 16)}`;
}

function shortAddress(address: string): string {
  return `${address.slice(0, 4)}...${address.slice(-3)}`;
}
```

- [ ] **Step 4: Run the tests**

Run: `~/.bun/bin/bun test src/lib/server/modules/solana-blink`
Expected: PASS.

- [ ] **Step 5: Wire the history, the verdict and the view model into `blink.service.ts`**

Edit `src/lib/server/modules/solana-blink/blink.service.ts`:

1. Imports — replace the `guard`, `app-runtime` and `submit-decision` imports and add the new ones:

```ts
import { NO_DECISION, type GuardStatus } from '../agent-guard/guard';
import { proposalAwaiting, recordVerdict, type Verdict } from '../fleet/approval';
import { findFleetRuntime, getFleetRuntime, shockStore } from '../fleet/app-runtime';
import type { FleetEntry } from '../fleet/fleet';
import type { FleetRuntime } from '../fleet/submit-decision';
import { ActionHistory, memoText, type ActionHistoryEntry } from './action-history';
```

2. `AgentStatusRecord` — add the status and the fleet details; delete the local `ActionHistoryEntry` interface (now imported) and re-export it for existing importers with `export type { ActionHistoryEntry };`:

```ts
export interface AgentStatusRecord {
  id: string;
  name: string;
  /**
   * UNAVAILABLE: a fleet agent whose guard account could not be read (e.g. the Solana RPC failed).
   * AWAITING_APPROVAL: a fleet agent stopped on its own proposal until the owner's verdict.
   */
  status: 'ACTIVE' | 'PAUSED' | 'IDLE' | 'UNAVAILABLE' | 'AWAITING_APPROVAL';
  currentTask: string;
  pqcPubkeyHash: string;
  lastCommitmentRoot: string;
  lastUpdated: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  actionsExecuted: number;
  /** Only on fleet agents. */
  fleet?: FleetDetails;
}

export interface FleetDetails {
  pendingProposal: { counter: number; summary: string; decision: Record<string, unknown> } | null;
  shockArmed: boolean;
  /** The kind of the agent's newest logged decision (e.g. "sentinel"); null before its first. */
  lastDecisionKind: string | null;
}
```

3. Replace `const actionHistory: ActionHistoryEntry[] = [];` with `const actionHistory = new ActionHistory();` and the body of `_seedHistory` with:

```ts
const _seedHistory = () => {
  actionHistory.record({
    agentId: 'arbiter-02',
    agentName: 'Arbiter Beta — DeFi Optimizer',
    decision: 'approve',
    userAccount: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
    newRoot: genRoot({ seed: 'h1' }),
    newStatus: 'ACTIVE',
    timestamp: Date.now() - 600_000
  });
};
```

4. Replace `CARD_STATUS_BY_GUARD_STATUS` with:

```ts
/** A killed agent shows as PAUSED even with a proposal waiting; the proposal shows again after resume. */
function cardStatus(guardStatus: GuardStatus, awaitingApproval: boolean): AgentStatusRecord['status'] {
  if (guardStatus === 'Killed') return 'PAUSED';
  return awaitingApproval ? 'AWAITING_APPROVAL' : 'ACTIVE';
}
```

5. Replace `toAgentStatusRecord` with:

```ts
/** One unreadable agent shows as UNAVAILABLE instead of failing the whole list. */
async function toAgentStatusRecord(runtime: FleetRuntime, entry: FleetEntry): Promise<AgentStatusRecord> {
  const last = runtime.fleet.lastDecision(entry.id);
  const card = {
    id: entry.id,
    name: entry.name,
    currentTask: last?.record.summary ?? NO_DECISION_YET,
    pqcPubkeyHash: NO_PQC_KEY,
    lastUpdated: last ? Date.parse(last.record.observedAt) : entry.registeredAt,
    riskLevel: entry.riskLevel
  };
  const fleet = { shockArmed: shockStore.isArmed(entry.id), lastDecisionKind: last?.record.kind ?? null };
  try {
    const account = await runtime.guard.readAgent(entry.id);
    const proposal = proposalAwaiting(runtime.fleet, entry.id, account);
    const pendingProposal = proposal && {
      counter: proposal.record.counter,
      summary: proposal.record.summary,
      decision: proposal.record.decision
    };
    return {
      ...card,
      status: cardStatus(account.status, proposal !== null),
      lastCommitmentRoot: account.lastDecision,
      actionsExecuted: account.counter,
      fleet: { ...fleet, pendingProposal }
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return {
      ...card,
      status: 'UNAVAILABLE',
      currentTask: `Niedostępny: ${reason}`,
      lastCommitmentRoot: NO_DECISION,
      actionsExecuted: 0,
      fleet: { ...fleet, pendingProposal: null }
    };
  }
}
```

6. Delete the local `memoText` function (now imported) and the local `recordHistory` function at the bottom.

7. `getActionHistory` becomes:

```ts
  getActionHistory(limit = 20, agentId?: string): ActionHistoryEntry[] {
    return actionHistory.recent(limit, agentId);
  }
```

8. In `applyGuardedDecision`, record the resume as `resume` and the status honestly:

```ts
    actionHistory.record({
      agentId,
      agentName: fleet.get(agentId)!.name,
      decision: decision === 'pause' ? 'pause' : 'resume',
      userAccount,
      newRoot: account.lastDecision,
      newStatus: cardStatus(account.status, proposalAwaiting(fleet, agentId, account) !== null),
      timestamp: Date.now()
    });
```

9. In `applyMockDecision`, replace `recordHistory({ … })` with `actionHistory.record({ … })` (same fields).

10. Add to the class, after `createDecisionTransaction`:

```ts
  /** The owner's verdict on a fleet agent's proposal: recorded on chain as the agent's next step and in the log. */
  async decideProposal(agentId: string, verdict: Verdict): Promise<{ counter: number }> {
    const runtime = await getFleetRuntime();
    const { record, decisionHash } = await recordVerdict(runtime, agentId, verdict);
    actionHistory.record({
      agentId,
      agentName: runtime.fleet.get(agentId)!.name,
      decision: verdict,
      userAccount: String(record.decision.decidedBy),
      newRoot: decisionHash,
      newStatus: 'ACTIVE',
      timestamp: Date.parse(record.observedAt)
    });
    return { counter: record.counter };
  }
```

Check that nothing else in the repo imports `ActionHistoryEntry` from a path that changed: `grep -rn "ActionHistoryEntry" src` — only `blink.service.ts` and `action-history.ts` (plus the re-export).

- [ ] **Step 6: The approval route**

Create `src/routes/api/agents/[id]/approval/+server.ts`:

```ts
import { json, type RequestHandler } from '@sveltejs/kit';
import { parseVerdict } from '#lib/server/modules/fleet/approval';
import { fleetErrorResponse } from '#lib/server/modules/fleet/http-errors';
import { blinkService } from '#lib/server/modules/solana-blink/blink.service';

const BAD_REQUEST = 400;

/** The owner's verdict on the agent's waiting proposal; 409 when none waits or the agent is killed. */
export const POST: RequestHandler = async ({ params, request }) => {
	const verdict = parseVerdict(await request.json().catch(() => null));
	if (!verdict) {
		return json({ error: 'BadRequest', message: 'expected { verdict: "accept" | "reject" }' }, { status: BAD_REQUEST });
	}
	try {
		return json(await blinkService.decideProposal(params.id!, verdict));
	} catch (error) {
		return fleetErrorResponse(error, `verdict for agent ${params.id}`);
	}
};
```

- [ ] **Step 7: Verify**

Run: `~/.bun/bin/bun test src agents` — expected PASS, 0 fail.
Run: `~/.bun/bin/bun run check 2>&1 | grep -E 'action-history|approval/\+server|blink.service' ` — expected: only the three `blink.service.ts` errors already in the baseline (`LinkedAction` `type` ×2, `createPostResponse` fields), nothing new.
With the dev server running (`http://localhost:5173`): `curl -s http://localhost:5173/api/agents | grep -o '"status":"[A-Z_]*"'` — four statuses, and `curl -s http://localhost:5173/api/agents | grep -o '"fleet":{[^}]*' | head -2` shows `pendingProposal`/`shockArmed`/`lastDecisionKind` for the two fleet agents. `curl -s -X POST -H 'content-type: application/json' -d '{"verdict":"accept"}' http://localhost:5173/api/agents/sentinel-01/approval` → 409 `NoPendingProposal`.

- [ ] **Step 8: Commit**

```bash
git add src/lib/server/modules/solana-blink src/routes/api/agents
git commit -m "gui/api: werdykty w logu obserwowalnosci, POST /api/agents/<id>/approval, status AWAITING_APPROVAL"
```

---

### Task 6: Agents — the client: approval flag, waiting refusal, shock claim

**Files:**
- Modify: `agents/shared/runtime-client.ts`
- Test: `agents/shared/runtime-client.test.ts`

**Interfaces:**
- Produces: `Submission.requiresApproval?: true` (so `RecordedDecision.requiresApproval?: true`); `SubmitOutcome` gains `{ kind: 'awaiting' }`; `type ShockOutcome = { kind: 'none' } | { kind: 'armed'; pct: number } | { kind: 'failed'; reason: string }`; `RuntimeClient.claimShock(): Promise<ShockOutcome>`; `describeSubmitOutcome({ kind: 'awaiting' })` → `'refused: waiting for approval'`.

- [ ] **Step 1: Write the failing tests**

Append to the `submit` describe in `agents/shared/runtime-client.test.ts`:

```ts
	test('reports a refusal while a proposal waits as awaiting, not as a kill', async () => {
		const { fetchFn } = answering(409, { error: 'AwaitingApproval', message: 'waiting for a verdict' });
		expect(await createRuntimeClient('http://server', 'sentinel-01', fetchFn).submit(SUBMISSION)).toEqual({
			kind: 'awaiting'
		});
	});

	test('sends the approval flag with a proposal', async () => {
		const { fetchFn, requests } = answering(200, { counter: 2 });
		await createRuntimeClient('http://server', 'sentinel-01', fetchFn).submit({ ...SUBMISSION, requiresApproval: true });
		expect(JSON.parse(requests[0].init?.body as string).requiresApproval).toBe(true);
	});
```

Append a new describe:

```ts
describe('claimShock', () => {
	test('posts to the agent shock claim endpoint and reports an armed shock', async () => {
		const { fetchFn, requests } = answering(200, { shock: { pct: -3 } });
		expect(await createRuntimeClient('http://server', 'sentinel-01', fetchFn).claimShock()).toEqual({
			kind: 'armed',
			pct: -3
		});
		expect(requests[0].url).toBe('http://server/api/agents/sentinel-01/shock/claim');
		expect(requests[0].init?.method).toBe('POST');
	});

	test('reports none when nothing is armed', async () => {
		const { fetchFn } = answering(200, { shock: null });
		expect(await createRuntimeClient('http://server', 'sentinel-01', fetchFn).claimShock()).toEqual({ kind: 'none' });
	});

	test.each([
		['an error answer', 404, { error: 'AgentNotFound', message: 'not in the fleet' }],
		['an answer without a shock field', 200, {}],
		['a shock without a number', 200, { shock: { pct: '-3' } }]
	])('reports %s as failed', async (_, status, body) => {
		const { fetchFn } = answering(status, body);
		expect((await createRuntimeClient('http://server', 'sentinel-01', fetchFn).claimShock()).kind).toBe('failed');
	});

	test('reports an unreachable server as failed', async () => {
		expect((await createRuntimeClient('http://server', 'sentinel-01', unreachable).claimShock()).kind).toBe('failed');
	});
});
```

Extend the `describeSubmitOutcome` tests (find the existing describe for it; if none, add):

```ts
test('describes a refusal while waiting for approval', () => {
	expect(describeSubmitOutcome({ kind: 'awaiting' })).toBe('refused: waiting for approval');
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `~/.bun/bin/bun test agents/shared`
Expected: FAIL — `awaiting` reported as `paused`, `claimShock` is not a function.

- [ ] **Step 3: Implement**

In `agents/shared/runtime-client.ts`:

```ts
export interface Submission {
	kind: string;
	decision: Record<string, unknown>;
	summary: string;
	/** The agent stops after this decision until the owner accepts or rejects it. */
	requiresApproval?: true;
}

export type SubmitOutcome =
	| { kind: 'recorded'; counter: number }
	| { kind: 'paused' }
	| { kind: 'awaiting' }
	| { kind: 'failed'; reason: string };

/** A one-off simulated price shock the demo armed for this agent. */
export type ShockOutcome = { kind: 'none' } | { kind: 'armed'; pct: number } | { kind: 'failed'; reason: string };
```

Add to `RuntimeClient`:

```ts
	/** Claims the shock armed for this agent's next cycle, which disarms it. */
	claimShock(): Promise<ShockOutcome>;
```

Replace the conflict comment and add the code:

```ts
/** The server answers 409 when the owner killed the agent or its proposal waits for the owner's verdict. */
const HTTP_CONFLICT = 409;
const AWAITING_APPROVAL = 'AwaitingApproval';
```

In `createRuntimeClient`, build URLs from the agent's base:

```ts
	const agentUrl = `${apiUrl}/api/agents/${encodeURIComponent(agentId)}`;
	const decisionsUrl = `${agentUrl}/decisions`;
```

In `submit`, replace the conflict line:

```ts
			if (answer.response.status === HTTP_CONFLICT) {
				return answer.body.error === AWAITING_APPROVAL ? { kind: 'awaiting' } : { kind: 'paused' };
			}
```

Add the method after `latest`:

```ts
		async claimShock() {
			const answer = await request(`${agentUrl}/shock/claim`, { method: 'POST' });
			if (answer.kind === 'unreachable') return { kind: 'failed', reason: answer.reason };
			if (!answer.response.ok) return { kind: 'failed', reason: httpFailure(answer) };
			const { shock } = answer.body;
			if (shock === null) return { kind: 'none' };
			if (typeof shock?.pct !== 'number') return { kind: 'failed', reason: 'unexpected answer: no shock in it' };
			return { kind: 'armed', pct: shock.pct };
		}
```

In `describeSubmitOutcome` add:

```ts
		case 'awaiting':
			return 'refused: waiting for approval';
```

Tick (`agents/tick/index.ts`) needs no change: it never sets `requiresApproval` and does not call `claimShock`.

- [ ] **Step 4: Run the tests**

Run: `~/.bun/bin/bun test src agents`
Expected: PASS, 0 fail. (`cycle.test.ts`'s fake client lacks `claimShock` until Task 8; Bun does not type-check and the cycle does not call it yet.)

- [ ] **Step 5: Commit**

```bash
git add agents/shared
git commit -m "agents: klient - flaga zatwierdzenia, odmowa podczas oczekiwania, odbior szoku ceny"
```

---

### Task 7: Sentinel — approval rule, shocked readings and continuing from a verdict

**Files:**
- Modify: `agents/sentinel/policy.ts`
- Create: `agents/sentinel/shock.ts`
- Modify: `agents/sentinel/previous.ts`
- Test: `agents/sentinel/policy.test.ts`, `agents/sentinel/shock.test.ts` (create), `agents/sentinel/previous.test.ts`

**Interfaces:**
- Consumes: `RecordedDecision` (Task 6).
- Produces: `Policy.approvalShare: number`; `PriceReading.simulatedShock?: { pct: number; realUsd: number }`; `SentinelDecision.approval?: 'required'`; `applyShock(reading: PriceReading, pct: number): PriceReading`; `APPROVAL_KIND = 'approval'` in `previous.ts`; `previousFrom` accepts verdict records.

- [ ] **Step 1: Write the failing tests**

In `agents/sentinel/policy.test.ts`, give the existing `POLICY` an approval share that never triggers, so the existing expectations stay as they are, and add a demo policy:

```ts
/** approvalShare 1: no trade is worth the whole treasury, so these decisions never need approval. */
const POLICY: Policy = { targetSolShare: 0.5, driftThreshold: 0.0002, scheduleMinutes: 15, approvalShare: 1 };
const DEMO_POLICY: Policy = { ...POLICY, approvalShare: 0.0025 };
```

Append (import `applyShock` from `./shock`):

```ts
describe('approval', () => {
	const previous = { after: BALANCED, lastRebalanceAt: T0 };
	const shocked = applyShock(price(109.43, minutesAfterT0(1)), -3);

	test('turns a rebalance worth more than the approval share into a proposal, with the portfolio as if approved', () => {
		const decision = decide(previous, shocked, DEMO_POLICY);
		expect(decision).toMatchObject({
			action: 'REBALANCE',
			reason: 'drift',
			approval: 'required',
			trade: { side: 'BUY', sol: 14.797625183, usdc: 1570.725 },
			after: { sol: 971.710720312, usdc: 103144.275 },
			lastRebalanceAt: minutesAfterT0(1)
		});
	});

	test('leaves a smaller rebalance without approval', () => {
		const decision = decide(previous, price(109.2, minutesAfterT0(1)), DEMO_POLICY);
		expect(decision.action).toBe('REBALANCE');
		expect(decision.trade?.usdc).toBe(110.045006);
		expect('approval' in decision).toBe(false);
	});

	test('never asks approval for a hold', () => {
		const decision = decide(previous, price(109.43, minutesAfterT0(1)), { ...POLICY, approvalShare: 0.000001 });
		expect(decision.action).toBe('HOLD');
		expect('approval' in decision).toBe(false);
	});

	test('summarizes a proposal made at a shocked price', () => {
		expect(summarize(decide(previous, shocked, DEMO_POLICY))).toBe(
			'PROPOSE (drift, needs approval): buy 14.798 SOL @ $106.15 (SOL 49.24% → 50.00%) [simulated shock -3%]'
		);
	});

	test('marks any decision made at a shocked price', () => {
		const smallShock = applyShock(price(109.43, minutesAfterT0(1)), -0.001);
		expect(summarize(decide(previous, smallShock, POLICY))).toEndWith(' [simulated shock -0.001%]');
	});
});
```

Create `agents/sentinel/shock.test.ts`:

```ts
import { expect, test } from 'bun:test';
import { applyShock } from './shock';

const READING = { usd: 109.43, source: 'jupiter-price-v3', observedAt: '2026-10-10T15:00:00.000Z' };

test('moves the price by the percent and keeps the real one', () => {
	expect(applyShock(READING, -3)).toEqual({
		usd: 109.43 * 0.97,
		source: 'jupiter-price-v3',
		observedAt: '2026-10-10T15:00:00.000Z',
		simulatedShock: { pct: -3, realUsd: 109.43 }
	});
});

test('moves it up for a positive percent', () => {
	expect(applyShock(READING, 10).usd).toBeCloseTo(120.373, 9);
});
```

In `agents/sentinel/previous.test.ts`, append:

```ts
describe('after a verdict', () => {
	const BEFORE = { sol: 956.913095129, usdc: 104715, solShare: 0.492386 };
	const PROPOSED = { sol: 971.710720312, usdc: 103144.275 };
	const PROPOSED_AT = '2026-10-10T14:01:00.000Z';
	const verdictRecord = (verdict: unknown, proposal: unknown) =>
		record('approval', { verdict, proposal, decidedBy: 'ftbM…' });
	const proposal = (decision: Record<string, unknown>, kind = 'sentinel') => ({
		counter: 2,
		decisionHash: 'ab'.repeat(32),
		kind,
		decision,
		summary: 'PROPOSE'
	});
	const PROPOSAL = proposal({ before: BEFORE, after: PROPOSED, lastRebalanceAt: PROPOSED_AT });

	test('continues from the traded portfolio after an accept', () => {
		expect(previousFrom(verdictRecord('accept', PROPOSAL))).toEqual({ after: PROPOSED, lastRebalanceAt: PROPOSED_AT });
	});

	test('continues from the portfolio before the proposal after a reject, restarting the schedule', () => {
		expect(previousFrom(verdictRecord('reject', PROPOSAL))).toEqual({
			after: { sol: BEFORE.sol, usdc: BEFORE.usdc },
			lastRebalanceAt: PROPOSED_AT
		});
	});

	test.each([
		['an unknown verdict', verdictRecord('maybe', PROPOSAL), 'malformed'],
		['a missing proposal', verdictRecord('accept', undefined), 'malformed'],
		['a proposal of another agent kind', verdictRecord('accept', proposal({ after: PROPOSED, lastRebalanceAt: null }, 'tick')), 'not a sentinel decision'],
		['a rejected proposal without a sound portfolio before it', verdictRecord('reject', proposal({ after: PROPOSED, lastRebalanceAt: PROPOSED_AT })), 'malformed']
	])('refuses %s', (_, verdict, message) => {
		expect(() => previousFrom(verdict)).toThrow(message);
	});
});
```

(Add `describe` to the `bun:test` import in `previous.test.ts`.)

- [ ] **Step 2: Run the tests to see them fail**

Run: `~/.bun/bin/bun test agents/sentinel`
Expected: FAIL — `Cannot find module './shock'`; verdict records refused as "not a sentinel decision".

- [ ] **Step 3: Implement**

Create `agents/sentinel/shock.ts`:

```ts
import type { PriceReading } from './policy';

const PERCENT = 100;

/** The reading at a simulated price, keeping the real one: the demo's way to force a large move on demand. */
export function applyShock(reading: PriceReading, pct: number): PriceReading {
	return { ...reading, usd: reading.usd * (1 + pct / PERCENT), simulatedShock: { pct, realUsd: reading.usd } };
}
```

In `agents/sentinel/policy.ts`:

Header comment, second sentence becomes: `Rebalances when the share drifts out of the band, or on schedule when the last rebalance is old enough; a rebalance worth more than the approval share of the treasury is a proposal that waits for the owner. Pure: no I/O, the decision time is the price's.`

```ts
export interface PriceReading {
	usd: number;
	source: string;
	observedAt: string;
	/** Set when the demo shocked the price: the shock and the real price. */
	simulatedShock?: { pct: number; realUsd: number };
}

export interface Policy {
	targetSolShare: number;
	/** How far the SOL share may drift from the target, as a share (0.0002 = 0.02 percentage points). */
	driftThreshold: number;
	scheduleMinutes: number;
	/** A rebalance worth more than this share of the treasury waits for the owner's approval (0.0025 = 0.25%). */
	approvalShare: number;
}

export type SentinelDecision = {
	action: 'REBALANCE' | 'HOLD';
	reason?: 'drift' | 'schedule';
	/** Set on a proposal: `after` is the portfolio if the owner accepts it. */
	approval?: 'required';
	price: PriceReading;
	policy: Policy;
	before: Portfolio & { solShare: number };
	trade?: Trade;
	after: Portfolio;
	lastRebalanceAt: string | null;
};
```

In `decide`, replace the final `return { action: 'REBALANCE', … }` with:

```ts
	const approval = needsApproval(trade, before, price.usd, policy) ? { approval: 'required' as const } : {};
	return {
		action: 'REBALANCE',
		reason,
		...approval,
		...inputs,
		trade,
		after: applyTrade(before, trade),
		lastRebalanceAt: price.observedAt
	};
```

Replace `summarize` with:

```ts
export function summarize(decision: SentinelDecision): string {
	return actionLine(decision) + shockNote(decision.price);
}

function actionLine(decision: SentinelDecision): string {
	const at = `@ $${decision.price.usd.toFixed(2)}`;
	const share = percent(decision.before.solShare);
	if (decision.action === 'HOLD' || !decision.trade) {
		return `HOLD ${at} (SOL ${share}, band ±${(decision.policy.driftThreshold * PERCENT).toFixed(2)} pp)`;
	}
	const { side, sol } = decision.trade;
	const afterShare = percent(solShareOf(decision.after, decision.price.usd));
	const label = decision.approval ? `PROPOSE (${decision.reason}, needs approval)` : `REBALANCE (${decision.reason})`;
	return `${label}: ${side.toLowerCase()} ${sol.toFixed(3)} SOL ${at} (SOL ${share} → ${afterShare})`;
}

function shockNote({ simulatedShock }: PriceReading): string {
	return simulatedShock ? ` [simulated shock ${simulatedShock.pct}%]` : '';
}

function needsApproval({ usdc }: Trade, portfolio: Portfolio, usd: number, policy: Policy): boolean {
	return usdc > policy.approvalShare * totalValue(portfolio, usd);
}
```

Replace `agents/sentinel/previous.ts` with:

```ts
import type { RecordedDecision } from '../shared/runtime-client';
import type { Portfolio, Previous } from './policy';

export const SENTINEL_KIND = 'sentinel';
/** The server records the owner's verdict on a proposal under this kind. */
export const APPROVAL_KIND = 'approval';

/**
 * What Sentinel continues from, read from its last recorded decision: a Sentinel decision, or the owner's verdict on
 * its proposal (accepted: the trade is applied; rejected: the portfolio before it, with the schedule restarted).
 * Throws on anything else, so the agent skips the cycle instead of resetting the treasury.
 */
export function previousFrom(record: RecordedDecision): Previous {
	if (record.kind !== APPROVAL_KIND) return fromSentinelDecision(record.kind, record.decision);
	const { verdict, proposal } = record.decision;
	if (verdict !== 'accept' && verdict !== 'reject') throw new Error(`malformed verdict: ${JSON.stringify(verdict)}`);
	if (!isObject(proposal) || !isObject(proposal.decision)) throw new Error('malformed verdict: no proposal in it');
	const proposed = fromSentinelDecision(proposal.kind, proposal.decision);
	if (verdict === 'accept') return proposed;
	return { after: portfolioOf(proposal.decision.before), lastRebalanceAt: proposed.lastRebalanceAt };
}

function fromSentinelDecision(kind: unknown, decision: Record<string, unknown>): Previous {
	if (kind !== SENTINEL_KIND) throw new Error(`the last decision is not a sentinel decision (${kind})`);
	const { after, lastRebalanceAt } = decision;
	const portfolio = portfolioOf(after);
	if (!isTimeOrNull(lastRebalanceAt)) {
		throw new Error(`malformed decision: bad lastRebalanceAt ${JSON.stringify(lastRebalanceAt)}`);
	}
	return { after: portfolio, lastRebalanceAt };
}

function portfolioOf(value: unknown): Portfolio {
	if (!isObject(value) || !isAmount(value.sol) || !isAmount(value.usdc)) {
		throw new Error(`malformed decision: bad portfolio ${JSON.stringify(value)}`);
	}
	return { sol: value.sol, usdc: value.usdc };
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function isAmount(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isTimeOrNull(value: unknown): value is string | null {
	return value === null || (typeof value === 'string' && !Number.isNaN(Date.parse(value)));
}
```

- [ ] **Step 4: Run the tests**

Run: `~/.bun/bin/bun test agents/sentinel`
Expected: `policy`, `shock`, `previous` PASS. `cycle.test.ts` and `config.test.ts` still pass at runtime (their `Policy` literals lack `approvalShare`; `decide` then compares with `undefined` → no approval) — fixed in Task 8.

- [ ] **Step 5: Commit**

```bash
git add agents/sentinel
git commit -m "sentinel: propozycja powyzej progu zatwierdzenia, symulowany szok w odczycie ceny, kontynuacja po werdykcie"
```

---

### Task 8: Sentinel — the cycle, configuration, process and README

**Files:**
- Modify: `agents/sentinel/cycle.ts`, `agents/sentinel/config.ts`, `agents/sentinel/index.ts`, `agents/sentinel/README.md`
- Test: `agents/sentinel/cycle.test.ts`, `agents/sentinel/config.test.ts`

**Interfaces:**
- Consumes: `RuntimeClient.claimShock`, `ShockOutcome`, `SubmitOutcome.awaiting` (Task 6); `applyShock`, `Policy.approvalShare`, `SentinelDecision.approval`, verdict-aware `previousFrom` (Task 7).
- Produces: `runCycle` (same signature), `SentinelConfig.policy.approvalShare` from `SENTINEL_APPROVAL_PCT`.

- [ ] **Step 1: Write the failing tests**

In `agents/sentinel/cycle.test.ts`:

Update imports and constants:

```ts
import type {
	LatestOutcome,
	RecordedDecision,
	RuntimeClient,
	ShockOutcome,
	Submission,
	SubmitOutcome
} from '../shared/runtime-client';
```

```ts
/** approvalShare 1: never a proposal, so the original cycle tests keep their lines. */
const POLICY: Policy = { targetSolShare: 0.5, driftThreshold: 0.0002, scheduleMinutes: 15, approvalShare: 1 };
const DEMO_POLICY: Policy = { ...POLICY, approvalShare: 0.0025 };
```

Replace `clientWith` with a version that also answers the shock claim and counts calls:

```ts
function clientWith(
	latest: LatestOutcome,
	outcome: SubmitOutcome = { kind: 'recorded', counter: 5 },
	shock: ShockOutcome = { kind: 'none' }
) {
	const submitted: Submission[] = [];
	const calls = { claimShock: 0 };
	const client: RuntimeClient = {
		latest: async () => latest,
		submit: async (submission) => {
			submitted.push(submission);
			return outcome;
		},
		claimShock: async () => {
			calls.claimShock += 1;
			return shock;
		}
	};
	return { client, submitted, calls };
}
```

Append:

```ts
const balanced = () => ({ kind: 'found' as const, record: sentinelRecord({ after: AFTER, lastRebalanceAt: PRICE.observedAt }) });

test('waits while its proposal waits for a verdict: no shock claim, no price, no submission', async () => {
	const pending = { kind: 'found' as const, record: { ...sentinelRecord({}), requiresApproval: true as const } };
	const { client, submitted, calls } = clientWith(pending);
	let priceFetched = false;
	const fetchPrice = async () => {
		priceFetched = true;
		return PRICE;
	};
	expect(await runCycle({ client, fetchPrice, policy: DEMO_POLICY })).toBe('waiting for approval (#4)');
	expect(submitted).toEqual([]);
	expect(calls.claimShock).toBe(0);
	expect(priceFetched).toBe(false);
});

test('decides at the shocked price, keeping the real one, and submits a proposal when the trade is large', async () => {
	const { client, submitted } = clientWith(balanced(), undefined, { kind: 'armed', pct: -3 });
	const line = await runCycle({ client, fetchPrice: priceOf(PRICE), policy: DEMO_POLICY });
	expect(submitted[0].requiresApproval).toBe(true);
	expect(submitted[0].decision).toMatchObject({
		approval: 'required',
		price: { usd: 109.43 * 0.97, simulatedShock: { pct: -3, realUsd: 109.43 } }
	});
	expect(line).toBe(
		'PROPOSE (drift, needs approval): buy 14.798 SOL @ $106.15 (SOL 49.24% → 50.00%) [simulated shock -3%] → recorded #5'
	);
});

test('submits an ordinary decision without the approval flag', async () => {
	const { client, submitted } = clientWith(balanced());
	await runCycle({ client, fetchPrice: priceOf(PRICE), policy: DEMO_POLICY });
	expect('requiresApproval' in submitted[0]).toBe(false);
});

test('goes on at the real price when the shock claim fails, noting it', async () => {
	const { client, submitted } = clientWith(balanced(), undefined, { kind: 'failed', reason: 'HTTP 502: down' });
	const line = await runCycle({ client, fetchPrice: priceOf(PRICE), policy: DEMO_POLICY });
	expect(submitted[0].decision).toMatchObject({ action: 'HOLD', price: PRICE });
	expect(line).toEndWith('→ recorded #5 (shock claim failed: HTTP 502: down)');
});

test('continues from the traded portfolio after an accepted proposal', async () => {
	const proposed = { sol: 971.710720312, usdc: 103144.275 };
	const verdict: RecordedDecision = {
		...sentinelRecord({}),
		kind: 'approval',
		decision: {
			verdict: 'accept',
			proposal: { kind: 'sentinel', decision: { before: AFTER, after: proposed, lastRebalanceAt: PRICE.observedAt } },
			decidedBy: 'ftbM…'
		}
	};
	const { client, submitted } = clientWith({ kind: 'found', record: verdict });
	await runCycle({ client, fetchPrice: priceOf(PRICE), policy: DEMO_POLICY });
	expect(submitted[0].decision).toMatchObject({ before: proposed });
});

test('reports a decision refused while waiting for approval', async () => {
	const { client } = clientWith(balanced(), { kind: 'awaiting' });
	expect(await runCycle({ client, fetchPrice: priceOf(PRICE), policy: DEMO_POLICY })).toEndWith(
		'→ refused: waiting for approval'
	);
});
```

In `agents/sentinel/config.test.ts`, update the two `policy` expectations to include `approvalShare: 0.0025`, and add:

```ts
test('reads the approval threshold in percent of the treasury', () => {
	expect(loadSentinelConfig({ SENTINEL_APPROVAL_PCT: '1' }).policy.approvalShare).toBe(0.01);
});
```

and add `['SENTINEL_APPROVAL_PCT', 'abc']` to the refusal `test.each`. Update the first test's name to `…, a 15-minute schedule and approval above 0.25% of the treasury`.

- [ ] **Step 2: Run the tests to see them fail**

Run: `~/.bun/bin/bun test agents/sentinel`
Expected: FAIL — no `waiting for approval`, no shock applied, no `approvalShare` in config.

- [ ] **Step 3: Implement**

Replace `agents/sentinel/cycle.ts` with:

```ts
import { describeSubmitOutcome, type RuntimeClient, type Submission } from '../shared/runtime-client';
import { decide, summarize, type Policy, type Previous, type PriceReading } from './policy';
import { previousFrom, SENTINEL_KIND } from './previous';
import { applyShock } from './shock';

export interface CycleDeps {
	client: RuntimeClient;
	fetchPrice: () => Promise<PriceReading>;
	policy: Policy;
}

/**
 * One cycle: last recorded decision → price (shocked when the demo armed a shock) → policy → submit. While its
 * proposal waits for the owner's verdict it does nothing. Returns the line to log; never throws.
 */
export async function runCycle({ client, fetchPrice, policy }: CycleDeps): Promise<string> {
	const latest = await client.latest();
	if (latest.kind === 'failed') return `skipped: last decision unavailable (${latest.reason})`;
	if (latest.kind === 'found' && latest.record.requiresApproval) {
		return `waiting for approval (#${latest.record.counter})`;
	}
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
	const { reading, note } = await withShock(client, price);
	const decision = decide(previous, reading, policy);
	const summary = summarize(decision);
	const submission: Submission = { kind: SENTINEL_KIND, decision, summary };
	const outcome = await client.submit(decision.approval ? { ...submission, requiresApproval: true } : submission);
	return `${summary} → ${describeSubmitOutcome(outcome)}${note}`;
}

/** Applies the shock armed for this cycle, if any; a failed claim keeps the real price and is noted in the log line. */
async function withShock(client: RuntimeClient, price: PriceReading): Promise<{ reading: PriceReading; note: string }> {
	const shock = await client.claimShock();
	if (shock.kind === 'armed') return { reading: applyShock(price, shock.pct), note: '' };
	return { reading: price, note: shock.kind === 'failed' ? ` (shock claim failed: ${shock.reason})` : '' };
}

function messageOf(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
```

In `agents/sentinel/config.ts` add:

```ts
/** A rebalance worth more than 0.25% of the treasury (~$520 today) waits for the owner; a quiet day's trades are ≤ 0.03%. */
const DEFAULT_APPROVAL_PCT = 0.25;
const PERCENT = 100;
```

and in `policy`:

```ts
			scheduleMinutes: positiveNumber(env, 'SENTINEL_SCHEDULE_MIN', DEFAULT_SCHEDULE_MINUTES),
			approvalShare: positiveNumber(env, 'SENTINEL_APPROVAL_PCT', DEFAULT_APPROVAL_PCT) / PERCENT
```

In `agents/sentinel/index.ts`, the startup line:

```ts
const { targetSolShare, driftThreshold, scheduleMinutes, approvalShare } = config.policy;
console.log(
	`Sentinel (${config.agentId}) → ${config.apiUrl}, every ${config.intervalMs} ms; target SOL ${targetSolShare}, ` +
		`band ±${driftThreshold}, schedule ${scheduleMinutes} min, approval above ${approvalShare * 100}% of the ` +
		`treasury; Ctrl+C stops`
);
```

and update its header comment's first sentence to: `// Sentinel: rebalances a virtual SOL/USDC treasury from the live Jupiter SOL price and asks the owner to approve large trades. It runs`.

In `agents/sentinel/README.md`:

- Add the row `| \`SENTINEL_APPROVAL_PCT\` | \`0.25\` (a rebalance worth more than this % of the treasury waits for approval) |` to the table.
- Add a section after the table:

```md
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
```

- Design line at the top: append `Approvals and the shock: docs/superpowers/specs/2026-10-10-sentinel-approval-design.md.`

- [ ] **Step 4: Run the tests**

Run: `~/.bun/bin/bun test src agents`
Expected: PASS, 0 fail. Then `SENTINEL_APPROVAL_PCT=abc ~/.bun/bin/bun agents/sentinel` → exits 1 with `SENTINEL_APPROVAL_PCT must be a positive number, got "abc"`.

- [ ] **Step 5: Commit**

```bash
git add agents/sentinel
git commit -m "sentinel: czekanie na werdykt, szok ceny w cyklu, SENTINEL_APPROVAL_PCT i README"
```

---

### Task 9: Page — the feed's rows (pure)

**Files:**
- Create: `src/lib/fleet-feed.ts`
- Test: `src/lib/fleet-feed.test.ts`

**Interfaces:**
- Produces: `type Chip = 'HOLD' | 'REBALANCE' | 'AWAITING_APPROVAL' | 'PROPOSAL' | 'APPROVED' | 'REJECTED' | 'DECISION'`; `interface FeedEntry`; `interface FeedRow`; `interface TradeDetails`; `toFeedRow(entry: FeedEntry, pendingCounter: number | null): FeedRow`; `acceptsShock(lastDecisionKind: string | null): boolean`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/fleet-feed.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';
import { acceptsShock, toFeedRow, type FeedEntry } from './fleet-feed';

const AT = '2026-10-10T15:00:00.000Z';
const BEFORE = { sol: 956.913095129, usdc: 104715, solShare: 0.492386 };
const PROPOSED = { sol: 971.710720312, usdc: 103144.275 };
const TRADE = { side: 'BUY', sol: 14.797625183, usdc: 1570.725 };
const SHOCKED_PRICE = { usd: 106.1471, source: 'jupiter-price-v3', observedAt: AT, simulatedShock: { pct: -3, realUsd: 109.43 } };
const PROPOSAL_DECISION = { action: 'REBALANCE', reason: 'drift', approval: 'required', price: SHOCKED_PRICE, before: BEFORE, trade: TRADE, after: PROPOSED };

const entry = (counter: number, kind: string, decision: Record<string, unknown>, extra: object = {}): FeedEntry => ({
	record: { counter, kind, decision, summary: `summary #${counter}`, observedAt: AT, ...extra },
	decisionHash: 'ab'.repeat(32)
});

describe('toFeedRow', () => {
	test('a hold: grey chip, price and share, no trade', () => {
		const hold = entry(3, 'sentinel', { action: 'HOLD', price: { usd: 109.7 }, before: { ...PROPOSED, solShare: 0.4999 }, after: PROPOSED });
		expect(toFeedRow(hold, null)).toMatchObject({
			counter: 3,
			chip: 'HOLD',
			summary: 'summary #3',
			unconfirmed: false,
			details: { priceUsd: 109.7, shockPct: null, solShareBefore: 0.4999, trade: null }
		});
	});

	test('the waiting proposal: amber chip, its trade, the shock and the share after', () => {
		const row = toFeedRow(entry(7, 'sentinel', PROPOSAL_DECISION, { requiresApproval: true }), 7);
		expect(row.chip).toBe('AWAITING_APPROVAL');
		expect(row.details).toMatchObject({ priceUsd: 106.1471, shockPct: -3, trade: { side: 'BUY', sol: 14.797625183, usdc: 1570.725 } });
		expect(row.details!.solShareAfter).toBeCloseTo(0.5, 6);
	});

	test('a proposal already decided is just a proposal', () => {
		expect(toFeedRow(entry(7, 'sentinel', PROPOSAL_DECISION, { requiresApproval: true }), null).chip).toBe('PROPOSAL');
	});

	test.each([
		['accept', 'APPROVED'],
		['reject', 'REJECTED']
	])('a verdict %s shows as %s with the proposal trade', (verdict, chip) => {
		const row = toFeedRow(entry(8, 'approval', { verdict, proposal: { kind: 'sentinel', decision: PROPOSAL_DECISION } }), null);
		expect(row.chip).toBe(chip);
		expect(row.details?.trade?.usdc).toBe(1570.725);
	});

	test("Tick's decisions show their summary only", () => {
		const row = toFeedRow(entry(2, 'tick', { action: 'SELL', amountSol: 0.5 }), null);
		expect(row).toMatchObject({ chip: 'DECISION', summary: 'summary #2', details: null });
	});

	test('keeps the unconfirmed mark', () => {
		expect(toFeedRow({ ...entry(4, 'sentinel', { action: 'HOLD' }), unconfirmed: true }, null).unconfirmed).toBe(true);
	});

	test('a decision without a sound price or portfolio has no details', () => {
		const broken = entry(5, 'sentinel', { action: 'HOLD', price: { usd: '109' }, before: BEFORE, after: PROPOSED });
		expect(toFeedRow(broken, null).details).toBeNull();
	});
});

describe('acceptsShock', () => {
	test.each([
		['sentinel', true],
		['approval', true],
		['tick', false],
		[null, false]
	])('%p → %p', (kind, expected) => {
		expect(acceptsShock(kind)).toBe(expected);
	});
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `~/.bun/bin/bun test src/lib/fleet-feed.test.ts`
Expected: FAIL — `Cannot find module './fleet-feed'`.

- [ ] **Step 3: Implement**

Create `src/lib/fleet-feed.ts`:

```ts
// How the page shows a fleet agent's decisions: one row per log entry, read from the record's JSON. Records it cannot
// read as Sentinel's (e.g. Tick's) show their summary only.

export type Chip = 'HOLD' | 'REBALANCE' | 'AWAITING_APPROVAL' | 'PROPOSAL' | 'APPROVED' | 'REJECTED' | 'DECISION';

export interface FeedEntry {
	record: {
		counter: number;
		kind: string;
		decision: Record<string, unknown>;
		summary: string;
		observedAt: string;
		requiresApproval?: true;
	};
	decisionHash: string;
	unconfirmed?: true;
}

export interface TradeDetails {
	priceUsd: number;
	shockPct: number | null;
	solShareBefore: number;
	solShareAfter: number;
	trade: { side: string; sol: number; usdc: number } | null;
}

export interface FeedRow {
	counter: number;
	observedAt: string;
	chip: Chip;
	summary: string;
	unconfirmed: boolean;
	/** From the decision, or for a verdict from its proposal; null when the record has no price and portfolio. */
	details: TradeDetails | null;
}

const SHOCK_KINDS = new Set(['sentinel', 'approval']);

/** `pendingCounter`: the counter of the proposal waiting for a verdict, if any. */
export function toFeedRow(entry: FeedEntry, pendingCounter: number | null): FeedRow {
	const { record } = entry;
	return {
		counter: record.counter,
		observedAt: record.observedAt,
		chip: chipOf(record, pendingCounter),
		summary: record.summary,
		unconfirmed: entry.unconfirmed === true,
		details: tradeDetails(record.kind === 'approval' ? proposalDecision(record.decision) : record.decision)
	};
}

/** Only Sentinel reads the demo shock; the server cannot tell which program runs an agent. */
export function acceptsShock(lastDecisionKind: string | null): boolean {
	return lastDecisionKind !== null && SHOCK_KINDS.has(lastDecisionKind);
}

function chipOf(record: FeedEntry['record'], pendingCounter: number | null): Chip {
	if (record.kind === 'approval') return record.decision.verdict === 'accept' ? 'APPROVED' : 'REJECTED';
	if (record.requiresApproval) return record.counter === pendingCounter ? 'AWAITING_APPROVAL' : 'PROPOSAL';
	const { action } = record.decision;
	return action === 'HOLD' || action === 'REBALANCE' ? action : 'DECISION';
}

function proposalDecision(verdict: Record<string, unknown>): unknown {
	return isObject(verdict.proposal) ? verdict.proposal.decision : undefined;
}

function tradeDetails(decision: unknown): TradeDetails | null {
	if (!isObject(decision)) return null;
	const { price, before, after, trade } = decision;
	if (!isObject(price) || !isObject(before) || !isObject(after)) return null;
	const { usd } = price;
	const { solShare } = before;
	if (!isNumber(usd) || !isNumber(solShare) || !isNumber(after.sol) || !isNumber(after.usdc)) return null;
	const solValueAfter = after.sol * usd;
	return {
		priceUsd: usd,
		shockPct: isObject(price.simulatedShock) && isNumber(price.simulatedShock.pct) ? price.simulatedShock.pct : null,
		solShareBefore: solShare,
		solShareAfter: solValueAfter / (solValueAfter + after.usdc),
		trade: tradeOf(trade)
	};
}

function tradeOf(trade: unknown): TradeDetails['trade'] {
	if (!isObject(trade) || typeof trade.side !== 'string' || !isNumber(trade.sol) || !isNumber(trade.usdc)) return null;
	return { side: trade.side, sol: trade.sol, usdc: trade.usdc };
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function isNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value);
}
```

- [ ] **Step 4: Run the tests**

Run: `~/.bun/bin/bun test src agents`
Expected: PASS, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add src/lib/fleet-feed.ts src/lib/fleet-feed.test.ts
git commit -m "gui: wiersze listy decyzji agenta floty (czysta logika)"
```

---

### Task 10: Page — decision feed, approval panel, split HITL buttons, shock button, log chips

**Files:**
- Create: `src/lib/components/DecisionFeed.svelte`
- Modify: `src/routes/+page.svelte`

**Interfaces:**
- Consumes: `toFeedRow`, `acceptsShock`, `FeedEntry`, `Chip` (Task 9); `AgentStatusRecord.fleet`, status `AWAITING_APPROVAL` (Task 5); routes `GET …/decisions?limit=10`, `POST …/approval`, `POST …/shock` (Tasks 3–5); history decisions `resume`/`accept`/`reject` (Task 5).

- [ ] **Step 1: The feed component**

Create `src/lib/components/DecisionFeed.svelte`:

```svelte
<script lang="ts">
  import { Activity, AlertTriangle, Check, X } from 'lucide-svelte';
  import { toFeedRow, type Chip, type FeedEntry } from '$lib/fleet-feed';

  interface PendingProposal {
    counter: number;
    summary: string;
  }

  let {
    entries,
    pending,
    busy,
    onVerdict
  }: {
    entries: FeedEntry[];
    pending: PendingProposal | null;
    busy: boolean;
    onVerdict: (verdict: 'accept' | 'reject') => void;
  } = $props();

  const rows = $derived(entries.map((entry) => toFeedRow(entry, pending?.counter ?? null)));

  const CHIP_STYLES: Record<Chip, string> = {
    HOLD: 'text-slate-300 bg-slate-500/15 border-slate-500/30',
    REBALANCE: 'text-emerald-300 bg-emerald-500/15 border-emerald-500/30',
    AWAITING_APPROVAL: 'text-amber-300 bg-amber-500/15 border-amber-500/40',
    PROPOSAL: 'text-amber-200/70 border-amber-500/25',
    APPROVED: 'text-emerald-300 border-emerald-500/50',
    REJECTED: 'text-rose-300 border-rose-500/50',
    DECISION: 'text-sky-300 bg-sky-500/10 border-sky-500/30'
  };
  const CHIP_LABELS: Record<Chip, string> = {
    HOLD: 'HOLD',
    REBALANCE: 'REBALANCE',
    AWAITING_APPROVAL: 'AWAITING APPROVAL',
    PROPOSAL: 'PROPOSAL',
    APPROVED: 'APPROVED',
    REJECTED: 'REJECTED',
    DECISION: 'DECISION'
  };
  const PERCENT = 100;

  const percent = (share: number) => `${(share * PERCENT).toFixed(2)}%`;
  const clock = (iso: string) => new Date(iso).toLocaleTimeString('pl-PL', { timeZone: 'Europe/Warsaw' });
</script>

<div class="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-5 backdrop-blur-sm">
  <h3 class="text-[11px] font-semibold uppercase tracking-widest text-slate-500 mb-4 flex items-center gap-2">
    <Activity class="w-3.5 h-3.5 text-emerald-400" /> Decyzje agenta
    <span class="ml-auto text-slate-400 font-mono">{rows.length}</span>
  </h3>

  {#if pending}
    <div class="mb-4 p-4 rounded-xl border border-amber-500/40 bg-amber-950/30">
      <p class="text-[10px] font-bold uppercase tracking-wider text-amber-300 mb-1.5 flex items-center gap-1.5">
        <AlertTriangle class="w-3.5 h-3.5" /> Agent czeka na Twoją decyzję · krok #{pending.counter}
      </p>
      <p class="text-[12px] font-mono text-amber-100 mb-3 leading-relaxed">{pending.summary}</p>
      <div class="grid grid-cols-2 gap-3">
        <button
          onclick={() => onVerdict('accept')}
          disabled={busy}
          class="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-[12px] font-semibold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition"
        >
          <Check class="w-4 h-4" /> Zatwierdź
        </button>
        <button
          onclick={() => onVerdict('reject')}
          disabled={busy}
          class="px-4 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-rose-500/40 text-rose-200 text-[12px] font-semibold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition"
        >
          <X class="w-4 h-4" /> Odrzuć
        </button>
      </div>
    </div>
  {/if}

  <div class="space-y-2 max-h-[420px] overflow-y-auto pr-0.5">
    {#each rows as row (row.counter + row.chip)}
      <div class="p-3 rounded-xl bg-black/20 border border-white/[0.05]">
        <div class="flex items-center gap-2 mb-1.5">
          <span class="text-[10px] font-mono text-slate-500">{clock(row.observedAt)}</span>
          <span class="text-[10px] font-mono text-slate-500">#{row.counter}</span>
          <span class="px-1.5 py-0.5 rounded-md text-[9px] font-mono font-bold tracking-wider border {CHIP_STYLES[row.chip]}">
            {CHIP_LABELS[row.chip]}
          </span>
          {#if row.details?.shockPct != null}
            <span class="px-1.5 py-0.5 rounded-md text-[9px] font-mono border border-fuchsia-500/40 text-fuchsia-300">
              simulated shock {row.details.shockPct}%
            </span>
          {/if}
          {#if row.unconfirmed}
            <span class="px-1.5 py-0.5 rounded-md text-[9px] font-mono border border-slate-500/40 text-slate-400">unconfirmed</span>
          {/if}
        </div>
        {#if row.details}
          <div class="flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-mono text-slate-300">
            <span>${row.details.priceUsd.toFixed(2)}</span>
            <span>SOL {percent(row.details.solShareBefore)} → {percent(row.details.solShareAfter)}</span>
            {#if row.details.trade}
              <span class="text-white">
                {row.details.trade.side} {row.details.trade.sol.toFixed(3)} SOL (${row.details.trade.usdc.toFixed(0)})
              </span>
            {/if}
          </div>
        {:else}
          <p class="text-[11px] font-mono text-slate-300">{row.summary}</p>
        {/if}
      </div>
    {:else}
      <p class="text-[12px] text-slate-500 py-6 text-center">Brak decyzji: agent jeszcze nie działał</p>
    {/each}
  </div>
</div>
```

- [ ] **Step 2: Wire the page — script**

In `src/routes/+page.svelte` `<script>`:

Add imports:

```ts
  import DecisionFeed from '$lib/components/DecisionFeed.svelte';
  import { acceptsShock, type FeedEntry } from '$lib/fleet-feed';
```

Add `Play` to the `lucide-svelte` import list.

Add state and constants after `isLoadingHistory`:

```ts
  let feedEntries = $state<FeedEntry[]>([]);
  const FEED_LIMIT = 10;
  /** The demo shock the card's button arms, in percent of the price. */
  const SHOCK_PCT = -3;
```

Add `AWAITING_APPROVAL` to `statusColors`:

```ts
    AWAITING_APPROVAL: 'text-amber-300 bg-amber-500/15 border-amber-500/40',
```

Add after `refreshAll`'s refresh `$effect`:

```ts
  // The selected fleet agent's feed follows the page refresh, which replaces selectedAgent every 5 s.
  $effect(() => {
    if (selectedAgent?.fleet) loadFeed(selectedAgent.id);
    else feedEntries = [];
  });

  async function loadFeed(agentId: string) {
    try {
      const res = await fetch(`/api/agents/${agentId}/decisions?limit=${FEED_LIMIT}`);
      if (res.ok && selectedAgent?.id === agentId) feedEntries = (await res.json()).entries;
    } catch (e) {
      console.error('Błąd odczytu decyzji:', e);
    }
  }

  async function sendVerdict(verdict: 'accept' | 'reject') {
    if (!selectedAgent) return;
    const done = verdict === 'accept'
      ? 'Propozycja zatwierdzona: werdykt zapisany on-chain, agent wykona transakcję w następnym cyklu.'
      : 'Propozycja odrzucona: werdykt zapisany on-chain, portfel bez zmian.';
    await postAndReport(`/api/agents/${selectedAgent.id}/approval`, { verdict }, done);
  }

  async function armShock() {
    if (!selectedAgent) return;
    await postAndReport(
      `/api/agents/${selectedAgent.id}/shock`,
      { pct: SHOCK_PCT },
      'Szok ceny uzbrojony: agent użyje go w następnym cyklu.'
    );
  }

  async function postAndReport(url: string, body: object, successMessage: string) {
    isSimulating = true;
    simulationMessage = null;
    simulationSuccess = null;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const result = await res.json().catch(() => ({}));
      simulationSuccess = res.ok;
      simulationMessage = res.ok ? successMessage : `Odmowa (${res.status}): ${result.message ?? res.statusText}`;
      await refreshAll();
    } catch (err: any) {
      simulationSuccess = false;
      simulationMessage = `Błąd: ${err.message}`;
    } finally {
      isSimulating = false;
    }
  }
```

- [ ] **Step 3: Wire the page — markup**

a) **Shock button** — in the agent hero card, right after the closing `</div>` of the "PQC Pubkey Hash" block (still inside `<div class="relative">`):

```svelte
            {#if selectedAgent.fleet && acceptsShock(selectedAgent.fleet.lastDecisionKind)}
              <button
                onclick={armShock}
                disabled={isSimulating || selectedAgent.fleet.shockArmed}
                class="mt-3 w-full px-4 py-2.5 rounded-xl border border-fuchsia-500/40 bg-fuchsia-950/30 hover:bg-fuchsia-900/40 text-fuchsia-200 text-[12px] font-semibold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                <Play class="w-4 h-4" />
                {selectedAgent.fleet.shockArmed ? 'Szok uzbrojony — w następnym cyklu' : 'Symuluj szok ceny (−3%)'}
              </button>
            {/if}
```

b) **Feed** — between the hero card's closing `</div>` and `<!-- HITL Decision Console -->`:

```svelte
        {#if selectedAgent.fleet}
          <DecisionFeed
            entries={feedEntries}
            pending={selectedAgent.fleet.pendingProposal}
            busy={isSimulating}
            onVerdict={sendVerdict}
          />
        {/if}
```

c) **HITL console** — replace the description paragraph and the `<div class="grid grid-cols-2 gap-3 mb-4">…</div>` with:

```svelte
          {#if selectedAgent.fleet}
            <p class="text-[12px] text-slate-400 mb-4 leading-relaxed">
              Przy dużej transakcji agent sam się zatrzymuje i czeka na Twoją decyzję: zatwierdź lub odrzuć krok.
              Kill-Switch zatrzymuje go awaryjnie w każdej chwili. Każda decyzja trafia na Solana devnet.
            </p>
            <div class="grid grid-cols-2 gap-3 mb-4">
              <button
                onclick={() => sendVerdict('accept')}
                disabled={isSimulating || selectedAgent.status !== 'AWAITING_APPROVAL'}
                class="px-4 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white text-[12px] font-semibold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                <ShieldCheck class="w-4 h-4" /> Autoryzuj Krok
              </button>
              <button
                onclick={() => sendVerdict('reject')}
                disabled={isSimulating || selectedAgent.status !== 'AWAITING_APPROVAL'}
                class="px-4 py-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-amber-500/40 text-amber-200 text-[12px] font-semibold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                Odrzuć
              </button>
              {#if selectedAgent.status === 'PAUSED'}
                <button
                  onclick={() => simulateAction('approve')}
                  disabled={isSimulating}
                  class="col-span-2 px-4 py-3 rounded-xl bg-gradient-to-r from-sky-600 to-sky-500 hover:from-sky-500 hover:to-sky-400 text-white text-[12px] font-semibold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition"
                >
                  <Unlock class="w-4 h-4" /> Wznów agenta
                </button>
              {:else}
                <button
                  onclick={() => simulateAction('pause')}
                  disabled={isSimulating}
                  class="col-span-2 px-4 py-3 rounded-xl bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-500 hover:to-rose-400 text-white text-[12px] font-semibold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition"
                >
                  <ShieldAlert class="w-4 h-4" /> Kill-Switch 🛑
                </button>
              {/if}
            </div>
          {:else}
            <p class="text-[12px] text-slate-400 mb-4 leading-relaxed">
              Zatwierdź kolejny krok agenta lub aktywuj awaryjny Kill-Switch.
              Każda decyzja jest podpisana transakcją Solana z zaktualizowanym PQC State Rootem.
            </p>
            <!-- the existing two-button grid (Autoryzuj Krok / Kill-Switch 🛑), unchanged -->
          {/if}
```

Move the existing two-button `<div class="grid grid-cols-2 gap-3 mb-4">…</div>` verbatim into the `{:else}` branch in place of the comment line.

d) **Observability log chips** — in the right column, extend the chip `{#if}` chain:

```svelte
                  {:else if entry.decision === 'resume'}
                    <span class="w-2 h-2 rounded-full bg-sky-400 shadow-sm shadow-sky-400/50"></span>
                    <span class="text-[10px] font-bold text-sky-400 uppercase">RESUME</span>
                  {:else if entry.decision === 'accept'}
                    <span class="w-2 h-2 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/50"></span>
                    <span class="text-[10px] font-bold text-emerald-400 uppercase">APPROVED</span>
                  {:else if entry.decision === 'reject'}
                    <span class="w-2 h-2 rounded-full bg-amber-400 shadow-sm shadow-amber-400/50"></span>
                    <span class="text-[10px] font-bold text-amber-400 uppercase">REJECTED</span>
```

(insert before the `{:else}` SYSTEM branch), and make the status colour honest:

```svelte
                <span class="px-1 py-0.5 rounded text-[9px] font-mono uppercase {entry.newStatus === 'ACTIVE' ? 'text-emerald-400' : entry.newStatus === 'AWAITING_APPROVAL' ? 'text-amber-400' : 'text-rose-400'}">
```

- [ ] **Step 4: Verify**

Run: `~/.bun/bin/bun test src agents` — PASS, 0 fail.
Run: `~/.bun/bin/bun run check 2>&1 | grep -E 'DecisionFeed|fleet-feed|\+page.svelte'` — expected: no line for `DecisionFeed.svelte` or `fleet-feed.ts`; for `+page.svelte` only the 3 baseline errors (implicit `any` at the stats lines) and 3 baseline warnings (their line numbers may shift).
Run: `~/.bun/bin/bun run build 2>&1 | tail -3` — expected: build completes (`✓ built` / adapter output), no error.
Open http://localhost:5173, select Sentinel: the feed lists its recent HOLD/REBALANCE rows with times, prices and shares; the shock button is at the bottom of the card; the console shows Autoryzuj Krok and Odrzuć disabled and Kill-Switch 🛑.

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/DecisionFeed.svelte src/routes/+page.svelte
git commit -m "gui: lista decyzji agenta, panel zatwierdzenia, przyciski werdyktu i kill/wznow, przycisk szoku ceny"
```

---

### Task 11: Live on devnet

No code; verification against the running system. Requires the dev server on :5173 with this branch and **one** Sentinel process.

- [ ] **Step 1: One Sentinel at demo pace**

Ask the user to stop the Sentinel in their terminal (Ctrl+C). Then start it in the background from the repo root:

```bash
SENTINEL_SCHEDULE_MIN=2 SENTINEL_INTERVAL_MS=10000 ~/.bun/bin/bun agents/sentinel
```

Expected first lines: the startup line with `approval above 0.25% of the treasury`, then HOLD/REBALANCE lines `→ recorded #N`.

- [ ] **Step 2: Shock → proposal → accept**

```bash
curl -s -X POST -H 'content-type: application/json' -d '{"pct":-3}' http://localhost:5173/api/agents/sentinel-01/shock
```

Within ~15 s the agent logs `PROPOSE (drift, needs approval): buy … [simulated shock -3%] → recorded #P`, then `waiting for approval (#P)` every cycle. `curl -s http://localhost:5173/api/agents | grep -o '"status":"AWAITING_APPROVAL"'` matches. Then:

```bash
curl -s -X POST -H 'content-type: application/json' -d '{"verdict":"accept"}' http://localhost:5173/api/agents/sentinel-01/approval
```

→ `{"counter":P+1}`. The next cycle's `before` portfolio equals the proposal's `after` (check the last two lines of `.devnet/fleet/sentinel-01/decisions.jsonl`). `curl -s 'http://localhost:5173/api/actions/history?limit=1'` shows `"decision":"accept"`.

- [ ] **Step 3: Shock → proposal → reject**

Same shock; then `{"verdict":"reject"}`. The next decision's `before` equals the proposal's `before` (sol, usdc); history shows `"decision":"reject"`. A second `reject` → 409 `NoPendingProposal`.

- [ ] **Step 4: Kill while waiting**

Shock → proposal. Kill from the page (Kill-Switch 🛑) → card `PAUSED`; `{"verdict":"accept"}` → 409 `AgentKilled`. Resume from the page (Wznów agenta) → card `AWAITING_APPROVAL` again, history shows RESUME; accept → `{"counter":…}`.

- [ ] **Step 5: Chain and log agree**

```bash
AGENT_FILE=.devnet/agents/sentinel-01.json ~/.bun/bin/bun scripts/agent.ts status
tail -n 1 .devnet/fleet/sentinel-01/decisions.jsonl
```

Expected: `counter` and `lastDecision` equal the last line's `record.counter` and `decisionHash`.

- [ ] **Step 6: The user watches it on the page**

Hand over to the user for the same flow on http://localhost:5173 with the shock button and the approval panel. Leave Sentinel running at demo pace only with their agreement (it costs ~0.13 SOL a day); otherwise stop it and tell them to restart theirs.
