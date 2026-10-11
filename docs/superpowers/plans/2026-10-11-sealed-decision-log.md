# Sealed Decision Log Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every new line of a fleet agent's `decisions.jsonl` is AES-256-GCM ciphertext under a per-agent data key
wrapped with ML-KEM-768 to the owner; the owner's audit decrypts with the owner's secret key.

**Architecture:** Two new pure modules in `src/lib/server/modules/fleet/`: `log-seal.ts` (owner ML-KEM key, per-agent
seal = capsule + HKDF data key, their 0600 files) and `sealed-log.ts` (AES-256-GCM seal/open of one log entry). `Fleet`
seals on append and opens on read, with the data key from the agent's `seal.json` unless the caller supplies another key
source (the audit does). Scripts create the owner key, seal agents and audit with the owner's key. Program, transactions
and on-chain hash are unchanged.

**Tech Stack:** Bun + TypeScript, `bun:test`, `@noble/post-quantum/ml-kem.js` (`ml_kem768`: public key 1,184 B, secret
key 2,400 B, capsule 1,088 B, shared secret 32 B), Node `crypto` (`hkdfSync`, `aes-256-gcm`).

**Spec:** `docs/superpowers/specs/2026-10-11-sealed-decision-log-design.md`

## Global Constraints

- Work in the worktree `/storage1/mydes/SolanaHackaton/.claude/worktrees/sealed_log`, branch `sealed_log` (off `main`
  at `19ceb18`). Run commands from there. Never touch the shared checkout or the shared `.devnet/`.
- Tests: `~/.bun/bin/bun test src agents scripts` (282 pass at the start). Strict TDD: red, then green, then commit.
- Code style: tabs, single quotes, 120-column lines, short doc comments in English, as in `fleet.ts`.
- Commit messages in Polish without diacritics, prefix `fleet:` / `scripts:` / `spec:` / `docs:`, no Co-Authored-By.
- `dataKey` = HKDF-SHA256(ikm = ML-KEM shared secret, salt = empty, info = `onchain-agent-guard:decision-log:v1`, 32 B).
- Sealed line: `{ "counter": n, "nonce": b64(12 B), "ciphertext": b64, "tag": b64(16 B) }`; AAD = counter as u64 LE;
  plaintext = the whole `DecisionLogEntry` as JSON.
- Owner key file `.devnet/owner-mlkem.json` (`OWNER_MLKEM_FILE`), seal file `.devnet/fleet/<id>/seal.json`; both
  `{ field: base64 }` JSON, mode 0600, flag `wx` (never overwritten).
- A line without `ciphertext` is a legacy plaintext entry and is read as before. New lines are always sealed.
- A sealed line that does not authenticate is skipped with a `console.warn`, like a non-JSON line today.
- `transactions.jsonl` stays plain.
- Type-check: `~/.bun/bin/bun run check` (svelte-check). On `main` in this worktree it reports 92 errors (unresolved
  `#lib` imports and others, none ours). A task passes when the count does not grow and no error names a file it touched.

## Review Focus

- Server restart: a new `Fleet` instance must read lines sealed by an earlier one (key from `seal.json` on disk). Test in
  Task 3.
- An agent with a plaintext history, sealed later with `fleet.ts seal`: the mixed log reads back in order. Test in Task 3.
- An agent with no `seal.json`: its legacy log still reads, but appending must throw, never fall back to plaintext. Test
  in Task 3.
- A retried step: an `unconfirmed` entry and a confirmed one with the same counter both read back. Test in Task 3.
- Setup re-run or a second `fleet.ts seal`: the seal must not be replaced, or the log written so far becomes unreadable.
  Tests in Task 1 (`wx`) and Task 5 (no `seal` step for a sealed agent).

---

### Task 1: Owner ML-KEM key and per-agent seal (`log-seal.ts`)

**Files:**
- Create: `src/lib/server/modules/fleet/log-seal.ts`
- Test: `src/lib/server/modules/fleet/log-seal.test.ts`

**Interfaces:**
- Produces:
  - `interface OwnerKemKey { publicKey: Uint8Array; secretKey: Uint8Array }`
  - `interface LogSeal { kemCiphertext: Uint8Array; dataKey: Uint8Array }`
  - `createOwnerKemKey(): OwnerKemKey`
  - `createLogSeal(ownerPublicKey: Uint8Array): LogSeal`
  - `recoverDataKey(kemCiphertext: Uint8Array, ownerSecretKey: Uint8Array): Uint8Array`
  - `saveOwnerKemKey(path: string, key: OwnerKemKey): void`, `loadOwnerKemKey(path: string): OwnerKemKey`
  - `saveLogSeal(path: string, seal: LogSeal): void`, `loadLogSeal(path: string): LogSeal`

- [ ] **Step 1: Write the failing tests**

```ts
import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, statSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
	createLogSeal,
	createOwnerKemKey,
	loadLogSeal,
	loadOwnerKemKey,
	recoverDataKey,
	saveLogSeal,
	saveOwnerKemKey
} from './log-seal';

const OWNER_ONLY_MODE = 0o600;
const PERMISSION_BITS = 0o777;
let dir: string;

beforeEach(() => (dir = mkdtempSync(join(tmpdir(), 'log-seal-'))));
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const modeOf = (path: string) => statSync(path).mode & PERMISSION_BITS;

test("the owner's secret key recovers the data key the seal was made with", () => {
	const owner = createOwnerKemKey();
	const seal = createLogSeal(owner.publicKey);
	expect(seal.dataKey.length).toBe(32);
	expect(recoverDataKey(seal.kemCiphertext, owner.secretKey)).toEqual(seal.dataKey);
});

test("another owner's secret key recovers a different key", () => {
	const seal = createLogSeal(createOwnerKemKey().publicKey);
	expect(recoverDataKey(seal.kemCiphertext, createOwnerKemKey().secretKey)).not.toEqual(seal.dataKey);
});

test('the data key is not the raw ML-KEM shared secret: two seals for one owner differ', () => {
	const owner = createOwnerKemKey();
	expect(createLogSeal(owner.publicKey).dataKey).not.toEqual(createLogSeal(owner.publicKey).dataKey);
});

test('the owner key file round-trips, is 0600 and is never overwritten', () => {
	const path = join(dir, 'keys', 'owner-mlkem.json');
	const owner = createOwnerKemKey();
	saveOwnerKemKey(path, owner);
	expect(loadOwnerKemKey(path)).toEqual(owner);
	expect(modeOf(path)).toBe(OWNER_ONLY_MODE);
	expect(() => saveOwnerKemKey(path, createOwnerKemKey())).toThrow();
	expect(loadOwnerKemKey(path)).toEqual(owner);
});

test('the seal file round-trips, is 0600 and is never overwritten', () => {
	const path = join(dir, 'seal.json');
	const seal = createLogSeal(createOwnerKemKey().publicKey);
	saveLogSeal(path, seal);
	expect(loadLogSeal(path)).toEqual(seal);
	expect(modeOf(path)).toBe(OWNER_ONLY_MODE);
	expect(() => saveLogSeal(path, createLogSeal(createOwnerKemKey().publicKey))).toThrow();
	expect(loadLogSeal(path)).toEqual(seal);
});
```

