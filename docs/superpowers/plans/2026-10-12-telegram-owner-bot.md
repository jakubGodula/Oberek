# Telegram Owner Bot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The owner accepts or rejects proposals and kills or resumes agents from Telegram; the Blinks path goes away.

**Architecture:** The server gets a plain kill/resume endpoint (`POST /api/agents/<id>/control`) that the page and the bot
share; the Blink route, Memo transaction and `@solana/actions` are removed. The bot is its own process in `bot/telegram/`,
talking to the server over HTTP like the agents and to Telegram with `fetch` (no library): it polls the agent list,
pushes notices with inline buttons, and answers `/start` and `/agents`.

**Tech Stack:** Bun (runtime and `bun:test`), SvelteKit 3 + Svelte 5, TypeScript, Telegram Bot API (long polling).

**Spec:** `docs/superpowers/specs/2026-10-12-telegram-owner-bot-design.md`

## Global Constraints

- Branch `telegram_bot` (off `tick_speed`, PR #20). Commit messages in Polish without diacritics, like the history
  (`serwer: ...`, `bot: ...`); no `Co-Authored-By` or other attribution.
- Comments and user-facing text in English. Tabs in `src/lib/server/modules/fleet/**`, `agents/**` and `bot/**`;
  two spaces in `blink.service.ts`, `+page.svelte`, `+page.server.ts` (match the file).
- No `any` in new code.
- The bot imports nothing from `src/`: the contract is HTTP. It may import `agents/shared/loop.ts`.
- Env: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_OWNER_CHAT_ID`, `TELEGRAM_API_URL` (default `http://localhost:5173`). The server
  reads none of them.
- Telegram callback data is at most 64 bytes; format `<action>:<agentId>`, action ∈ `accept`, `reject`, `kill`,
  `resume`.
- Agent poll every 3 s; only fleet agents (`fleet` present in the card).
- Before the PR: `~/.bun/bin/bun run check` 0 errors, `~/.bun/bin/bun run lint` no errors and no new warnings in
  touched files, `~/.bun/bin/bun test src agents scripts bot` all green. (Plain `bun test` also runs the gitignored
  `spikes/.../upstream` and fails there.)

## Review Focus

- A network failure reaching Telegram must not print the bot token (it is in the URL): errors are redacted. → Task 3.
- A second proposal within one poll (status stays `AWAITING_APPROVAL`, counter changes) still gets its own message. →
  Task 6.
- A button press or command from any chat other than the owner's does nothing and sends nothing to the server. → Task 7.
- The server down while pressing a button or sending `/agents`: the owner gets "Server unreachable…" instead of silence. →
  Task 7.
- A failed agent poll keeps the last good list, so the next good poll does not resend old notices. → Task 7.

---

### Task 1: Kill/resume endpoint

**Files:**
- Create: `src/lib/server/modules/fleet/control.ts`
- Create: `src/lib/server/modules/fleet/control.test.ts`
- Create: `src/routes/api/agents/[id]/control/+server.ts`
- Modify: `src/lib/server/modules/solana-blink/blink.service.ts` (add `controlAgent`, `controlMockAgent`)

**Interfaces:**
- Produces: `type ControlAction = 'kill' | 'resume'`; `parseControlAction(body: unknown): ControlAction | null`;
  `controlAgent(runtime: FleetRuntime, agentId: string, action: ControlAction): Promise<GuardAccount>`;
  `blinkService.controlAgent(agentId: string, action: ControlAction): Promise<{ counter: number }>`;
  `POST /api/agents/<id>/control` with `{ "action": "kill" | "resume" }` → `200 { counter }`, `400` on a bad body,
  guard errors through `fleetErrorResponse` (404 unknown agent, 409 wrong state).

- [ ] **Step 1: Write the failing test** — `src/lib/server/modules/fleet/control.test.ts`

```ts
import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { GuardError } from '../agent-guard/guard';
import { controlAgent, parseControlAction } from './control';
import { Fleet } from './fleet';
import { StepThrottle } from './step-throttle';
import type { FleetRuntime } from './submit-decision';
import { MemoryGuard } from './testing/memory-guard';
import { TEST_SEAL } from './testing/test-seal';

const OWNER = 'ftbMowner1111111111111111111111111111111111';
const AGENT = 'sentinel-01';
const NOW = new Date('2026-10-12T10:00:00.000Z');

let rootDir: string;
let guard: MemoryGuard;
let runtime: FleetRuntime;

beforeEach(() => {
	rootDir = mkdtempSync(join(tmpdir(), 'control-'));
	const fleet = new Fleet(join(rootDir, 'fleet'));
	fleet.register({ id: AGENT, name: 'Sentinel', riskLevel: 'MEDIUM', registeredAt: NOW.getTime() }, TEST_SEAL);
	guard = new MemoryGuard(AGENT, OWNER);
	runtime = { guard, fleet, throttle: new StepThrottle(0), now: () => NOW };
});

afterEach(() => rmSync(rootDir, { recursive: true, force: true }));

describe('parseControlAction', () => {
	test('reads kill and resume', () => {
		expect(parseControlAction({ action: 'kill' })).toBe('kill');
		expect(parseControlAction({ action: 'resume' })).toBe('resume');
	});

	test('refuses anything else', () => {
		for (const body of [null, 'kill', {}, { action: 'pause' }, { action: 1 }]) {
			expect(parseControlAction(body)).toBeNull();
		}
	});
});

describe('controlAgent', () => {
	test('kill stops the agent, signed as its owner', async () => {
		const kill = spyOn(guard, 'kill');
		const account = await controlAgent(runtime, AGENT, 'kill');
		expect(account.status).toBe('Killed');
		expect(kill).toHaveBeenCalledWith(AGENT, OWNER);
	});

	test('resume lets a killed agent run again, using up one counter value', async () => {
		await controlAgent(runtime, AGENT, 'kill');
		const resume = spyOn(guard, 'resume');
		const account = await controlAgent(runtime, AGENT, 'resume');
		expect(account.status).toBe('Active');
		expect(account.counter).toBe(1);
		expect(resume).toHaveBeenCalledWith(AGENT, OWNER);
	});

	test('refuses an agent outside the fleet', async () => {
		const error = (await controlAgent(runtime, 'tick-99', 'kill').catch((caught: unknown) => caught)) as GuardError;
		expect(error.code).toBe('AgentNotFound');
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `~/.bun/bin/bun test src/lib/server/modules/fleet/control.test.ts`
Expected: FAIL, `Cannot find module './control'`.

- [ ] **Step 3: Write minimal implementation** — `src/lib/server/modules/fleet/control.ts`

```ts
import type { GuardAccount } from '../agent-guard/guard';
import { assertInFleet } from './record-decision';
import type { FleetRuntime } from './submit-decision';

// The owner's kill switch: kill stops the agent's steps on chain, resume lets them through again. The server signs both
// as the owner (OWNER_KEYPAIR), because the page and the Telegram bot have no wallet.

export type ControlAction = 'kill' | 'resume';

export function parseControlAction(body: unknown): ControlAction | null {
	const action = typeof body === 'object' && body !== null ? (body as Record<string, unknown>).action : undefined;
	return action === 'kill' || action === 'resume' ? action : null;
}

/** The guard refuses a kill of a killed agent and a resume of an active one. */
export async function controlAgent(runtime: FleetRuntime, agentId: string, action: ControlAction): Promise<GuardAccount> {
	assertInFleet(runtime, agentId);
	const { owner } = await runtime.guard.readAgent(agentId);
	return action === 'kill' ? runtime.guard.kill(agentId, owner) : runtime.guard.resume(agentId, owner);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `~/.bun/bin/bun test src/lib/server/modules/fleet/control.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Add `controlAgent` to `BlinkService`**

In `src/lib/server/modules/solana-blink/blink.service.ts`, add imports (keep the others for now; Task 2 prunes them):

```ts
import { GuardError } from '../agent-guard/guard';
import { controlAgent as controlFleetAgent, type ControlAction } from '../fleet/control';
```

(`NO_DECISION` and `GuardStatus` already come from `'../agent-guard/guard'`; merge `GuardError` into that import.)

Add these methods to the class, after `decideProposal`:

```ts
  /** The owner's kill switch. A fleet agent goes through the guard; a mock agent only changes its card. */
  async controlAgent(agentId: string, action: ControlAction): Promise<{ counter: number }> {
    const runtime = await findFleetRuntime();
    if (runtime?.fleet.get(agentId)) return { counter: (await controlFleetAgent(runtime, agentId, action)).counter };
    return { counter: this.controlMockAgent(agentId, action) };
  }

  /** Arbiter and Guardian: kill pauses the card, resume activates it and counts one more step. */
  private controlMockAgent(agentId: string, action: ControlAction): number {
    const agent = agentsStore.get(agentId);
    if (!agent) throw new GuardError('AgentNotFound', `no agent ${agentId}`);
    agent.status = action === 'kill' ? 'PAUSED' : 'ACTIVE';
    if (action === 'resume') agent.actionsExecuted += 1;
    agent.lastUpdated = Date.now();
    agent.lastCommitmentRoot = pqcCrypto.computeStateCommitment({
      agentId,
      action,
      status: agent.status,
      timestamp: agent.lastUpdated
    }).hexRoot;
    return agent.actionsExecuted;
  }
```

- [ ] **Step 6: Add the route** — `src/routes/api/agents/[id]/control/+server.ts`

```ts
import { json, type RequestHandler } from '@sveltejs/kit';
import { parseControlAction } from '#lib/server/modules/fleet/control';
import { fleetErrorResponse } from '#lib/server/modules/fleet/http-errors';
import { blinkService } from '#lib/server/modules/solana-blink/blink.service';

const BAD_REQUEST = 400;

/** The owner's kill switch: kill or resume the agent; 409 when it is already in that state. */
export const POST: RequestHandler = async ({ params, request }) => {
	const action = parseControlAction(await request.json().catch(() => null));
	if (!action) {
		return json({ error: 'BadRequest', message: 'expected { action: "kill" | "resume" }' }, { status: BAD_REQUEST });
	}
	try {
		return json(await blinkService.controlAgent(params.id!, action));
	} catch (error) {
		return fleetErrorResponse(error, `${action} of agent ${params.id}`);
	}
};
```

- [ ] **Step 7: Check and commit**

Run: `~/.bun/bin/bun run check` → 0 errors; `~/.bun/bin/bun test src` → all pass.

```bash
git add src/lib/server/modules/fleet/control.ts src/lib/server/modules/fleet/control.test.ts \
  "src/routes/api/agents/[id]/control/+server.ts" src/lib/server/modules/solana-blink/blink.service.ts
git commit -m "serwer: POST /api/agents/<id>/control - kill i resume wlasciciela jako zwykly endpoint"
```

---

### Task 2: Remove the Blink path; page uses `/control` and shows a Telegram card

**Files:**
- Delete: `src/routes/api/actions/agent-action/+server.ts`, `src/routes/actions.json/+server.ts`,
  `src/lib/server/modules/solana-blink/memo.ts`, `src/lib/server/modules/solana-blink/memo.test.ts`
- Modify: `src/lib/server/modules/solana-blink/blink.service.ts`
- Modify: `src/routes/+page.svelte`, `src/routes/+page.server.ts`
- Modify: `package.json`, `bun.lock` (via `bun remove`)

**Interfaces:**
- Consumes: `POST /api/agents/<id>/control` (Task 1).
- Produces: nothing new; the page no longer receives `origin`.

- [ ] **Step 1: Delete the Blink routes and the memo**

```bash
git rm src/routes/api/actions/agent-action/+server.ts src/routes/actions.json/+server.ts \
  src/lib/server/modules/solana-blink/memo.ts src/lib/server/modules/solana-blink/memo.test.ts
~/.bun/bin/bun remove @solana/actions
```

- [ ] **Step 2: Strip `BlinkService`**

In `blink.service.ts` delete: the `@solana/actions` import; the `@solana/web3.js` import; the `decisionHashLabel` import;
the `memoText` import; the `constructor` with `connection` and `defaultProgramId` and those two fields;
`getActionMetadata`; `createDecisionTransaction`; `applyGuardedDecision`; `applyMockDecision`. Keep `getAgent`,
`listAgents`, `decideProposal`, `controlAgent`, `controlMockAgent`. The import from `'../agent-guard/guard'` becomes
`import { GuardError, NO_DECISION, type GuardStatus } from '../agent-guard/guard';`.

- [ ] **Step 3: Page load stops passing `origin`** — `src/routes/+page.server.ts`

```ts
import type { PageServerLoad } from './$types';
import { blinkService } from '#lib/server/modules/solana-blink/blink.service';

export const load: PageServerLoad = async () => {
  return { agents: await blinkService.listAgents() };
};
```

- [ ] **Step 4: Page Kill/Resume through `/control`** — `src/routes/+page.svelte`

Delete the `blinkUrl` `$derived` (lines 27–29) and the whole `simulateAction` function. Add, after `armShock`:

```ts
  const CONTROL_DONE = {
    kill: 'Kill-Switch: the agent is stopped; the guard refuses its steps until you resume it.',
    resume: "Resumed: the guard lets the agent's steps through again."
  } as const;

  async function control(action: 'kill' | 'resume') {
    if (!selectedAgent) return;
    const done = selectedAgent.fleet ? CONTROL_DONE[action] : 'Mock agent: only this card changed.';
    await postAndReport(`/api/agents/${selectedAgent.id}/control`, { action }, done);
  }
```

Replace the four calls: `simulateAction('approve')` → `control('resume')` (fleet "Resume agent" and mock "Approve
Step"), `simulateAction('pause')` → `control('kill')` (both Kill-Switch buttons).

- [ ] **Step 5: Telegram card instead of Solana Actions**

Replace the whole `<!-- Blinks Hub -->` block (the `div` holding "Solana Actions", the `blink-url` input and its Copy
button) with:

```svelte
        <!-- Owner bot on Telegram -->
        <div class="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-5 backdrop-blur-sm">
          <h3 class="text-[11px] font-semibold uppercase tracking-widest text-slate-500 mb-3 flex items-center gap-2">
            <Send class="w-3.5 h-3.5 text-sky-400" /> Telegram
          </h3>
          <p class="text-[12px] text-slate-400 leading-relaxed">
            The owner bot sends each proposal to your Telegram chat with Accept and Reject, and Kill or Resume on every
            status change; <code class="text-sky-300">/agents</code> lists the fleet. Start it with
            <code class="text-sky-300">bun bot/telegram</code>.
          </p>
        </div>
```

In the `lucide-svelte` import replace `Terminal` with `Send` (check `Terminal` has no other use: `grep -n Terminal
src/routes/+page.svelte`). In the footer replace
`· <span class="text-sky-400">@solana/actions</span>` with `· <span class="text-sky-400">Telegram Bot API</span>`.

- [ ] **Step 6: Verify nothing still references the removed code**

Run: `grep -rn "solana/actions\|agent-action\|simulateAction\|blinkUrl\|memoText\|data.origin" src`
Expected: no output.

Run: `~/.bun/bin/bun run check` → 0 errors; `~/.bun/bin/bun run lint` → no errors; `~/.bun/bin/bun test src` → all pass.

- [ ] **Step 7: Commit**

```bash
git add -A src package.json bun.lock
git commit -m "gui, serwer: bez Blinks - kill i resume przez /control, karta Telegram zamiast Solana Actions, bez @solana/actions"
```

---

### Task 3: Telegram Bot API client

**Files:**
- Create: `bot/telegram/telegram-api.ts`
- Create: `bot/telegram/telegram-api.test.ts`
- Create: `bot/telegram/package.json`
- Modify: `biome.json` (add `"bot/**"` to `files.includes`)

**Interfaces:**
- Produces:

```ts
export interface InlineButton { text: string; callback_data: string }
export type Keyboard = InlineButton[][];
export interface Chat { id: number }
export interface Message { message_id: number; chat: Chat; text?: string }
export interface CallbackQuery { id: string; data?: string; message?: Message }
export interface Update { update_id: number; message?: Message; callback_query?: CallbackQuery }
export interface TelegramApi {
	getUpdates(offset: number, timeoutSec: number): Promise<Update[]>;
	sendMessage(chatId: number, text: string, keyboard?: Keyboard): Promise<void>;
	editMessageText(chatId: number, messageId: number, text: string): Promise<void>;
	answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void>;
}
export class TelegramError extends Error {}
export function createTelegramApi(token: string, fetchFn?: typeof fetch): TelegramApi;
```

- [ ] **Step 1: Package file and lint scope**

`bot/telegram/package.json` (so `bun bot/telegram` runs `index.ts`, like `agents/tick`):

```json
{
	"name": "telegram-owner-bot",
	"private": true,
	"type": "module",
	"main": "index.ts",
	"scripts": {
		"start": "bun index.ts",
		"test": "bun test"
	}
}
```

In `biome.json` change `"includes": ["src/**", "scripts/**", "agents/**", "*.ts"]` to
`"includes": ["src/**", "scripts/**", "agents/**", "bot/**", "*.ts"]`.

- [ ] **Step 2: Write the failing test** — `bot/telegram/telegram-api.test.ts`

```ts
import { describe, expect, test } from 'bun:test';
import { createTelegramApi, TelegramError } from './telegram-api';

const TOKEN = '123456:SECRET-token';

function answering(body: unknown, status = 200) {
	const requests: { url: string; init?: RequestInit }[] = [];
	const fetchFn = (async (url: string, init?: RequestInit) => {
		requests.push({ url, init });
		return new Response(JSON.stringify(body), { status });
	}) as unknown as typeof fetch;
	return { fetchFn, requests };
}

const sentBody = (init?: RequestInit) => JSON.parse(init?.body as string);

describe('createTelegramApi', () => {
	test('posts JSON to the method URL of the bot', async () => {
		const { fetchFn, requests } = answering({ ok: true, result: true });
		await createTelegramApi(TOKEN, fetchFn).sendMessage(42, 'hi');
		expect(requests[0].url).toBe(`https://api.telegram.org/bot${TOKEN}/sendMessage`);
		expect(requests[0].init?.method).toBe('POST');
		expect(sentBody(requests[0].init)).toEqual({ chat_id: 42, text: 'hi' });
	});

	test('sends a keyboard as inline_keyboard', async () => {
		const { fetchFn, requests } = answering({ ok: true, result: true });
		const keyboard = [[{ text: '🛑 Kill', callback_data: 'kill:tick-01' }]];
		await createTelegramApi(TOKEN, fetchFn).sendMessage(42, 'hi', keyboard);
		expect(sentBody(requests[0].init).reply_markup).toEqual({ inline_keyboard: keyboard });
	});

	test('getUpdates asks from the offset, with a long-poll timeout, and returns the updates', async () => {
		const updates = [{ update_id: 7, message: { message_id: 1, chat: { id: 42 }, text: '/agents' } }];
		const { fetchFn, requests } = answering({ ok: true, result: updates });
		expect(await createTelegramApi(TOKEN, fetchFn).getUpdates(7, 10)).toEqual(updates);
		expect(sentBody(requests[0].init)).toEqual({
			offset: 7,
			timeout: 10,
			allowed_updates: ['message', 'callback_query']
		});
	});

	test('editMessageText sends no keyboard, which removes the buttons', async () => {
		const { fetchFn, requests } = answering({ ok: true, result: true });
		await createTelegramApi(TOKEN, fetchFn).editMessageText(42, 9, 'done');
		expect(sentBody(requests[0].init)).toEqual({ chat_id: 42, message_id: 9, text: 'done' });
	});

	test('answerCallbackQuery sends the text only when given', async () => {
		const { fetchFn, requests } = answering({ ok: true, result: true });
		const api = createTelegramApi(TOKEN, fetchFn);
		await api.answerCallbackQuery('q1');
		await api.answerCallbackQuery('q2', 'Unknown button');
		expect(sentBody(requests[0].init)).toEqual({ callback_query_id: 'q1' });
		expect(sentBody(requests[1].init)).toEqual({ callback_query_id: 'q2', text: 'Unknown button' });
	});

	test('a refusal from Telegram throws with its description', async () => {
		const { fetchFn } = answering({ ok: false, description: 'Bad Request: chat not found' }, 400);
		const error = await createTelegramApi(TOKEN, fetchFn).sendMessage(1, 'x').catch((caught: unknown) => caught);
		expect(error).toBeInstanceOf(TelegramError);
		expect((error as Error).message).toBe('sendMessage: Bad Request: chat not found');
	});

	test('a network failure throws without the token, which is part of the URL', async () => {
		const fetchFn = (async (url: string) => {
			throw new Error(`Unable to connect. Is the computer able to access the url? ${url}`);
		}) as unknown as typeof fetch;
		const error = (await createTelegramApi(TOKEN, fetchFn).getUpdates(0, 10).catch((caught: unknown) => caught)) as Error;
		expect(error).toBeInstanceOf(TelegramError);
		expect(error.message).not.toContain(TOKEN);
		expect(error.message).toContain('getUpdates: Unable to connect');
	});
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `~/.bun/bin/bun test bot/telegram/telegram-api.test.ts`
Expected: FAIL, `Cannot find module './telegram-api'`.

- [ ] **Step 4: Write minimal implementation** — `bot/telegram/telegram-api.ts`

```ts
// The bot's link to Telegram: the four Bot API methods it uses, over fetch. The token is part of every URL, so no
// error leaves this file with it.

export interface InlineButton {
	text: string;
	callback_data: string;
}

export type Keyboard = InlineButton[][];

export interface Chat {
	id: number;
}

export interface Message {
	message_id: number;
	chat: Chat;
	text?: string;
}

export interface CallbackQuery {
	id: string;
	data?: string;
	message?: Message;
}

export interface Update {
	update_id: number;
	message?: Message;
	callback_query?: CallbackQuery;
}

export interface TelegramApi {
	/** Waits up to `timeoutSec` for updates from `offset` on. */
	getUpdates(offset: number, timeoutSec: number): Promise<Update[]>;
	sendMessage(chatId: number, text: string, keyboard?: Keyboard): Promise<void>;
	/** Replaces the text; the message keeps no buttons. */
	editMessageText(chatId: number, messageId: number, text: string): Promise<void>;
	/** Stops the button's spinner, optionally with a short popup text. */
	answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void>;
}

/** Telegram refused the call or could not be reached. */
export class TelegramError extends Error {}

const TOKEN_MASK = '<token>';

interface BotApiAnswer<T> {
	ok?: boolean;
	result?: T;
	description?: string;
}

export function createTelegramApi(token: string, fetchFn: typeof fetch = fetch): TelegramApi {
	const baseUrl = `https://api.telegram.org/bot${token}`;
	const redact = (text: string) => text.replaceAll(token, TOKEN_MASK);

	async function call<T>(method: string, params: Record<string, unknown>): Promise<T> {
		let response: Response;
		try {
			response = await fetchFn(`${baseUrl}/${method}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(params)
			});
		} catch (error) {
			throw new TelegramError(redact(`${method}: ${error instanceof Error ? error.message : String(error)}`));
		}
		const answer = (await response.json().catch(() => null)) as BotApiAnswer<T> | null;
		if (!answer?.ok) throw new TelegramError(redact(`${method}: ${answer?.description ?? `HTTP ${response.status}`}`));
		return answer.result as T;
	}

	return {
		getUpdates: (offset, timeoutSec) =>
			call<Update[]>('getUpdates', { offset, timeout: timeoutSec, allowed_updates: ['message', 'callback_query'] }),
		async sendMessage(chatId, text, keyboard) {
			await call('sendMessage', { chat_id: chatId, text, ...(keyboard && { reply_markup: { inline_keyboard: keyboard } }) });
		},
		async editMessageText(chatId, messageId, text) {
			await call('editMessageText', { chat_id: chatId, message_id: messageId, text });
		},
		async answerCallbackQuery(callbackQueryId, text) {
			await call('answerCallbackQuery', { callback_query_id: callbackQueryId, ...(text === undefined ? {} : { text }) });
		}
	};
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `~/.bun/bin/bun test bot/telegram/telegram-api.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 6: Commit**

```bash
git add bot/telegram/package.json bot/telegram/telegram-api.ts bot/telegram/telegram-api.test.ts biome.json
git commit -m "bot: klient Telegram Bot API na fetch, bez tokenu w bledach"
```

---

### Task 4: Oberek server client for the bot

**Files:**
- Create: `bot/telegram/oberek-api.ts`
- Create: `bot/telegram/oberek-api.test.ts`

**Interfaces:**
- Produces:

```ts
export type AgentStatus = 'ACTIVE' | 'PAUSED' | 'IDLE' | 'UNAVAILABLE' | 'AWAITING_APPROVAL';
export interface PendingProposal { counter: number; summary: string }
export interface AgentView {
	id: string; name: string; status: AgentStatus; currentTask: string; actionsExecuted: number;
	fleet?: { pendingProposal: PendingProposal | null };
}
export interface ServerRequest { path: string; body: Record<string, string> }
export type Answer = { kind: 'answered'; status: number; body: unknown } | { kind: 'unreachable'; reason: string };
export interface OberekApi { listAgents(): Promise<AgentView[]>; post(request: ServerRequest): Promise<Answer> }
export function createOberekApi(apiUrl: string, fetchFn?: typeof fetch): OberekApi;
```

- [ ] **Step 1: Write the failing test** — `bot/telegram/oberek-api.test.ts`

```ts
import { describe, expect, test } from 'bun:test';
import { createOberekApi } from './oberek-api';

const AGENT = {
	id: 'tick-01',
	name: 'Oberek Tick One',
	status: 'ACTIVE',
	currentTask: 'TICK',
	actionsExecuted: 3,
	fleet: { pendingProposal: null }
};

function answering(status: number, body: unknown) {
	const requests: { url: string; init?: RequestInit }[] = [];
	const fetchFn = (async (url: string, init?: RequestInit) => {
		requests.push({ url, init });
		return new Response(JSON.stringify(body), { status });
	}) as unknown as typeof fetch;
	return { fetchFn, requests };
}

const unreachable = (async () => {
	throw new Error('connection refused');
}) as unknown as typeof fetch;

describe('listAgents', () => {
	test('reads the agents of GET /api/agents', async () => {
		const { fetchFn, requests } = answering(200, { success: true, agents: [AGENT] });
		expect(await createOberekApi('http://server', fetchFn).listAgents()).toEqual([AGENT]);
		expect(requests[0].url).toBe('http://server/api/agents');
	});

	test('throws when the answer holds no agent list', async () => {
		const { fetchFn } = answering(500, { message: 'boom' });
		expect(createOberekApi('http://server', fetchFn).listAgents()).rejects.toThrow('GET /api/agents: HTTP 500');
	});
});

describe('post', () => {
	test('posts the body as JSON to the path and returns status and body', async () => {
		const { fetchFn, requests } = answering(409, { message: 'no proposal waiting' });
		const answer = await createOberekApi('http://server', fetchFn).post({
			path: '/api/agents/sentinel-01/approval',
			body: { verdict: 'accept' }
		});
		expect(answer).toEqual({ kind: 'answered', status: 409, body: { message: 'no proposal waiting' } });
		expect(requests[0].url).toBe('http://server/api/agents/sentinel-01/approval');
		expect(requests[0].init?.method).toBe('POST');
		expect(JSON.parse(requests[0].init?.body as string)).toEqual({ verdict: 'accept' });
	});

	test('reports an unreachable server instead of throwing', async () => {
		const answer = await createOberekApi('http://server', unreachable).post({ path: '/x', body: {} });
		expect(answer).toEqual({ kind: 'unreachable', reason: 'connection refused' });
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `~/.bun/bin/bun test bot/telegram/oberek-api.test.ts`
Expected: FAIL, `Cannot find module './oberek-api'`.

- [ ] **Step 3: Write minimal implementation** — `bot/telegram/oberek-api.ts`

```ts
// The bot's link to the Oberek server: the same HTTP API the page uses. Nothing here comes from the server's code.

export type AgentStatus = 'ACTIVE' | 'PAUSED' | 'IDLE' | 'UNAVAILABLE' | 'AWAITING_APPROVAL';

export interface PendingProposal {
	counter: number;
	summary: string;
}

/** An agent card as GET /api/agents returns it, only the fields the bot reads. Mock agents have no `fleet`. */
export interface AgentView {
	id: string;
	name: string;
	status: AgentStatus;
	currentTask: string;
	/** The agent's step counter on chain. */
	actionsExecuted: number;
	fleet?: { pendingProposal: PendingProposal | null };
}

export interface ServerRequest {
	path: string;
	body: Record<string, string>;
}

export type Answer = { kind: 'answered'; status: number; body: unknown } | { kind: 'unreachable'; reason: string };

export interface OberekApi {
	/** Throws when the server does not answer with an agent list. */
	listAgents(): Promise<AgentView[]>;
	post(request: ServerRequest): Promise<Answer>;
}

export function createOberekApi(apiUrl: string, fetchFn: typeof fetch = fetch): OberekApi {
	return {
		async listAgents() {
			const response = await fetchFn(`${apiUrl}/api/agents`);
			const body = (await response.json().catch(() => null)) as { agents?: unknown } | null;
			const agents = body?.agents;
			if (!response.ok || !Array.isArray(agents)) throw new Error(`GET /api/agents: HTTP ${response.status}`);
			return agents as AgentView[];
		},
		async post({ path, body }) {
			try {
				const response = await fetchFn(`${apiUrl}${path}`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(body)
				});
				return { kind: 'answered', status: response.status, body: await response.json().catch(() => null) };
			} catch (error) {
				return { kind: 'unreachable', reason: error instanceof Error ? error.message : String(error) };
			}
		}
	};
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `~/.bun/bin/bun test bot/telegram/oberek-api.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add bot/telegram/oberek-api.ts bot/telegram/oberek-api.test.ts
git commit -m "bot: klient serwera Oberek - lista agentow i POST przycisku"
```

---

### Task 5: Buttons

**Files:**
- Create: `bot/telegram/buttons.ts`
- Create: `bot/telegram/buttons.test.ts`

**Interfaces:**
- Consumes: `Keyboard` (Task 3); `Answer`, `ServerRequest` (Task 4).
- Produces:

```ts
export type ButtonAction = 'accept' | 'reject' | 'kill' | 'resume';
export interface Press { action: ButtonAction; agentId: string }
export function parseCallbackData(data: string): Press | null;
/** null when a button's callback data would pass Telegram's 64 bytes. */
export function keyboardFor(agentId: string, actions: ButtonAction[]): Keyboard | null;
export function requestFor(press: Press): ServerRequest;
export function resultLine(action: ButtonAction, answer: Answer): string;
```

- [ ] **Step 1: Write the failing test** — `bot/telegram/buttons.test.ts`

```ts
import { describe, expect, test } from 'bun:test';
import { keyboardFor, parseCallbackData, requestFor, resultLine } from './buttons';

describe('keyboardFor', () => {
	test('one row of labelled buttons carrying action and agent', () => {
		expect(keyboardFor('sentinel-01', ['accept', 'reject', 'kill'])).toEqual([
			[
				{ text: '✅ Accept', callback_data: 'accept:sentinel-01' },
				{ text: '❌ Reject', callback_data: 'reject:sentinel-01' },
				{ text: '🛑 Kill', callback_data: 'kill:sentinel-01' }
			]
		]);
	});

	test('is null when the callback data would pass 64 bytes', () => {
		expect(keyboardFor('a'.repeat(58), ['resume'])).toBeNull();
		expect(keyboardFor('a'.repeat(57), ['resume'])).not.toBeNull();
	});
});

describe('parseCallbackData', () => {
	test('reads back what keyboardFor wrote', () => {
		for (const action of ['accept', 'reject', 'kill', 'resume'] as const) {
			const data = keyboardFor('tick-01', [action])?.[0][0].callback_data ?? '';
			expect(parseCallbackData(data)).toEqual({ action, agentId: 'tick-01' });
		}
	});

	test('refuses anything else', () => {
		for (const data of ['', 'kill', 'pause:tick-01', 'kill:', 'kill:../etc', 'kill:tick 01']) {
			expect(parseCallbackData(data)).toBeNull();
		}
	});
});

describe('requestFor', () => {
	test('a verdict goes to the approval endpoint', () => {
		expect(requestFor({ action: 'reject', agentId: 'sentinel-01' })).toEqual({
			path: '/api/agents/sentinel-01/approval',
			body: { verdict: 'reject' }
		});
	});

	test('kill and resume go to the control endpoint', () => {
		expect(requestFor({ action: 'kill', agentId: 'tick-01' })).toEqual({
			path: '/api/agents/tick-01/control',
			body: { action: 'kill' }
		});
	});
});

describe('resultLine', () => {
	test('names what was done and the step', () => {
		expect(resultLine('accept', { kind: 'answered', status: 200, body: { counter: 42 } })).toBe('✅ Approved · step 42');
		expect(resultLine('resume', { kind: 'answered', status: 200, body: { counter: 8 } })).toBe('▶ Resumed · step 8');
	});

	test('quotes the server on a refusal', () => {
		const answer = { kind: 'answered', status: 409, body: { message: 'no proposal waiting' } } as const;
		expect(resultLine('accept', answer)).toBe('Refused (409): no proposal waiting');
	});

	test('a refusal without a message still says refused', () => {
		expect(resultLine('kill', { kind: 'answered', status: 502, body: null })).toBe('Refused (502): no reason given');
	});

	test('reports an unreachable server', () => {
		expect(resultLine('kill', { kind: 'unreachable', reason: 'connection refused' })).toBe(
			'Server unreachable: connection refused'
		);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `~/.bun/bin/bun test bot/telegram/buttons.test.ts`
Expected: FAIL, `Cannot find module './buttons'`.

- [ ] **Step 3: Write minimal implementation** — `bot/telegram/buttons.ts`

```ts
import type { Answer, ServerRequest } from './oberek-api';
import type { Keyboard } from './telegram-api';

// The owner's buttons: what each one carries, which server request it makes and how its result reads.

export type ButtonAction = 'accept' | 'reject' | 'kill' | 'resume';

export interface Press {
	action: ButtonAction;
	agentId: string;
}

const LABELS: Record<ButtonAction, string> = {
	accept: '✅ Accept',
	reject: '❌ Reject',
	kill: '🛑 Kill',
	resume: '▶ Resume'
};

const DONE: Record<ButtonAction, string> = {
	accept: '✅ Approved',
	reject: '❌ Rejected',
	kill: '🛑 Killed',
	resume: '▶ Resumed'
};

/** Telegram's limit on a button's callback data. */
const MAX_CALLBACK_BYTES = 64;
/** The server's agent id pattern (isAgentId). */
const AGENT_ID = /^[A-Za-z0-9-]{1,64}$/;
const SEPARATOR = ':';
const HTTP_OK_MIN = 200;
const HTTP_OK_MAX = 299;

const isButtonAction = (value: string): value is ButtonAction => Object.hasOwn(LABELS, value);
const callbackData = ({ action, agentId }: Press) => `${action}${SEPARATOR}${agentId}`;

export function parseCallbackData(data: string): Press | null {
	const at = data.indexOf(SEPARATOR);
	const action = data.slice(0, at);
	const agentId = data.slice(at + 1);
	return at > 0 && isButtonAction(action) && AGENT_ID.test(agentId) ? { action, agentId } : null;
}

export function keyboardFor(agentId: string, actions: ButtonAction[]): Keyboard | null {
	const row = actions.map((action) => ({ text: LABELS[action], callback_data: callbackData({ action, agentId }) }));
	const fits = row.every((button) => Buffer.byteLength(button.callback_data) <= MAX_CALLBACK_BYTES);
	return fits ? [row] : null;
}

export function requestFor({ action, agentId }: Press): ServerRequest {
	const agentPath = `/api/agents/${encodeURIComponent(agentId)}`;
	return action === 'accept' || action === 'reject'
		? { path: `${agentPath}/approval`, body: { verdict: action } }
		: { path: `${agentPath}/control`, body: { action } };
}

export function resultLine(action: ButtonAction, answer: Answer): string {
	if (answer.kind === 'unreachable') return `Server unreachable: ${answer.reason}`;
	const body = (typeof answer.body === 'object' && answer.body !== null ? answer.body : {}) as Record<string, unknown>;
	if (answer.status >= HTTP_OK_MIN && answer.status <= HTTP_OK_MAX) return `${DONE[action]} · step ${body.counter}`;
	return `Refused (${answer.status}): ${typeof body.message === 'string' ? body.message : 'no reason given'}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `~/.bun/bin/bun test bot/telegram/buttons.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add bot/telegram/buttons.ts bot/telegram/buttons.test.ts
git commit -m "bot: przyciski - dane zwrotne, zadanie do serwera, linia wyniku"
```

---

### Task 6: Notices

**Files:**
- Create: `bot/telegram/notices.ts`
- Create: `bot/telegram/notices.test.ts`

**Interfaces:**
- Consumes: `AgentView` (Task 4); `ButtonAction`, `keyboardFor` (Task 5); `Keyboard` (Task 3).
- Produces:

```ts
export interface Notice { text: string; keyboard?: Keyboard }
/** previous null: the first read after start, which only reports proposals already waiting. */
export function changeNotices(previous: AgentView[] | null, current: AgentView[]): Notice[];
export function agentsAnswer(agents: AgentView[]): Notice[];
```

- [ ] **Step 1: Write the failing test** — `bot/telegram/notices.test.ts`

```ts
import { describe, expect, test } from 'bun:test';
import { agentsAnswer, changeNotices } from './notices';
import type { AgentView } from './oberek-api';

const SUMMARY = 'PROPOSE (drift, needs approval): sell 1.234 SOL @ $152.10 (SOL 62.0% → 50.0%) [simulated shock -3%]';

function agent(overrides: Partial<AgentView> = {}): AgentView {
	return {
		id: 'sentinel-01',
		name: 'Oberek Sentinel Alpha',
		status: 'ACTIVE',
		currentTask: 'HOLD @ $152.10',
		actionsExecuted: 40,
		fleet: { pendingProposal: null },
		...overrides
	};
}

const awaiting = (counter = 41, summary = SUMMARY) =>
	agent({ status: 'AWAITING_APPROVAL', actionsExecuted: counter, fleet: { pendingProposal: { counter, summary } } });
const paused = () => agent({ status: 'PAUSED' });
const mock = () => agent({ id: 'arbiter-02', name: 'Arbiter Beta', status: 'PAUSED', fleet: undefined });
const buttons = (notice: { keyboard?: { text: string }[][] }) => notice.keyboard?.[0].map((button) => button.text);

const PROPOSAL_TEXT = [
	'⚠️ Oberek Sentinel Alpha waits for your verdict · step #41',
	SUMMARY,
	'',
	'Accept: the verdict goes on-chain and the agent executes the trade in its next cycle.',
	'Reject: the verdict goes on-chain and the treasury stays unchanged.'
].join('\n');

describe('changeNotices', () => {
	test('a new proposal: what to accept, with Accept, Reject and Kill', () => {
		const [notice] = changeNotices([agent()], [awaiting()]);
		expect(notice.text).toBe(PROPOSAL_TEXT);
		expect(buttons(notice)).toEqual(['✅ Accept', '❌ Reject', '🛑 Kill']);
	});

	test('a killed agent, with Resume', () => {
		const notices = changeNotices([agent()], [paused()]);
		expect(notices).toHaveLength(1);
		expect(notices[0].text).toBe('⏸ Oberek Sentinel Alpha is killed · step 40');
		expect(buttons(notices[0])).toEqual(['▶ Resume']);
	});

	test('a resumed agent, with Kill', () => {
		const notices = changeNotices([paused()], [agent()]);
		expect(notices[0].text).toBe('▶ Oberek Sentinel Alpha is running again · step 40');
		expect(buttons(notices[0])).toEqual(['🛑 Kill']);
	});

	test('nothing when nothing changed', () => {
		expect(changeNotices([agent(), awaiting()], [agent(), awaiting()])).toEqual([]);
	});

	test('nothing when a proposal is decided and the agent runs on', () => {
		expect(changeNotices([awaiting()], [agent()])).toEqual([]);
	});

	test('a second proposal within one poll gets its own message', () => {
		const notices = changeNotices([awaiting(41)], [awaiting(43, 'PROPOSE: buy 2.000 SOL')]);
		expect(notices).toHaveLength(1);
		expect(notices[0].text).toContain('step #43');
		expect(notices[0].text).toContain('PROPOSE: buy 2.000 SOL');
	});

	test('the first read only reports proposals already waiting', () => {
		const notices = changeNotices(null, [paused(), awaiting()]);
		expect(notices.map((notice) => notice.text)).toEqual([PROPOSAL_TEXT]);
	});

	test('mock agents are ignored', () => {
		expect(changeNotices([], [mock()])).toEqual([]);
	});

	test('an agent whose buttons cannot fit gets a pointer to the page', () => {
		const [notice] = changeNotices([agent({ id: 'a'.repeat(64) })], [{ ...paused(), id: 'a'.repeat(64) }]);
		expect(notice.keyboard).toBeUndefined();
		expect(notice.text).toEndWith('Its id is too long for Telegram buttons: use the page.');
	});
});

describe('agentsAnswer', () => {
	test('one message per fleet agent, with the buttons its state allows', () => {
		const unavailable = agent({ id: 'tick-01', name: 'Oberek Tick One', status: 'UNAVAILABLE', currentTask: 'Unavailable: RPC down' });
		const notices = agentsAnswer([agent(), paused(), awaiting(), unavailable, mock()]);
		expect(notices.map((notice) => notice.text)).toEqual([
			'▶ Oberek Sentinel Alpha · running · step 40\nHOLD @ $152.10',
			'⏸ Oberek Sentinel Alpha · killed · step 40',
			PROPOSAL_TEXT,
			'Oberek Tick One · Unavailable: RPC down'
		]);
		expect(notices.map(buttons)).toEqual([['🛑 Kill'], ['▶ Resume'], ['✅ Accept', '❌ Reject', '🛑 Kill'], undefined]);
	});

	test('says so when the fleet is empty', () => {
		expect(agentsAnswer([mock()])).toEqual([{ text: 'No fleet agents on the server.' }]);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `~/.bun/bin/bun test bot/telegram/notices.test.ts`
Expected: FAIL, `Cannot find module './notices'`.

- [ ] **Step 3: Write minimal implementation** — `bot/telegram/notices.ts`

```ts
import { type ButtonAction, keyboardFor } from './buttons';
import type { AgentView, PendingProposal } from './oberek-api';
import type { Keyboard } from './telegram-api';

// What the bot tells the owner: notices about changes between two reads of the fleet, and the answer to /agents.
// Only fleet agents count; mock agents send nothing on chain.

export interface Notice {
	text: string;
	keyboard?: Keyboard;
}

const PROPOSAL_FOOTER = [
	'Accept: the verdict goes on-chain and the agent executes the trade in its next cycle.',
	'Reject: the verdict goes on-chain and the treasury stays unchanged.'
].join('\n');
const NO_BUTTONS_NOTE = 'Its id is too long for Telegram buttons: use the page.';
const EMPTY_FLEET = 'No fleet agents on the server.';

const isFleetAgent = (agent: AgentView) => agent.fleet !== undefined;
const proposalOf = (agent: AgentView): PendingProposal | null =>
	agent.status === 'AWAITING_APPROVAL' ? (agent.fleet?.pendingProposal ?? null) : null;

function notice(text: string, agentId: string, actions: ButtonAction[]): Notice {
	if (actions.length === 0) return { text };
	const keyboard = keyboardFor(agentId, actions);
	return keyboard ? { text, keyboard } : { text: `${text}\n\n${NO_BUTTONS_NOTE}` };
}

function proposalNotice(agent: AgentView, proposal: PendingProposal): Notice {
	const text = `⚠️ ${agent.name} waits for your verdict · step #${proposal.counter}\n${proposal.summary}\n\n${PROPOSAL_FOOTER}`;
	return notice(text, agent.id, ['accept', 'reject', 'kill']);
}

/** What changed for one agent since the previous read; null when nothing worth a message. */
function changeNotice(before: AgentView | undefined, now: AgentView): Notice | null {
	const proposal = proposalOf(now);
	if (proposal) {
		const known = before && proposalOf(before)?.counter === proposal.counter;
		return known ? null : proposalNotice(now, proposal);
	}
	if (now.status === before?.status) return null;
	if (now.status === 'PAUSED') {
		return notice(`⏸ ${now.name} is killed · step ${now.actionsExecuted}`, now.id, ['resume']);
	}
	if (now.status === 'ACTIVE' && before?.status === 'PAUSED') {
		return notice(`▶ ${now.name} is running again · step ${now.actionsExecuted}`, now.id, ['kill']);
	}
	return null;
}

export function changeNotices(previous: AgentView[] | null, current: AgentView[]): Notice[] {
	const fleet = current.filter(isFleetAgent);
	if (previous === null) {
		return fleet.flatMap((agent) => {
			const proposal = proposalOf(agent);
			return proposal ? [proposalNotice(agent, proposal)] : [];
		});
	}
	const before = new Map(previous.map((agent) => [agent.id, agent]));
	return fleet.flatMap((agent) => changeNotice(before.get(agent.id), agent) ?? []);
}

function agentNotice(agent: AgentView): Notice {
	const proposal = proposalOf(agent);
	if (proposal) return proposalNotice(agent, proposal);
	const step = `step ${agent.actionsExecuted}`;
	if (agent.status === 'ACTIVE') {
		return notice(`▶ ${agent.name} · running · ${step}\n${agent.currentTask}`, agent.id, ['kill']);
	}
	if (agent.status === 'PAUSED') return notice(`⏸ ${agent.name} · killed · ${step}`, agent.id, ['resume']);
	return notice(`${agent.name} · ${agent.currentTask}`, agent.id, []);
}

export function agentsAnswer(agents: AgentView[]): Notice[] {
	const fleet = agents.filter(isFleetAgent);
	return fleet.length > 0 ? fleet.map(agentNotice) : [{ text: EMPTY_FLEET }];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `~/.bun/bin/bun test bot/telegram/notices.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add bot/telegram/notices.ts bot/telegram/notices.test.ts
git commit -m "bot: powiadomienia o zmianach i odpowiedz na /agents, z trescia propozycji"
```

---

### Task 7: Bot logic

**Files:**
- Create: `bot/telegram/bot.ts`
- Create: `bot/telegram/bot.test.ts`

**Interfaces:**
- Consumes: `TelegramApi`, `Update`, `CallbackQuery` (Task 3); `OberekApi`, `AgentView` (Task 4); `parseCallbackData`,
  `requestFor`, `resultLine` (Task 5); `changeNotices`, `agentsAnswer`, `Notice` (Task 6).
- Produces:

```ts
export interface BotDeps { telegram: TelegramApi; oberek: OberekApi; ownerChatId: number | null; log?: (line: string) => void }
export interface Bot { handleUpdate(update: Update): Promise<void>; checkAgents(): Promise<void> }
export function createBot(deps: BotDeps): Bot;
export function reasonOf(error: unknown): string;
```

- [ ] **Step 1: Write the failing test** — `bot/telegram/bot.test.ts`

```ts
import { describe, expect, test } from 'bun:test';
import { createBot } from './bot';
import type { AgentView, Answer, OberekApi, ServerRequest } from './oberek-api';
import type { Keyboard, TelegramApi, Update } from './telegram-api';

const OWNER = 42;
const STRANGER = 7;

const ACTIVE: AgentView = {
	id: 'sentinel-01',
	name: 'Oberek Sentinel Alpha',
	status: 'ACTIVE',
	currentTask: 'HOLD',
	actionsExecuted: 40,
	fleet: { pendingProposal: null }
};
const KILLED: AgentView = { ...ACTIVE, status: 'PAUSED' };

function fakeTelegram() {
	const sent: { chatId: number; text: string; keyboard?: Keyboard }[] = [];
	const edited: { chatId: number; messageId: number; text: string }[] = [];
	const answered: { id: string; text?: string }[] = [];
	const telegram: TelegramApi = {
		getUpdates: async () => [],
		sendMessage: async (chatId, text, keyboard) => void sent.push({ chatId, text, keyboard }),
		editMessageText: async (chatId, messageId, text) => void edited.push({ chatId, messageId, text }),
		answerCallbackQuery: async (id, text) => void answered.push({ id, text })
	};
	return { telegram, sent, edited, answered };
}

function fakeOberek(lists: (AgentView[] | Error)[], answer: Answer = { kind: 'answered', status: 200, body: { counter: 41 } }) {
	const posted: ServerRequest[] = [];
	const oberek: OberekApi = {
		listAgents: async () => {
			const next = lists.shift() ?? [];
			if (next instanceof Error) throw next;
			return next;
		},
		post: async (request) => {
			posted.push(request);
			return answer;
		}
	};
	return { oberek, posted };
}

const command = (chatId: number, text: string): Update => ({
	update_id: 1,
	message: { message_id: 1, chat: { id: chatId }, text }
});
const press = (chatId: number, data: string): Update => ({
	update_id: 2,
	callback_query: { id: 'q1', data, message: { message_id: 9, chat: { id: chatId }, text: 'Oberek Sentinel Alpha' } }
});

describe('commands', () => {
	test('/start tells anyone their chat id', async () => {
		const { telegram, sent } = fakeTelegram();
		await createBot({ telegram, oberek: fakeOberek([]).oberek, ownerChatId: null }).handleUpdate(command(STRANGER, '/start'));
		expect(sent[0].chatId).toBe(STRANGER);
		expect(sent[0].text).toContain('TELEGRAM_OWNER_CHAT_ID=7');
	});

	test('/agents answers the owner with one message per fleet agent', async () => {
		const { telegram, sent } = fakeTelegram();
		const { oberek } = fakeOberek([[ACTIVE, KILLED]]);
		await createBot({ telegram, oberek, ownerChatId: OWNER }).handleUpdate(command(OWNER, '/agents@oberek_owner_bot'));
		expect(sent.map((message) => message.text)).toEqual([
			'▶ Oberek Sentinel Alpha · running · step 40\nHOLD',
			'⏸ Oberek Sentinel Alpha · killed · step 40'
		]);
	});

	test('/agents says so when the server is down', async () => {
		const { telegram, sent } = fakeTelegram();
		const { oberek } = fakeOberek([new Error('connection refused')]);
		await createBot({ telegram, oberek, ownerChatId: OWNER }).handleUpdate(command(OWNER, '/agents'));
		expect(sent.map((message) => message.text)).toEqual(['Oberek server unreachable: connection refused']);
	});

	test('a stranger gets nothing from /agents', async () => {
		const { telegram, sent } = fakeTelegram();
		await createBot({ telegram, oberek: fakeOberek([[ACTIVE]]).oberek, ownerChatId: OWNER }).handleUpdate(
			command(STRANGER, '/agents')
		);
		expect(sent).toEqual([]);
	});
});

describe('buttons', () => {
	test("the owner's press goes to the server and the message shows the result, without buttons", async () => {
		const { telegram, edited, answered } = fakeTelegram();
		const { oberek, posted } = fakeOberek([]);
		await createBot({ telegram, oberek, ownerChatId: OWNER }).handleUpdate(press(OWNER, 'accept:sentinel-01'));
		expect(posted).toEqual([{ path: '/api/agents/sentinel-01/approval', body: { verdict: 'accept' } }]);
		expect(answered).toEqual([{ id: 'q1', text: undefined }]);
		expect(edited).toEqual([{ chatId: OWNER, messageId: 9, text: 'Oberek Sentinel Alpha\n\n✅ Approved · step 41' }]);
	});

	test('a press while the server is down says so in the message', async () => {
		const { telegram, edited } = fakeTelegram();
		const { oberek } = fakeOberek([], { kind: 'unreachable', reason: 'connection refused' });
		await createBot({ telegram, oberek, ownerChatId: OWNER }).handleUpdate(press(OWNER, 'kill:sentinel-01'));
		expect(edited[0].text).toEndWith('Server unreachable: connection refused');
	});

	test("a stranger's press does nothing", async () => {
		const { telegram, edited, answered } = fakeTelegram();
		const { oberek, posted } = fakeOberek([]);
		await createBot({ telegram, oberek, ownerChatId: OWNER }).handleUpdate(press(STRANGER, 'kill:sentinel-01'));
		expect([posted, edited, answered]).toEqual([[], [], []]);
	});

	test('an unknown button is answered and sends nothing to the server', async () => {
		const { telegram, answered } = fakeTelegram();
		const { oberek, posted } = fakeOberek([]);
		await createBot({ telegram, oberek, ownerChatId: OWNER }).handleUpdate(press(OWNER, 'pause:sentinel-01'));
		expect(answered).toEqual([{ id: 'q1', text: 'Unknown button' }]);
		expect(posted).toEqual([]);
	});
});

describe('checkAgents', () => {
	test('sends the change notices to the owner', async () => {
		const { telegram, sent } = fakeTelegram();
		const bot = createBot({ telegram, oberek: fakeOberek([[ACTIVE], [KILLED]]).oberek, ownerChatId: OWNER });
		await bot.checkAgents();
		await bot.checkAgents();
		expect(sent.map((message) => [message.chatId, message.text])).toEqual([[OWNER, '⏸ Oberek Sentinel Alpha is killed · step 40']]);
	});

	test('a failed read keeps the last good list, so nothing is sent twice', async () => {
		const { telegram, sent } = fakeTelegram();
		const lines: string[] = [];
		const lists = [[ACTIVE], [KILLED], new Error('connection refused'), [KILLED]];
		const reads = lists.length; // the fake shift()s the list, so count before the loop
		const bot = createBot({ telegram, oberek: fakeOberek(lists).oberek, ownerChatId: OWNER, log: (line) => lines.push(line) });
		for (let read = 0; read < reads; read++) await bot.checkAgents();
		expect(sent).toHaveLength(1);
		expect(lines).toEqual(['agent poll failed: connection refused']);
	});

	test('without an owner chat it reads nothing', async () => {
		const { telegram, sent } = fakeTelegram();
		const { oberek } = fakeOberek([[KILLED]]);
		await createBot({ telegram, oberek, ownerChatId: null }).checkAgents();
		expect(sent).toEqual([]);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `~/.bun/bin/bun test bot/telegram/bot.test.ts`
Expected: FAIL, `Cannot find module './bot'`.

- [ ] **Step 3: Write minimal implementation** — `bot/telegram/bot.ts`

```ts
import { parseCallbackData, requestFor, resultLine } from './buttons';
import { agentsAnswer, changeNotices, type Notice } from './notices';
import type { AgentView, OberekApi } from './oberek-api';
import type { CallbackQuery, TelegramApi, Update } from './telegram-api';

// The bot's behaviour, without its loops: one Telegram update at a time and one read of the fleet at a time. Only the
// owner's chat may act; anyone may ask /start for their chat id, which is how the owner learns theirs.

export interface BotDeps {
	telegram: TelegramApi;
	oberek: OberekApi;
	/** null until TELEGRAM_OWNER_CHAT_ID is set: the bot then only answers /start. */
	ownerChatId: number | null;
	log?: (line: string) => void;
}

export interface Bot {
	handleUpdate(update: Update): Promise<void>;
	/** Reads the fleet and sends the owner what changed since the last good read. */
	checkAgents(): Promise<void>;
}

const UNKNOWN_BUTTON = 'Unknown button';

export function reasonOf(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/** "/agents@oberek_owner_bot extra" → "/agents" */
const commandOf = (text: string) => text.trim().split(/[\s@]/)[0];

export function createBot({ telegram, oberek, ownerChatId, log = console.error }: BotDeps): Bot {
	let previous: AgentView[] | null = null;
	const isOwner = (chatId: number) => chatId === ownerChatId;

	async function send(chatId: number, notices: Notice[]): Promise<void> {
		for (const { text, keyboard } of notices) await telegram.sendMessage(chatId, text, keyboard);
	}

	function startReply(chatId: number): string {
		return isOwner(chatId)
			? 'You are the owner. /agents lists the fleet; proposals and kills arrive here.'
			: `Your chat id is ${chatId}. Put TELEGRAM_OWNER_CHAT_ID=${chatId} in .env and restart the bot.`;
	}

	async function agentsReply(): Promise<Notice[]> {
		try {
			return agentsAnswer(await oberek.listAgents());
		} catch (error) {
			return [{ text: `Oberek server unreachable: ${reasonOf(error)}` }];
		}
	}

	async function handleCommand(chatId: number, text: string): Promise<void> {
		const command = commandOf(text);
		if (command === '/start') return telegram.sendMessage(chatId, startReply(chatId));
		if (isOwner(chatId) && command === '/agents') return send(chatId, await agentsReply());
	}

	async function handlePress({ id, data, message }: CallbackQuery): Promise<void> {
		if (!message || !isOwner(message.chat.id)) return;
		const press = parseCallbackData(data ?? '');
		if (!press) return telegram.answerCallbackQuery(id, UNKNOWN_BUTTON);
		await telegram.answerCallbackQuery(id);
		const answer = await oberek.post(requestFor(press));
		const text = `${message.text ?? ''}\n\n${resultLine(press.action, answer)}`;
		await telegram.editMessageText(message.chat.id, message.message_id, text);
	}

	return {
		async handleUpdate({ message, callback_query }) {
			if (message?.text !== undefined) await handleCommand(message.chat.id, message.text);
			if (callback_query) await handlePress(callback_query);
		},
		async checkAgents() {
			if (ownerChatId === null) return;
			let current: AgentView[];
			try {
				current = await oberek.listAgents();
			} catch (error) {
				log(`agent poll failed: ${reasonOf(error)}`);
				return;
			}
			const notices = changeNotices(previous, current);
			previous = current;
			await send(ownerChatId, notices);
		}
	};
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `~/.bun/bin/bun test bot/telegram/bot.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add bot/telegram/bot.ts bot/telegram/bot.test.ts
git commit -m "bot: obsluga komend, przyciskow i odczytu floty - tylko czat wlasciciela"
```

---

### Task 8: Bot process, docs and the end-to-end run

**Files:**
- Create: `bot/telegram/index.ts`
- Create: `spec/decisions/008-wlasciciel-przez-telegram.md`
- Modify: `README.md`, `.env.example`, `spec/ARCHITECTURE.md`

**Interfaces:**
- Consumes: `createTelegramApi` (Task 3), `createOberekApi` (Task 4), `createBot`, `reasonOf` (Task 7), `runLoop`,
  `stopOnSignals` (`agents/shared/loop.ts`).

- [ ] **Step 1: The process** — `bot/telegram/index.ts`

```ts
// The owner's bot on Telegram: pushes the agents' proposals and status changes to the owner's chat, with buttons that
// answer through the server's API, and lists the fleet on /agents. Runs as its own process, like the agents.
import { runLoop, stopOnSignals } from '../../agents/shared/loop';
import { createBot, reasonOf } from './bot';
import { createOberekApi } from './oberek-api';
import { createTelegramApi } from './telegram-api';

const DEFAULT_API_URL = 'http://localhost:5173';
/** As often as the page refreshes its agent list. */
const AGENT_POLL_MS = 3_000;
/** Telegram holds getUpdates open this long when nothing comes; Ctrl+C waits at most this long. */
const LONG_POLL_SEC = 10;
const RETRY_MS = 5_000;
const NO_PAUSE = 0;

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
	console.error('TELEGRAM_BOT_TOKEN is not set: create a bot with @BotFather and put its token in .env');
	process.exit(1);
}
const ownerChatId = chatIdFromEnv();
const apiUrl = process.env.TELEGRAM_API_URL ?? DEFAULT_API_URL;

const telegram = createTelegramApi(token);
const bot = createBot({ telegram, oberek: createOberekApi(apiUrl), ownerChatId });
let offset = 0;

/** A group's id is negative, so any whole number goes. */
function chatIdFromEnv(): number | null {
	const raw = process.env.TELEGRAM_OWNER_CHAT_ID;
	if (!raw) return null;
	const chatId = Number(raw);
	if (!Number.isInteger(chatId)) {
		console.error(`TELEGRAM_OWNER_CHAT_ID must be a whole number, got "${raw}"`);
		process.exit(1);
	}
	return chatId;
}

async function readUpdates(): Promise<void> {
	try {
		for (const update of await telegram.getUpdates(offset, LONG_POLL_SEC)) {
			offset = update.update_id + 1;
			await bot.handleUpdate(update).catch((error) => console.error(`update ${update.update_id} failed: ${reasonOf(error)}`));
		}
	} catch (error) {
		console.error(`reading Telegram failed: ${reasonOf(error)}`);
		await Bun.sleep(RETRY_MS);
	}
}

console.log(
	ownerChatId === null
		? 'Telegram bot: TELEGRAM_OWNER_CHAT_ID is not set; send /start to the bot to learn your chat id. Ctrl+C stops'
		: `Telegram bot → ${apiUrl}, owner chat ${ownerChatId}; Ctrl+C stops`
);
const stop = stopOnSignals();
await Promise.all([runLoop(readUpdates, NO_PAUSE, stop), runLoop(() => bot.checkAgents(), AGENT_POLL_MS, stop)]);
console.log('Telegram bot stopped');
```

- [ ] **Step 2: Smoke-test the process without a token**

Run: `env -u TELEGRAM_BOT_TOKEN ~/.bun/bin/bun bot/telegram`
Expected: `TELEGRAM_BOT_TOKEN is not set: …`, exit code 1.

- [ ] **Step 3: `.env.example`** — append:

```
# The owner's Telegram bot (bun bot/telegram); the server reads none of these. Create the bot with @BotFather, put its
# token here, then send /start to the bot: it answers with your chat id.
# TELEGRAM_BOT_TOKEN=
# TELEGRAM_OWNER_CHAT_ID=
# TELEGRAM_API_URL=http://localhost:5173
```

- [ ] **Step 4: README** — after the "### Second agent: Sentinel" section, add:

````markdown
### The owner on Telegram

The bot sends each proposal to your Telegram chat with **Accept** and **Reject**, and **Kill** or **Resume** when an
agent's status changes; `/agents` lists the fleet with the buttons each agent's state allows. It runs as its own
process and talks to the server over HTTP, so it works from localhost.

1. In Telegram, send `/newbot` to @BotFather; put the token it gives in `.env` as `TELEGRAM_BOT_TOKEN`.
2. `bun bot/telegram`, then send `/start` to your bot: it answers with your chat id. Put it in `.env` as
   `TELEGRAM_OWNER_CHAT_ID` and restart the bot. Only that chat can press buttons.

```bash
bun bot/telegram                 # needs the server (bun run dev); TELEGRAM_API_URL if not on :5173
```
````

In "## Test" change `bun test                         # server, fleet, agents and scripts, no network` to
`bun test                         # server, fleet, agents, scripts and the Telegram bot, no network`.

- [ ] **Step 5: Decision 008** — `spec/decisions/008-wlasciciel-przez-telegram.md`

```markdown
# 008: Właściciel odpowiada agentom przez Telegram, nie przez Blinks

Data: 2026-10-12

## Kontekst

Właściciel miał zatwierdzać propozycje i zabijać agentów z Blinka (Solana Actions). Blinka nic nie renderuje: dial.to
jest wstrzymany, blinks.xyz nie działa, a X wymaga publicznego HTTPS i rejestracji przez dial.to. Endpoint Actions był
gotowy, ale nikt nie mógł go zobaczyć.

## Decyzja

- Bot Telegram (`bot/telegram`) jest osobnym procesem, jak agenci, i rozmawia z serwerem tylko przez HTTP. Co 3 s czyta
  `GET /api/agents` i wysyła właścicielowi: propozycję z treścią i przyciskami Accept, Reject, Kill; zabicie z Resume;
  wznowienie z Kill. `/agents` wypisuje flotę z przyciskami pasującymi do stanu agenta.
- Przyciski wołają te same endpointy co strona: `POST /api/agents/<id>/approval` i nowy `POST /api/agents/<id>/control`
  (`kill` / `resume`).
- Działać może tylko czat `TELEGRAM_OWNER_CHAT_ID`; `/start` podaje każdemu jego id czatu.
- Ścieżka Blinks znika: `/api/actions/agent-action`, `actions.json`, transakcja Memo i zależność `@solana/actions`.

## Uzasadnienie

- **Działa z localhost.** Long polling nie potrzebuje publicznego adresu ani rejestracji; demo pokazuje prawdziwą
  wiadomość na telefonie.
- **Treść propozycji z agenta.** Bot pokazuje `summary`, które pisze agent, więc każdy agent z propozycją daje czytelną
  wiadomość bez kodu po stronie bota.

## Czego nie chroni

- Serwer podpisuje kill i resume własnym kluczem (`OWNER_KEYPAIR`), bez podpisu portfela. Na ścieżce bota jedyną
  bramką jest sprawdzenie czatu właściciela; strona nie ma żadnej.
- Stan krótszy niż jeden odczyt (3 s) nie trafia do wiadomości.

## Odrzucone

- **Własny renderer Blinka na stronie z Wallet Standard.** Dałby podpis portfela, ale to osobny podsystem, a Blink na
  własnej stronie nie wychodzi do mediów społecznościowych.
- **Blinks za publicznym adresem (VPS i domena).** Nie wskrzesza dial.to, od którego zależy rozwijanie Blinka na X.
```

- [ ] **Step 6: `spec/ARCHITECTURE.md`**

Replace line 13 (`- **Interakcję z użytkownikiem w mediach społecznościowych** za pomocą protokołu **Solana Actions &
Dialect Blinks** …`) with:

```markdown
- **Odpowiedź właściciela z Telegrama**: bot wysyła propozycje agentów i zmiany ich stanu z przyciskami Accept, Reject,
  Kill i Resume (decyzja 008).
```

In the mermaid diagram replace the lines `X["Twitter / X / Discord (Dialect Blink UI)"]` and
`DialTo["Dialect Inspector (dial.to)"]` with `TG["Telegram (owner bot, bot/telegram)"]`; replace
`M_Blink["module: solana-blink\n(Actions & Blinks Spec)"]` with `M_Blink["module: solana-blink\n(agent cards, kill & resume)"]`;
replace `X -->|1. GET/POST Blink Action| ServerAPI` with `TG -->|1. GET agents, POST approval / control| ServerAPI` and
delete `DialTo -->|CORS Test & Actions Spec| ServerAPI`. In the file tree replace the line ending
`# Główny routing Actions (standard Dialect Blinks)` with nothing (delete it, and its parent `actions` entry if it has no
other child). Then `grep -n -i "blink\|dial" spec/ARCHITECTURE.md` and reword any remaining mention the same way.

- [ ] **Step 7: Full verification**

Run: `~/.bun/bin/bun run check` → 0 errors.
Run: `~/.bun/bin/bun run lint` → no errors; no warnings in `bot/` or the files Tasks 1–2 touched.
Run: `~/.bun/bin/bun test src agents scripts bot` → all pass, 0 fail.

- [ ] **Step 8: Commit**

```bash
git add bot/telegram/index.ts spec/decisions/008-wlasciciel-przez-telegram.md README.md .env.example spec/ARCHITECTURE.md
git commit -m "bot: proces bun bot/telegram; decyzja 008, README, .env.example, ARCHITECTURE bez Blinks"
```

- [ ] **Step 9: End to end on devnet (needs the user's bot token)**

1. `.env` has `TELEGRAM_BOT_TOKEN`; `bun bot/telegram`; send `/start` → reply names the chat id; set
   `TELEGRAM_OWNER_CHAT_ID`, restart the bot.
2. `bun run dev`; `SENTINEL_SCHEDULE_MIN=2 SENTINEL_INTERVAL_MS=10000 bun agents/sentinel`; on the page arm the price
   shock → within one cycle the chat gets the proposal message with Accept · Reject · Kill.
3. Press Accept → message ends with `✅ Approved · step N`; the page's decision feed shows the APPROVED verdict.
4. `/agents` → one message per fleet agent. Press Kill on Sentinel → the message ends with `🛑 Killed · step N`, the
   page card shows PAUSED, and the next poll sends one "is killed" notice with Resume. Press Resume → card ACTIVE.
5. On the page press the Kill-Switch → the chat gets "is killed" with Resume.
