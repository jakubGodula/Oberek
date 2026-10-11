# Design: sealed decision log (ML-KEM-768 + AES-256-GCM)

Date: 2026-10-11. Branch: `sealed_log` (off `main` at `19ceb18`). Status: design approved in brainstorming, awaiting
spec review.

## Goal

A fleet agent's decision log (`.devnet/fleet/<id>/decisions.jsonl`) holds every decision in plain JSON today. After this
change no plaintext decision is written to disk: each entry is encrypted with a per-agent AES-256-GCM data key, and that
key is wrapped with ML-KEM-768 to the owner's public key. The owner's audit decrypts with the owner's ML-KEM secret key
and checks the log against the chain as before.

The program, the transactions and the on-chain hash do not change: `decisionHash` stays SHA-256 of the plaintext record,
so the chain does not reveal whether or how the log is encrypted, and a swapped line on disk still fails the audit.

## What it protects, and what it does not

- Protects: a copy of `decisions.jsonl` on its own that leaves the server (backup, shared file, log shipping) reveals
  nothing, now or after Q-day: AES-256 keeps ~128-bit security against Grover.
- ML-KEM-768's part: the owner opens the logs with the owner's own secret key, without the server's copy of the data
  key, and that wrapping stays secure after Q-day.
- Does not protect: a compromised server, nor a copy of the whole agent directory. `seal.json` holds the data key next
  to the capsule, because the server must read the log back for the GUI and across restarts.

## Scope

In: owner ML-KEM key file, per-agent seal file, sealed `Fleet` log, audit with the owner's key, `scripts/fleet.ts seal`,
setup step, decision 006, README.

Out (can be added later): the old single-agent TICK loop's `.devnet/decisions.jsonl` (`scripts/agent.ts`); an ML-KEM row
in the GUI; ciphertext on-chain in an SPL Memo; re-encapsulating per restart; encrypting the key files at rest.

## Keys

| File | Mode | Contents | Written by | Read by |
|---|---|---|---|---|
| `.devnet/owner-mlkem.json` (`OWNER_MLKEM_FILE`) | 0600, `wx` | `{ publicKey, secretKey }`, base64, ML-KEM-768 | setup, once | `fleet.ts` (public key), `audit.ts` (secret key) |
| `.devnet/fleet/<id>/seal.json` | 0600, `wx` | `{ kemCiphertext, dataKey }`, base64; capsule 1,088 B, key 32 B | `fleet.ts import` / `fleet.ts seal` | server (`dataKey`), `audit.ts` (`kemCiphertext`) |

`dataKey` = HKDF-SHA256(ikm = ML-KEM shared secret, salt = empty, info = `onchain-agent-guard:decision-log:v1`, 32 B).
The seal file is separate from `onchain.json` so the `AgentFile` format, shared with `scripts/agent.ts`, stays as it is.
`wx` on both files: neither can be overwritten, so a key cannot be swapped under an existing log.

## Log format

A sealed line: `{ "counter": n, "nonce": b64(12 B), "ciphertext": b64, "tag": b64(16 B) }`.

- Plaintext: the whole `DecisionLogEntry` (`{ record, decisionHash, unconfirmed? }`) as JSON.
- AES-256-GCM, random 12 B nonce per line, AAD = `counter` as u64 LE. `counter` is the record's counter, kept in clear
  so a line opened under the wrong counter fails authentication.
- A line without `ciphertext` is a legacy plaintext entry and is read as before, so agents already on devnet keep
  their history. New lines are always sealed.
- A line that does not authenticate is skipped with a warning, like a line that is not JSON today. The audit then
  reports its step as "on-chain, but not in the log".

## Units

| Unit | Change |
|---|---|
| `fleet/log-seal.ts` (new) | `createLogSeal(ownerPublicKey)` → `{ kemCiphertext, dataKey }`; `recoverDataKey(kemCiphertext, ownerSecretKey)`; `saveLogSeal` / `loadLogSeal` (0600, `wx`); owner key file `createOwnerKemKey` / `saveOwnerKemKey` / `loadOwnerKemKey`. ML-KEM-768 from `@noble/post-quantum/ml-kem.js`, HKDF and AES from `crypto` |
| `fleet/sealed-log.ts` (new) | `sealEntry(dataKey, entry)` → sealed line; `openLine(dataKey, line)` → entry; `isSealedLine(line)` |
| `fleet/fleet.ts` | `new Fleet(fleetDir, dataKeyOf?)`, default reads `dataKey` from the agent's `seal.json`; `register(entry, seal)` also writes `seal.json`; new `addSeal(agentId, seal)`; `appendDecision` seals; the log reader opens sealed lines and passes legacy ones through. `transactions.jsonl` stays plain (it only holds what is public on-chain) |
| `agent/config.ts` | `ownerKemPath` from `OWNER_MLKEM_FILE`, default `.devnet/owner-mlkem.json` |
| `scripts/fleet.ts` | `import` creates the seal from the owner's public key; new `seal <id>` for an agent imported before this change |
| `scripts/audit.ts` | builds `Fleet` with `dataKeyOf = recoverDataKey(seal.kemCiphertext, owner secretKey)`, never the stored `dataKey`; prints how many lines are sealed and how many legacy |
| `scripts/setup.ts`, `setup-plan.ts` | creates the owner key file when missing; new `seal` step for an imported agent without `seal.json` |
| `.env.example` | `OWNER_MLKEM_FILE` |

`zk-pqc/pqc-crypto.service.ts` is not reused: it is an unused class from the Open Mercato days that mixes ML-KEM with an
SHA3 commitment the project dropped.

## Testing

Strict TDD, red first, `bun test`.

- `sealed-log`: round trip; wrong key, wrong counter (AAD), flipped ciphertext and flipped tag all fail.
- `log-seal`: `recoverDataKey` with the owner's secret key gives the same `dataKey` as `createLogSeal`; another owner's
  secret key gives a different one; seal and owner key files are 0600 and refuse to overwrite.
- `fleet`: a decision appended to a sealed agent leaves no plaintext in `decisions.jsonl` and reads back unchanged; a
  legacy plaintext line still reads; a line that does not authenticate is skipped; `dataKeyOf` override is used.
- `setup-plan`: `seal` step for an imported agent without a seal, none for one with it.
- Existing fleet tests register agents with a test seal.
- Live: `fleet.ts seal` on `sentinel-01` and `tick-01`, the GUI still shows their latest decisions, new lines in
  `decisions.jsonl` are sealed, `bun scripts/audit.ts sentinel-01` reports history OK.

## Docs

- `spec/decisions/006-zapieczetowany-log-decyzji-ml-kem.md`: the sealed log, what it protects and what not, why the
  server keeps `dataKey`. It makes decision 002's line 21 ("ML-KEM, którego projekt używa do szyfrowania") true, so
  002 stays as it is. Number 005 is taken by the owner key work on `owner_pq_key`.
- `README.md`: a short note on what ML-KEM-768 protects. The GUI labels on `gui_labels` that remove ML-KEM get fixed
  when that branch is rebased.