The third test is not a check of HKDF itself. It only shows that `dataKey` comes from a fresh encapsulation each time.
Keep it: it fails if `createLogSeal` ever returns a fixed key.

- [ ] **Step 2: Run the tests and watch them fail**

Run: `~/.bun/bin/bun test src/lib/server/modules/fleet/log-seal.test.ts`
Expected: FAIL, `Cannot find module './log-seal'`.

- [ ] **Step 3: Implement `log-seal.ts`**

```ts
import { hkdfSync } from 'crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import { ml_kem768 } from '@noble/post-quantum/ml-kem.js';

// Keys of the sealed decision log: the owner's ML-KEM-768 key pair, and per agent a seal holding the ML-KEM capsule
// and the AES-256 data key derived from it. The server keeps the data key to read its own log; the owner recovers it
// from the capsule with the secret key.

export interface OwnerKemKey {
	publicKey: Uint8Array;
	secretKey: Uint8Array;
}

export interface LogSeal {
	/** ML-KEM-768 capsule to the owner's public key; only the owner's secret key opens it. */
	kemCiphertext: Uint8Array;
	/** AES-256-GCM key of the agent's decision log. */
	dataKey: Uint8Array;
}

const DATA_KEY_INFO = 'onchain-agent-guard:decision-log:v1';
const DATA_KEY_LENGTH = 32;
const NO_SALT = new Uint8Array(0);
const OWNER_ONLY = 0o600;

export function createOwnerKemKey(): OwnerKemKey {
	const { publicKey, secretKey } = ml_kem768.keygen();
	return { publicKey, secretKey };
}

export function createLogSeal(ownerPublicKey: Uint8Array): LogSeal {
	const { cipherText, sharedSecret } = ml_kem768.encapsulate(ownerPublicKey);
	return { kemCiphertext: cipherText, dataKey: deriveDataKey(sharedSecret) };
}

/** A wrong secret key does not throw (ML-KEM rejects implicitly): it yields a key that opens nothing. */
export function recoverDataKey(kemCiphertext: Uint8Array, ownerSecretKey: Uint8Array): Uint8Array {
	return deriveDataKey(ml_kem768.decapsulate(kemCiphertext, ownerSecretKey));
}

function deriveDataKey(sharedSecret: Uint8Array): Uint8Array {
	return new Uint8Array(hkdfSync('sha256', sharedSecret, NO_SALT, DATA_KEY_INFO, DATA_KEY_LENGTH));
}

export function saveOwnerKemKey(path: string, key: OwnerKemKey): void {
	saveSecretFile(path, { publicKey: key.publicKey, secretKey: key.secretKey });
}

export function loadOwnerKemKey(path: string): OwnerKemKey {
	const { publicKey, secretKey } = loadSecretFile(path);
	return { publicKey, secretKey };
}

export function saveLogSeal(path: string, seal: LogSeal): void {
	saveSecretFile(path, { kemCiphertext: seal.kemCiphertext, dataKey: seal.dataKey });
}

export function loadLogSeal(path: string): LogSeal {
	const { kemCiphertext, dataKey } = loadSecretFile(path);
	return { kemCiphertext, dataKey };
}

/** Owner-only and never overwritten (`wx`): replacing a key would leave everything sealed under it unreadable. */
function saveSecretFile(path: string, fields: Record<string, Uint8Array>): void {
	mkdirSync(dirname(path), { recursive: true });
	const json = Object.fromEntries(Object.entries(fields).map(([name, bytes]) => [name, Buffer.from(bytes).toString('base64')]));
	writeFileSync(path, JSON.stringify(json, null, 2) + '\n', { mode: OWNER_ONLY, flag: 'wx' });
}

function loadSecretFile(path: string): Record<string, Uint8Array> {
	const json: Record<string, string> = JSON.parse(readFileSync(path, 'utf8'));
	return Object.fromEntries(Object.entries(json).map(([name, base64]) => [name, new Uint8Array(Buffer.from(base64, 'base64'))]));
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `~/.bun/bin/bun test src/lib/server/modules/fleet/log-seal.test.ts`
Expected: 5 pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/modules/fleet/log-seal.ts src/lib/server/modules/fleet/log-seal.test.ts
git commit -m "fleet: klucz ML-KEM-768 wlasciciela i pieczec agenta - kapsula + klucz danych HKDF, pliki 0600 bez nadpisywania"
```

---

### Task 2: Seal and open one log entry (`sealed-log.ts`)

**Files:**
- Create: `src/lib/server/modules/fleet/sealed-log.ts`
- Test: `src/lib/server/modules/fleet/sealed-log.test.ts`

**Interfaces:**
- Consumes: `DecisionLogEntry` (type) from `./fleet`.
- Produces:
  - `interface SealedLine { counter: number; nonce: string; ciphertext: string; tag: string }`
  - `sealEntry(dataKey: Uint8Array, entry: DecisionLogEntry): SealedLine`
  - `openLine(dataKey: Uint8Array, line: SealedLine): DecisionLogEntry` (throws when the line does not authenticate)
  - `isSealedLine(value: unknown): value is SealedLine`

- [ ] **Step 1: Write the failing tests**

```ts
import { expect, test } from 'bun:test';
import { randomBytes } from 'crypto';
import type { DecisionLogEntry } from './fleet';
import { isSealedLine, openLine, sealEntry, type SealedLine } from './sealed-log';

const KEY = new Uint8Array(randomBytes(32));
const ENTRY: DecisionLogEntry = {
	record: {
		agent: 'sentinel-01',
		counter: 7,
		kind: 'sentinel',
		decision: { action: 'REBALANCE', usdc: 125.5 },
		summary: 'SELL 0.5 SOL',
		observedAt: '2026-10-11T12:00:00.000Z'
	},
	decisionHash: 'ab'.repeat(32),
	unconfirmed: true
};

/** The same base64 field with one bit flipped. */
function flipped(base64: string): string {
	const bytes = Buffer.from(base64, 'base64');
	bytes[0] ^= 1;
	return bytes.toString('base64');
}

test('opens back to the same entry, unconfirmed mark included', () => {
	expect(openLine(KEY, sealEntry(KEY, ENTRY))).toEqual(ENTRY);
});

test('keeps only the counter in clear', () => {
	const line = sealEntry(KEY, ENTRY);
	expect(Object.keys(line).sort()).toEqual(['ciphertext', 'counter', 'nonce', 'tag']);
	expect(line.counter).toBe(7);
	expect(JSON.stringify(line)).not.toContain('REBALANCE');
	expect(JSON.stringify(line)).not.toContain(ENTRY.decisionHash);
});

test('a fresh nonce per line: the same entry seals differently twice', () => {
	expect(sealEntry(KEY, ENTRY).ciphertext).not.toBe(sealEntry(KEY, ENTRY).ciphertext);
});

test('refuses another key', () => {
	expect(() => openLine(new Uint8Array(randomBytes(32)), sealEntry(KEY, ENTRY))).toThrow();
});

test('refuses a line moved to another counter', () => {
	const line: SealedLine = { ...sealEntry(KEY, ENTRY), counter: 8 };
	expect(() => openLine(KEY, line)).toThrow();
});

test('refuses a flipped ciphertext, tag or nonce', () => {
	const line = sealEntry(KEY, ENTRY);
	for (const field of ['ciphertext', 'tag', 'nonce'] as const) {
		expect(() => openLine(KEY, { ...line, [field]: flipped(line[field]) })).toThrow();
	}
});

test('tells a sealed line from a legacy plaintext entry', () => {
	expect(isSealedLine(sealEntry(KEY, ENTRY))).toBe(true);
	expect(isSealedLine(ENTRY)).toBe(false);
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `~/.bun/bin/bun test src/lib/server/modules/fleet/sealed-log.test.ts`
Expected: FAIL, `Cannot find module './sealed-log'`.

- [ ] **Step 3: Implement `sealed-log.ts`**

```ts
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import type { DecisionLogEntry } from './fleet';

// One decision log line, sealed with AES-256-GCM under the agent's data key. Only the counter stays in clear; it is
// the additional authenticated data, so a line moved to another counter does not open.

export interface SealedLine {
	counter: number;
	nonce: string;
	ciphertext: string;
	tag: string;
}

const CIPHER = 'aes-256-gcm';
const NONCE_LENGTH = 12;
const TAG_LENGTH = 16;
const COUNTER_LENGTH = 8;

export function sealEntry(dataKey: Uint8Array, entry: DecisionLogEntry): SealedLine {
	const counter = entry.record.counter;
	const nonce = randomBytes(NONCE_LENGTH);
	const cipher = createCipheriv(CIPHER, dataKey, nonce, { authTagLength: TAG_LENGTH });
	cipher.setAAD(counterBytes(counter));
	const ciphertext = Buffer.concat([cipher.update(JSON.stringify(entry), 'utf8'), cipher.final()]);
	return { counter, nonce: base64(nonce), ciphertext: base64(ciphertext), tag: base64(cipher.getAuthTag()) };
}

/** Throws when the line was not sealed with this key and counter, or was changed since. */
export function openLine(dataKey: Uint8Array, line: SealedLine): DecisionLogEntry {
	const decipher = createDecipheriv(CIPHER, dataKey, fromBase64(line.nonce), { authTagLength: TAG_LENGTH });
	decipher.setAAD(counterBytes(line.counter));
	decipher.setAuthTag(fromBase64(line.tag));
	const plaintext = Buffer.concat([decipher.update(fromBase64(line.ciphertext)), decipher.final()]);
	return JSON.parse(plaintext.toString('utf8'));
}

/** Legacy plaintext entries have no ciphertext. */
export function isSealedLine(value: unknown): value is SealedLine {
	return typeof value === 'object' && value !== null && 'ciphertext' in value;
}

function counterBytes(counter: number): Buffer {
	const bytes = Buffer.alloc(COUNTER_LENGTH);
	bytes.writeBigUInt64LE(BigInt(counter));
	return bytes;
}

const base64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64');
const fromBase64 = (text: string) => Buffer.from(text, 'base64');
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `~/.bun/bin/bun test src/lib/server/modules/fleet/sealed-log.test.ts`
Expected: 7 pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/modules/fleet/sealed-log.ts src/lib/server/modules/fleet/sealed-log.test.ts
git commit -m "fleet: wiersz logu decyzji zapieczetowany AES-256-GCM - jawny tylko licznik, ktory jest AAD"
```

---

### Task 3: `Fleet` seals its decision log

**Files:**
- Modify: `src/lib/server/modules/fleet/fleet.ts`
- Create: `src/lib/server/modules/fleet/testing/test-seal.ts`
- Modify tests: `src/lib/server/modules/fleet/fleet.test.ts`, `latest-decision.test.ts:47`, `approval.test.ts:32`,
  `submit-decision.test.ts:26`

**Interfaces:**
- Consumes: `LogSeal`, `saveLogSeal`, `loadLogSeal` (Task 1); `sealEntry`, `openLine`, `isSealedLine`, `SealedLine`
  (Task 2).
- Produces:
  - `type DataKeyOf = (agentId: string) => Uint8Array`
  - `new Fleet(fleetDir: string, dataKeyOf?: DataKeyOf)`; default reads `dataKey` from the agent's `seal.json`
  - `register(entry: FleetEntry, seal: LogSeal): void` (writes `agent.json` and `seal.json`)
  - `addSeal(agentId: string, seal: LogSeal): void` (throws if the agent is not in the fleet or already sealed)
  - `isSealed(agentId: string): boolean`
  - `seal(agentId: string): LogSeal`
  - `decisionLineCounts(agentId: string): { sealed: number; legacy: number }`
  - `TEST_SEAL: LogSeal` in `testing/test-seal.ts`

- [ ] **Step 1: Add the test seal**

`src/lib/server/modules/fleet/testing/test-seal.ts`:

```ts
import type { LogSeal } from '../log-seal';

/** A fixed seal for tests: Fleet only uses its data key; the capsule is never opened. */
export const TEST_SEAL: LogSeal = { kemCiphertext: new Uint8Array(1088), dataKey: new Uint8Array(32).fill(7) };
```

- [ ] **Step 2: Pass it at every `register` in the existing tests**

In `fleet.test.ts:27`, `latest-decision.test.ts:47`, `approval.test.ts:32` and `submit-decision.test.ts:26`, add the
seal as the second argument, e.g.:

```ts
fleet.register({ id: AGENT, name: 'Sentinel', riskLevel: 'MEDIUM', registeredAt: 0 }, TEST_SEAL);
```

and `import { TEST_SEAL } from './testing/test-seal';` in each file.

- [ ] **Step 3: Write the failing tests in `fleet.test.ts`**

Add the imports `readFileSync`, `writeFileSync`, `existsSync` from `fs` and `isSealedLine` from `./sealed-log`, then:

```ts
const decisionLogPath = () => join(rootDir, 'fleet', AGENT, 'decisions.jsonl');
const legacyLine = (counter: number) => JSON.stringify(entry(counter)) + '\n';

test('writes no decision in clear', () => {
	fleet.appendDecision(AGENT, entry(1));
	const lines = readFileSync(decisionLogPath(), 'utf8').trim().split('\n').map((line) => JSON.parse(line));
	expect(lines.every(isSealedLine)).toBe(true);
	expect(readFileSync(decisionLogPath(), 'utf8')).not.toContain('HOLD');
});

test('reads back what an earlier instance sealed, as after a restart', () => {
	[1, 2].forEach((counter) => fleet.appendDecision(AGENT, entry(counter)));
	expect(new Fleet(join(rootDir, 'fleet')).decisions(AGENT)).toEqual([entry(1), entry(2)]);
});

test('reads a plaintext history followed by sealed lines, in order', () => {
	appendFileSync(decisionLogPath(), legacyLine(1));
	fleet.appendDecision(AGENT, entry(2));
	expect(fleet.decisions(AGENT)).toEqual([entry(1), entry(2)]);
	expect(fleet.decisionLineCounts(AGENT)).toEqual({ sealed: 1, legacy: 1 });
});

test('keeps an unconfirmed entry and the retry with the same counter', () => {
	fleet.appendDecision(AGENT, entry(1, true));
	fleet.appendDecision(AGENT, entry(1));
	expect(fleet.decisions(AGENT)).toEqual([entry(1, true), entry(1)]);
});

test('passes over a sealed line that does not open with the key', () => {
	fleet.appendDecision(AGENT, entry(1));
	const otherKey = new Fleet(join(rootDir, 'fleet'), () => new Uint8Array(32).fill(9));
	expect(otherKey.decisions(AGENT)).toEqual([]);
});

test('reads with the key source it was given', () => {
	fleet.appendDecision(AGENT, entry(1));
	const ownerSide = new Fleet(join(rootDir, 'fleet'), () => TEST_SEAL.dataKey);
	expect(ownerSide.decisions(AGENT)).toEqual([entry(1)]);
});

describe('an agent without a seal', () => {
	const OLD = 'tick-01';

	beforeEach(() => {
		mkdirSync(join(rootDir, 'fleet', OLD));
		writeFileSync(join(rootDir, 'fleet', OLD, 'agent.json'), JSON.stringify({ id: OLD, name: 'Tick', riskLevel: 'LOW', registeredAt: 0 }));
		appendFileSync(join(rootDir, 'fleet', OLD, 'decisions.jsonl'), legacyLine(1));
	});

	test('still reads its plaintext history', () => {
		expect(fleet.isSealed(OLD)).toBe(false);
		expect(fleet.decisions(OLD)).toEqual([entry(1)]);
	});

	test('refuses to append rather than write in clear', () => {
		expect(() => fleet.appendDecision(OLD, entry(2))).toThrow();
		expect(readFileSync(join(rootDir, 'fleet', OLD, 'decisions.jsonl'), 'utf8')).toBe(legacyLine(1));
	});

	test('can be sealed once, then appends sealed lines', () => {
		fleet.addSeal(OLD, TEST_SEAL);
		expect(fleet.isSealed(OLD)).toBe(true);
		fleet.appendDecision(OLD, entry(2));
		expect(fleet.decisions(OLD)).toEqual([entry(1), entry(2)]);
		expect(() => fleet.addSeal(OLD, TEST_SEAL)).toThrow();
	});
});

test('refuses to seal an agent that is not in the fleet', () => {
	expect(() => fleet.addSeal('ghost-01', TEST_SEAL)).toThrow('not in the fleet');
	expect(existsSync(join(rootDir, 'fleet', 'ghost-01'))).toBe(false);
});

test('register keeps the seal it was given', () => {
	expect(fleet.seal(AGENT)).toEqual(TEST_SEAL);
});
```

Note: `entry()` in `fleet.test.ts` uses `agent: AGENT`; the legacy tests for `tick-01` reuse it as-is, since `Fleet`
does not check the record's agent field. Add `describe`, `mkdirSync` to the imports.

- [ ] **Step 4: Run them and watch them fail**

Run: `~/.bun/bin/bun test src/lib/server/modules/fleet/fleet.test.ts`
Expected: FAIL. `register` ignores the seal, `decisionLineCounts`/`isSealed`/`addSeal`/`seal` are not functions, and the
"no decision in clear" test sees plaintext.

- [ ] **Step 5: Implement in `fleet.ts`**

Imports:

```ts
import { loadLogSeal, saveLogSeal, type LogSeal } from './log-seal';
import { isSealedLine, openLine, sealEntry, type SealedLine } from './sealed-log';
```

Update the header comment's file list to include `seal.json` and to say the decision log is sealed:

```ts
// The fleet: what the server knows about each registered agent (name, risk level), the log of its decisions and the
// log of its guard transactions that landed. One directory per agent: <fleetDir>/<agentId>/agent.json, seal.json (the
// log's key, see log-seal.ts), decisions.jsonl (sealed lines, see sealed-log.ts; plaintext lines from before sealing
// are still read) and transactions.jsonl.
```

Add next to the other constants and types:

```ts
const SEAL_FILE = 'seal.json';

/** Where the decision log's AES key comes from: the server reads seal.json, the owner's audit recovers it. */
export type DataKeyOf = (agentId: string) => Uint8Array;
```

Constructor and the new or changed methods (the rest of the class stays as it is):

```ts
	private readonly dataKeyOf: DataKeyOf;

	constructor(
		private readonly fleetDir: string,
		dataKeyOf?: DataKeyOf
	) {
		this.dataKeyOf = dataKeyOf ?? ((agentId) => this.seal(agentId).dataKey);
	}

	register(entry: FleetEntry, seal: LogSeal): void {
		const dir = this.agentDir(entry.id);
		if (existsSync(dir)) throw new Error(`agent ${entry.id} is already in the fleet`);
		mkdirSync(dir, { recursive: true });
		writeFileSync(join(dir, ENTRY_FILE), JSON.stringify(entry, null, 2) + '\n');
		this.addSeal(entry.id, seal);
	}

	/** Seals an agent imported before the log was sealed; its plaintext lines stay readable. */
	addSeal(agentId: string, seal: LogSeal): void {
		if (!this.get(agentId)) throw new Error(`agent ${agentId} is not in the fleet`);
		saveLogSeal(this.sealPath(agentId), seal);
	}

	isSealed(agentId: string): boolean {
		return existsSync(this.sealPath(agentId));
	}

	seal(agentId: string): LogSeal {
		return loadLogSeal(this.sealPath(agentId));
	}

	/** Throws for an agent without a seal: nothing is written in clear. */
	appendDecision(agentId: string, entry: DecisionLogEntry): void {
		this.appendLine(agentId, DECISION_LOG_FILE, sealEntry(this.dataKeyOf(agentId), entry));
	}

	/** How many log lines are sealed and how many are plaintext from before sealing, without opening any. */
	decisionLineCounts(agentId: string): { sealed: number; legacy: number } {
		const lines = this.readLines<unknown>(agentId, DECISION_LOG_FILE);
		const sealed = lines.filter(isSealedLine).length;
		return { sealed, legacy: lines.length - sealed };
	}
```

Replace `readLog` and add `openOrSkip` and `sealPath`:

```ts
	/** The data key is read only when a sealed line needs it, so an unsealed agent's plaintext log still reads. */
	private readLog(agentId: string): DecisionLogEntry[] {
		const lines = this.readLines<SealedLine | DecisionLogEntry>(agentId, DECISION_LOG_FILE);
		let dataKey: Uint8Array | undefined;
		return lines.flatMap((line) => {
			if (!isSealedLine(line)) return [line];
			dataKey ??= this.dataKeyOf(agentId);
			return openOrSkip(agentId, dataKey, line);
		});
	}

	private sealPath(agentId: string): string {
		return join(this.agentDir(agentId), SEAL_FILE);
	}
```

And next to `parseLogLine` at the bottom:

```ts
/** A line that does not open with the key is reported and passed over; the audit then misses its step. */
function openOrSkip(agentId: string, dataKey: Uint8Array, line: SealedLine): DecisionLogEntry[] {
	try {
		return [openLine(dataKey, line)];
	} catch {
		console.warn(`${agentId}: skipping a decision log line (counter ${line.counter}) that does not open with the key`);
		return [];
	}
}
```

- [ ] **Step 6: Run the fleet tests, then the whole suite**

Run: `~/.bun/bin/bun test src/lib/server/modules/fleet/` then `~/.bun/bin/bun test src agents scripts`
Expected: all pass. `bun test` does not type-check; run `~/.bun/bin/bun run check` and expect the baseline error count
(see Global Constraints) plus nothing in the files this task touched. `scripts/fleet.ts` still calls `register` with one
argument; that is fixed in Task 4.

- [ ] **Step 7: Commit**

```bash
git add src/lib/server/modules/fleet/
git commit -m "fleet: log decyzji zapieczetowany - dopisywanie szyfruje kluczem z seal.json, odczyt otwiera, stare jawne wiersze dalej czytane, bez pieczeci dopisanie odmawia"
```

---

### Task 4: Owner key and sealing from `scripts/fleet.ts`

**Files:**
- Modify: `src/lib/server/modules/agent/config.ts`, `src/lib/server/modules/agent/config.test.ts`
- Modify: `scripts/fleet.ts`
- Modify: `.env.example`

**Interfaces:**
- Consumes: `createOwnerKemKey`, `saveOwnerKemKey`, `loadOwnerKemKey`, `createLogSeal` (Task 1); `Fleet.register(entry,
  seal)`, `Fleet.addSeal`, `Fleet.get` (Task 3).
- Produces:
  - `AgentConfig.ownerKemPath: string` (env `OWNER_MLKEM_FILE`, default `.devnet/owner-mlkem.json`)
  - CLI `bun scripts/fleet.ts owner-key` (creates the owner key file if missing; prints its path)
  - CLI `bun scripts/fleet.ts seal <id>`
  - `bun scripts/fleet.ts import …` seals the new agent

- [ ] **Step 1: Write the failing config tests**

In `config.test.ts`, add `ownerKemPath: '.devnet/owner-mlkem.json'` to the expected object of the existing
`'applies defaults for devnet'` test (after `ownerPath: undefined`), and add inside the same `describe`:

```ts
	it('reads the owner ML-KEM key file from OWNER_MLKEM_FILE', () => {
		expect(loadConfig({ ...REQUIRED, OWNER_MLKEM_FILE: '/keys/owner.json' }).ownerKemPath).toBe('/keys/owner.json');
	});
```

- [ ] **Step 2: Run and watch them fail**

Run: `~/.bun/bin/bun test src/lib/server/modules/agent/config.test.ts`
Expected: FAIL, `ownerKemPath` is `undefined`.

- [ ] **Step 3: Implement in `config.ts`**

Add to `AgentConfig`:

```ts
	/** The owner's ML-KEM-768 key pair: its public key seals new agents' logs, its secret key opens them in the audit. */
	ownerKemPath: string;
```

to `DEFAULTS`: `ownerKemPath: '.devnet/owner-mlkem.json'`, and to `loadConfig`:
`ownerKemPath: env.OWNER_MLKEM_FILE ?? DEFAULTS.ownerKemPath,`.

- [ ] **Step 4: Run and watch them pass**

Run: `~/.bun/bin/bun test src/lib/server/modules/agent/config.test.ts`
Expected: pass.

- [ ] **Step 5: Rewrite `scripts/fleet.ts` with three commands**

```ts
// Manages the fleet (.devnet/fleet/<id>/). Run from the repo root.
//   owner-key: creates the owner's ML-KEM-768 key file (OWNER_MLKEM_FILE) if it is missing.
//   import:    puts an agent registered on devnet into the fleet, e.g. .devnet/agent.json from
//              `bun scripts/agent.ts register`; copies its keys into .devnet/fleet/<id>/onchain.json and seals its
//              decision log to the owner's key.
//   seal:      seals the decision log of an agent imported before logs were sealed.
import { existsSync } from 'fs';
import { parseArgs } from 'util';
import { loadConfig } from '../src/lib/server/modules/agent/config';
import { loadAgentFile, saveAgentFile } from '../src/lib/server/modules/agent/files';
import { fetchAgent } from '../src/lib/server/modules/agent/guard-client';
import { Fleet, type RiskLevel } from '../src/lib/server/modules/fleet/fleet';
import { createLogSeal, createOwnerKemKey, loadOwnerKemKey, saveOwnerKemKey } from '../src/lib/server/modules/fleet/log-seal';
import { FLEET_DIR, guardClientFrom, onchainIdentityPath } from '../src/lib/server/modules/fleet/runtime';

const USAGE = [
	'Usage: bun scripts/fleet.ts owner-key',
	'       bun scripts/fleet.ts import <agent file> --as <id> --name "<name>" [--risk LOW (default)|MEDIUM|HIGH|CRITICAL]',
	'       bun scripts/fleet.ts seal <id>'
].join('\n');
const RISK_LEVELS: readonly RiskLevel[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const DEFAULT_RISK: RiskLevel = 'LOW';

const { positionals, values } = parseArgs({
	allowPositionals: true,
	options: { name: { type: 'string' }, as: { type: 'string' }, risk: { type: 'string', default: DEFAULT_RISK } }
});
const [command, argument] = positionals;
const config = loadConfig(process.env);
const fleet = new Fleet(FLEET_DIR);

function fail(message: string): never {
	console.error(`${message}\n${USAGE}`);
	process.exit(1);
}

if (command === 'owner-key') createOwnerKey();
else if (command === 'import') await importAgent(argument ?? fail('the agent file is required'));
else if (command === 'seal') sealAgent(argument ?? fail('the agent id is required'));
else fail(`unknown command ${command ?? ''}`);

function createOwnerKey(): void {
	if (existsSync(config.ownerKemPath)) return console.log(`owner ML-KEM key ${config.ownerKemPath} exists`);
	saveOwnerKemKey(config.ownerKemPath, createOwnerKemKey());
	console.log(`owner ML-KEM-768 key written to ${config.ownerKemPath}; its secret key is the only way to read the logs`);
}

/** A new seal for each agent: a fresh ML-KEM capsule to the owner's public key, and the AES key it carries. */
function newSeal() {
	if (!existsSync(config.ownerKemPath)) fail(`${config.ownerKemPath} is missing; run: bun scripts/fleet.ts owner-key`);
	return createLogSeal(loadOwnerKemKey(config.ownerKemPath).publicKey);
}

async function importAgent(agentFilePath: string): Promise<void> {
	const riskLevel = values.risk as RiskLevel;
	if (!RISK_LEVELS.includes(riskLevel)) fail(`unknown risk level ${values.risk}`);
	const id = values.as ?? fail('--as <id> is required');
	const name = values.name ?? fail('--name is required');
	const agentFile = loadAgentFile(agentFilePath);
	const seal = newSeal();
	// Proves the agent exists on this cluster and belongs to GUARD_PROGRAM_ID before anything is written.
	const state = await fetchAgent(guardClientFrom(config), agentFile.agent);
	if (state.owner !== agentFile.owner) fail(`on-chain owner ${state.owner} differs from the agent file's ${agentFile.owner}`);
	fleet.register({ id, name, riskLevel, registeredAt: Date.now() }, seal);
	saveAgentFile(onchainIdentityPath(id), agentFile);
	console.log(`imported ${agentFile.agent} as ${id}: owner ${state.owner}, ${state.status}, counter ${state.counter}, log sealed`);
}

function sealAgent(id: string): void {
	if (!fleet.get(id)) fail(`agent ${id} is not in the fleet`);
	if (fleet.isSealed(id)) return console.log(`${id} is already sealed`);
	fleet.addSeal(id, newSeal());
	console.log(`${id}: decision log sealed to the owner's ML-KEM-768 key; earlier plaintext lines stay readable`);
}
```

- [ ] **Step 6: Add the variable to `.env.example`**

After the `OWNER_KEYPAIR` line:

```sh
# The owner's ML-KEM-768 key pair (created by setup or `bun scripts/fleet.ts owner-key`): new agents' decision logs are
# sealed to its public key, and the audit opens them with its secret key.
OWNER_MLKEM_FILE=.devnet/owner-mlkem.json
```

- [ ] **Step 7: Smoke-test the script offline**

Run, from the worktree (with a scratch fleet so nothing shared is touched):

```bash
SCRATCH=$(mktemp -d)
GUARD_PROGRAM_ID=BL6Fjh4pADgjvZwaueeAcc7rYddFrdMNWnqK73x78ZSs FEE_PAYER_KEYPAIR=x OWNER_MLKEM_FILE=$SCRATCH/owner.json \
  ~/.bun/bin/bun scripts/fleet.ts owner-key && ls -l $SCRATCH/owner.json
GUARD_PROGRAM_ID=BL6Fjh4pADgjvZwaueeAcc7rYddFrdMNWnqK73x78ZSs FEE_PAYER_KEYPAIR=x OWNER_MLKEM_FILE=$SCRATCH/owner.json \
  ~/.bun/bin/bun scripts/fleet.ts owner-key
GUARD_PROGRAM_ID=BL6Fjh4pADgjvZwaueeAcc7rYddFrdMNWnqK73x78ZSs FEE_PAYER_KEYPAIR=x \
  ~/.bun/bin/bun scripts/fleet.ts seal ghost-01; echo "exit $?"
rm -rf $SCRATCH
```

Expected: first run writes the file with `-rw-------`; second prints "exists"; `seal ghost-01` prints "not in the
fleet" and exits 1. Run `~/.bun/bin/bun run check`: no new errors (see Global Constraints).

- [ ] **Step 8: Run the whole suite and commit**

Run: `~/.bun/bin/bun test src agents scripts`
Expected: all pass.

```bash
git add src/lib/server/modules/agent/config.ts src/lib/server/modules/agent/config.test.ts scripts/fleet.ts .env.example
git commit -m "scripts: fleet.ts owner-key i seal, import pieczetuje log do klucza ML-KEM-768 wlasciciela; OWNER_MLKEM_FILE"
```

---

### Task 5: Setup creates the owner key and seals agents; audit opens with the owner's key

**Files:**
- Modify: `scripts/setup-plan.ts`, `scripts/setup-plan.test.ts`
- Modify: `scripts/setup.ts`
- Modify: `scripts/audit.ts`

**Interfaces:**
- Consumes: `Fleet` (`isSealed`, `seal`, `decisions`, `decisionLineCounts`, `DataKeyOf`) (Task 3); `loadOwnerKemKey`,
  `recoverDataKey` (Task 1); `AgentConfig.ownerKemPath`, `fleet.ts owner-key` / `seal` (Task 4).
- Produces: `AgentProgress.sealed: boolean`; `AgentStep` gains `'seal'`.

- [ ] **Step 1: Write the failing setup-plan tests**

Replace the fixtures and add tests in `scripts/setup-plan.test.ts`:

```ts
const fresh: AgentProgress = { registered: false, imported: false, sealed: false };
const registered: AgentProgress = { registered: true, imported: false, sealed: false };
const done: AgentProgress = { registered: true, imported: true, sealed: true };
const importedBeforeSealing: AgentProgress = { registered: true, imported: true, sealed: false };
```

Change `{ registered: false, imported: true }` in the existing test to `{ registered: false, imported: true, sealed: true }`,
and add:

```ts
test('an agent imported before logs were sealed is only sealed', () => {
	expect(stepsFor(importedBeforeSealing)).toEqual(['seal']);
});

test('a sealed agent is never sealed again', () => {
	expect(stepsFor(done)).not.toContain('seal');
});

test('sealing costs no SOL', () => {
	expect(lamportsNeeded([importedBeforeSealing])).toBe(0n);
});
```

- [ ] **Step 2: Run and watch them fail**

Run: `~/.bun/bin/bun test scripts/setup-plan.test.ts`
Expected: FAIL on the `['seal']` test (returns `[]`).

- [ ] **Step 3: Implement in `setup-plan.ts`**

```ts
export interface AgentProgress {
	/** Its agent file exists: the on-chain account was created. */
	readonly registered: boolean;
	/** Its fleet directory exists: the server runs it. */
	readonly imported: boolean;
	/** Its decision log has a seal (import seals; agents imported before that need `seal`). */
	readonly sealed: boolean;
}

export type AgentStep = 'register' | 'import' | 'seal';

export function stepsFor({ registered, imported, sealed }: AgentProgress): AgentStep[] {
	if (imported) return sealed ? [] : ['seal'];
	return registered ? ['import'] : ['register', 'import'];
}
```

`lamportsNeeded` stays as it is (it only counts `register`). Update the header comment's "Only registration costs SOL;
importing is local." to "Only registration costs SOL; importing and sealing are local."

- [ ] **Step 4: Run and watch them pass**

Run: `~/.bun/bin/bun test scripts/setup-plan.test.ts`
Expected: pass.

- [ ] **Step 5: Wire it into `scripts/setup.ts`**

Imports: add `import { Fleet } from '../src/lib/server/modules/fleet/fleet';`.

After `await ensureFunded(...)` and before the agent loop:

```ts
runBun(['scripts/fleet.ts', 'owner-key']);
```

(`fleet.ts owner-key` is idempotent, so it runs every time; it must come before any `import` or `seal`.)

`runStep`:

```ts
function runStep(agent: SetupAgent, step: AgentStep): void {
	if (step === 'register') runBun(['scripts/agent.ts', 'register'], { AGENT_FILE: agentFile(agent) });
	else if (step === 'seal') runBun(['scripts/fleet.ts', 'seal', agent.id]);
	else runBun(['scripts/fleet.ts', 'import', agentFile(agent), '--as', agent.id, '--name', agent.name, '--risk', agent.risk]);
}
```

`progressOf`:

```ts
function progressOf(agent: SetupAgent): AgentProgress {
	const imported = existsSync(join(FLEET_DIR, agent.id));
	return { registered: existsSync(agentFile(agent)), imported, sealed: imported && new Fleet(FLEET_DIR).isSealed(agent.id) };
}
```

Update the header comment's first line to mention the owner key: "First-time devnet setup: .env, the payer wallet, its
SOL, the owner's ML-KEM key and the two agents (registered on chain, imported into the fleet, their logs sealed)."

- [ ] **Step 6: Make `scripts/audit.ts` open the log with the owner's key**

Imports: add `loadOwnerKemKey`, `recoverDataKey` from `../src/lib/server/modules/fleet/log-seal`.

Replace the `auditHistory(...)` line with:

```ts
const log = ownerFleet().decisions(agentId);
const report = auditHistory({ agent, state, events, log });
printReport(agent, state, report);
```

Add:

```ts
/**
 * The fleet as the owner reads it: each log key recovered from the seal's ML-KEM capsule with the owner's secret key,
 * never taken from the server's stored copy. The owner key is loaded only when a sealed line needs it.
 */
function ownerFleet(): Fleet {
	const stored = new Fleet(FLEET_DIR);
	return new Fleet(FLEET_DIR, (id) => recoverDataKey(stored.seal(id).kemCiphertext, loadOwnerKemKey(config.ownerKemPath).secretKey));
}
```

`config` is `loadConfig()`; the script currently inlines it into `guardClientFrom(loadConfig())`, so hoist it:
`const config = loadConfig();` and `const client = guardClientFrom(config);`.

In `printReport`, after the `on-chain:` line:

```ts
	const lines = new Fleet(FLEET_DIR).decisionLineCounts(agentId);
	console.log(`log file: ${lines.sealed} lines sealed (opened with the owner's ML-KEM key), ${lines.legacy} plaintext from before sealing`);
```

Update the header comment: "…checks that each on-chain hash is backed by a log record that still hashes to it. Sealed
log lines are opened with the owner's ML-KEM-768 secret key (OWNER_MLKEM_FILE), not with the server's copy of the key."

- [ ] **Step 7: Run the whole suite and type-check**

Run: `~/.bun/bin/bun test src agents scripts` and `~/.bun/bin/bun run check`
Expected: all tests pass; no new type errors (see Global Constraints).

- [ ] **Step 8: Commit**

```bash
git add scripts/setup-plan.ts scripts/setup-plan.test.ts scripts/setup.ts scripts/audit.ts
git commit -m "scripts: setup tworzy klucz ML-KEM wlasciciela i pieczetuje agentow; audyt otwiera log kluczem wlasciciela, nie kopia serwera"
```

---

### Task 6: Live check on a copy of devnet state

The shared `.devnet/` belongs to the running checkout and to other sessions: the `owner_pq_key` work will move these
agents to a legacy directory, and a server on old code would misread sealed lines. So the live check runs on a copy.

**Files:** none committed.

- [ ] **Step 1: Copy the state into the worktree**

```bash
cp -a /storage1/mydes/SolanaHackaton/.devnet .devnet && cp /storage1/mydes/SolanaHackaton/.env .env
ls .devnet/fleet
```

Expected: `sentinel-01  tick-01` (both gitignored in the worktree too; check `git status --short` shows nothing new).

- [ ] **Step 2: Create the owner key and seal both agents**

```bash
~/.bun/bin/bun scripts/fleet.ts owner-key
~/.bun/bin/bun scripts/fleet.ts seal sentinel-01 && ~/.bun/bin/bun scripts/fleet.ts seal tick-01
~/.bun/bin/bun scripts/fleet.ts seal tick-01
```

Expected: key written; both sealed; the repeat prints "already sealed".

- [ ] **Step 3: Run the server and one Tick step**

First make sure no other server or agent is stepping `tick-01` (two senders would race for the same counter):
`pgrep -af 'agents/tick|vite|demo.ts'` must list nothing. If it does, stop and ask the user.

```bash
~/.bun/bin/bun run dev --port 5199 &   # background
~/.bun/bin/bun agents/tick             # stop it with Ctrl+C after one "step recorded" line
curl -s localhost:5199/api/agents | head -c 1500
tail -n 2 .devnet/fleet/tick-01/decisions.jsonl
```

Expected: the API lists both agents with their latest decisions (old plaintext history still shown); the last line of
`tick-01`'s log is `{"counter":…,"nonce":…,"ciphertext":…,"tag":…}` with no `"record"`. Stop the dev server.

If `agents/tick` needs other env or flags, read `agents/tick/README.md`; the goal is exactly one recorded step.

- [ ] **Step 4: Audit with the owner's key**

```bash
~/.bun/bin/bun scripts/audit.ts tick-01
```

Expected: `log file: 1 lines sealed (…), N plaintext from before sealing` and `history OK`.

- [ ] **Step 5: Show that the wrong owner key fails the audit**

```bash
mv .devnet/owner-mlkem.json .devnet/owner-mlkem.real.json
OWNER_MLKEM_FILE=.devnet/owner-mlkem.json ~/.bun/bin/bun scripts/fleet.ts owner-key
~/.bun/bin/bun scripts/audit.ts tick-01; echo "exit $?"
rm .devnet/owner-mlkem.json && mv .devnet/owner-mlkem.real.json .devnet/owner-mlkem.json
```

Expected: a "skipping a decision log line … does not open" warning, the sealed step reported as "on-chain, but not in
the log", exit 1.

- [ ] **Step 6: Clean up**

```bash
rm -rf .devnet .env
git status --short
```

Expected: clean. The tick step recorded in Step 3 is real and on devnet; the shared `.devnet/fleet/tick-01` log does
not have it, so the shared audit will report it as "on-chain, but not in the log" until the agents are re-registered
by the `owner_pq_key` migration. Tell the user this in the report.

---

### Task 7: Decision 006 and README

**Files:**
- Create: `spec/decisions/006-zapieczetowany-log-decyzji-ml-kem.md`
- Modify: `README.md`

- [ ] **Step 1: Write the decision** (Polish, same layout as `003-…`: Kontekst, Decyzja, Uzasadnienie, Odrzucone)

```markdown
# 006: Zapieczętowany log decyzji: ML-KEM-768 do właściciela, AES-256-GCM per agent

Data: 2026-10-11

## Kontekst

Łańcuch przechowuje tylko SHA-256 każdej decyzji. Pełne decyzje leżą na serwerze w `.devnet/fleet/<id>/decisions.jsonl`,
dotąd jawnym tekstem. Kopia tego pliku (backup, udostępniony katalog, wyciek) zdradzała całą historię agenta.

## Decyzja

- Właściciel ma parę kluczy ML-KEM-768 (`OWNER_MLKEM_FILE`, domyślnie `.devnet/owner-mlkem.json`).
- Każdy agent floty dostaje pieczęć (`seal.json`): kapsułkę ML-KEM-768 do klucza publicznego właściciela i klucz danych
  AES-256 = HKDF-SHA256(wspólny sekret, `onchain-agent-guard:decision-log:v1`).
- Każdy wiersz logu to AES-256-GCM pod kluczem danych, z losowym nonce i licznikiem kroku jako AAD. Jawny jest tylko
  licznik.
- Hash na łańcuchu liczony jest z jawnej decyzji, jak dotąd. Program i transakcje się nie zmieniają.
- Audyt (`scripts/audit.ts`) odzyskuje klucz danych z kapsułki kluczem prywatnym właściciela, nie bierze kopii serwera.

## Uzasadnienie

- **Odporność na „zbierz teraz, odszyfruj później”.** Klucz danych jest opakowany tylko przez ML-KEM-768, a AES-256
  zachowuje około 128 bitów bezpieczeństwa wobec algorytmu Grovera.
- **Serwer musi czytać własny log.** Strona pokazuje decyzje, a serwer przeżywa restart, więc trzyma klucz danych w
  `seal.json`. Dlatego szyfrowanie nie chroni przed przejęciem serwera, tylko przed kopią logu, która z niego wyszła.
- **Łańcuch nic nie zdradza.** Hash z jawnego tekstu nie mówi, czy i jak log jest szyfrowany, a podmieniony wiersz i tak
  nie przejdzie audytu.
- Ta decyzja urzeczywistnia zdanie z decyzji 002 o ML-KEM używanym do szyfrowania.

## Odrzucone

- **Szyfrogram on-chain (SPL Memo).** Większe transakcje i opłaty, a zysk dla pokazu niewielki.
- **Nowa kapsułka przy każdym restarcie serwera.** Czystsze, ale dzieli log na segmenty i komplikuje audyt.
- **Szyfrowanie plików kluczy hasłem.** Pytanie o hasło przy każdym starcie serwera psuje pokaz.
```

- [ ] **Step 2: README**

After the "Program design:" line, add:

```markdown
Decision log: each agent's decisions in `.devnet/fleet/<id>/decisions.jsonl` are sealed with AES-256-GCM under a key
wrapped with ML-KEM-768 to the owner, so a copy of the log is unreadable now and after Q-day; only the SHA-256 of each
decision goes on-chain. The server keeps the key to show the decisions, so this does not protect a compromised server.
Design: [docs/superpowers/specs/2026-10-11-sealed-decision-log-design.md](docs/superpowers/specs/2026-10-11-sealed-decision-log-design.md),
decision: [spec/decisions/006-zapieczetowany-log-decyzji-ml-kem.md](spec/decisions/006-zapieczetowany-log-decyzji-ml-kem.md).
```

In "Quick start", change the `setup.ts` paragraph's last sentence to: "Last, it creates the owner's ML-KEM-768 key
(`OWNER_MLKEM_FILE`), registers `sentinel-01` and `tick-01` (agent files in `.devnet/agents/`), imports them into the
fleet and seals their decision logs."

In "A real agent on devnet, by hand", before the `fleet.ts import` line, add:

```sh
bun scripts/fleet.ts owner-key   # once: the owner's ML-KEM-768 key, .devnet/owner-mlkem.json
```

and after the block, one line: "An agent imported before logs were sealed: `bun scripts/fleet.ts seal <id>`; its earlier
plaintext lines stay readable."

Where the README describes `scripts/audit.ts` (search for `audit.ts`), add: "Sealed lines are opened with the owner's
ML-KEM secret key, not the server's copy."

- [ ] **Step 3: Commit**

```bash
git add spec/decisions/006-zapieczetowany-log-decyzji-ml-kem.md README.md
git commit -m "spec: decyzja 006 - zapieczetowany log decyzji ML-KEM-768 + AES-256-GCM; readme: co chroni, owner-key i seal"
```

---

### Task 8: Final verification

- [ ] **Step 1:** `~/.bun/bin/bun test src agents scripts` → all pass; note the new count (282 + new tests).
- [ ] **Step 2:** `~/.bun/bin/bun run check` → no errors beyond the 92 of the baseline.
- [ ] **Step 3:** `git log --oneline origin/main..sealed_log` → spec commits plus Tasks 1–5 and 7.
- [ ] **Step 4:** Do not push or open a PR without the user's go.
