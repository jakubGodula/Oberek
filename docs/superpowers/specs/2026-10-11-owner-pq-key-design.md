# Design: owner's ML-DSA-44 key activates every agent (`onchain_agent_guard` v2)

Date: 2026-10-11. Branch: `owner_pq_key` (off `gui_labels`). Status: approved in brainstorming, awaiting spec review.

## Goal

Close the "Not quantum-resistant yet (WIP)" points in `README.md`:

1. `register_agent` takes only the owner's Ed25519 signature, so a quantum attacker who forges it can register a fake
   agent in the owner's name. After this change no agent can take a step until the owner's ML-DSA-44 key approves it
   on-chain.
2. The devnet program is upgradeable by an Ed25519 key. It is deployed immutable (`--final`) as the very last step.

Builds on `docs/superpowers/specs/2026-10-10-pq-agent-program-design.md`; everything not named here stays as it is.

## Scope

In: program changes, TS client, owner key file, CLI and setup, tests, in-place upgrade on devnet, re-registration of
`sentinel-01` and `tick-01`, decision 005, README.

Out: an owner ML-DSA signature on `kill` (kept Ed25519-only on purpose, see README), owner key rotation, signing in a
browser wallet (no wallet signs ML-DSA), closing the legacy agents' accounts.

## Why two transactions

One `register_agent` carrying both the agent's public key (1,312 B) and the owner's signature (2,420 B) comes to
~4,190 B, over the 4,096 B V1 transaction limit; it would also need ~1.36M of the 1.4M CU (key preparation ~1.09M +
verification ~0.27M). So registration stays as today and activation is a separate transaction the size of a resume.
The owner signs the agent address, which is known before the first transaction, so both are sent back to back.

## 1. Program

### Accounts

| Account | Kind | Size | Contents |
|---|---|---|---|
| `AgentKey` | unchanged | 20,552 B | agent's prepared ML-DSA-44 public key |
| `OwnerKey` | `zero_copy`, keypair address, created by the client | 20,552 B | owner's prepared ML-DSA-44 public key |
| `OwnerRecord` | PDA, seeds `["owner", owner]` | 8 + 65 B | `owner: Pubkey`, `owner_key: Pubkey`, `bump: u8` |
| `Agent` | unchanged layout | 8 + 106 B | `status` gains `Pending` |

`OwnerKey` is a separate type from `AgentKey` (own discriminator), so an agent's key account cannot be passed as an
owner key. `OwnerRecord` is not named `Owner` (that name is an Anchor trait).

`AgentStatus` = `Active` (0), `Killed` (1), `Pending` (2): appended, so existing accounts still decode.

### Instructions

| Instruction | Signers | Accounts | Effect |
|---|---|---|---|
| `register_owner(public_key)` | owner (Ed25519) | owner, owner_key (`zero`), owner_record (`init`), system | prepares the owner key; a second call fails at `init`, so the key cannot be replaced |
| `register_agent(public_key)` | owner (Ed25519) | unchanged | as today, but the agent starts `Pending` |
| `activate_agent(signature)` | none (fee payer only) | agent (mut), owner_record (seeds `["owner", agent.owner]`, `has_one = owner_key`), owner_key | requires `Pending`; verifies the owner's signature over `activate_message(agent)`; sets `Active`; emits `AgentActivated { agent, counter }` |
| `record_step` | unchanged | unchanged | on `Pending` fails with the new `AgentPending` (today it would say `AgentKilled`) |
| `kill`, `resume` | unchanged | unchanged | on `Pending` they fail with the existing `AgentNotActive` / `AgentNotKilled` |

`activate_message(agent)` = header with tag 3, the agent address, counter 0 (same layout as step/resume, same FIPS 204
context `onchain-agent-guard:v1`). The agent address binds both owner and agent key; activation cannot repeat because
nothing returns an agent to `Pending`. The counter stays 0, so step 1 still moves it to 1.

New errors (appended): `AgentNotPending`, `AgentPending`. A malformed owner key fails with the existing
`InvalidPublicKey`; a wrong owner record or key account fails Anchor's own seeds, `has_one` and discriminator checks.

### Remaining Ed25519 trust

The first `register_owner` per wallet is Ed25519-only: whoever registers first owns the record. We register it now,
before Q-day; after that a forged Ed25519 signature can neither replace the owner key nor activate an agent.

## 2. Client and scripts

| Unit | Change |
|---|---|
| `message.ts` + `message.rs` | `activateMessage(agent)` / `activate_message`; new `activateMessage` case in `onchain/fixtures/message-vector.json`, checked on both sides |
| `instructions.ts` | `'Pending'` in `AGENT_STATUSES`; `OWNER_KEY_ACCOUNT_SIZE = 20_552n`; `findOwnerRecordAddress(program, owner)`; `registerOwnerInstruction`, `activateAgentInstruction`; discriminators checked by `idl.test.ts` |
| `events.ts` | parses `AgentActivated` |
| `guard-errors.ts` | the two new codes |
| `guard-client.ts` | `registerOwner` (create_account + register_owner, 1,400,000 CU), `activateAgent` (400,000 CU) |
| `files.ts` | owner key file `{ owner, ownerKey, mldsaSecretKey }`, mode 0600, saved write-ahead like the agent file (it holds the only copy of the key) |
| `config.ts` | `OWNER_MLDSA_FILE`, default `.devnet/owner-mldsa.json` |
| `scripts/agent.ts` | new `register-owner` (once per owner); `register` sends register then activate; new `activate` retries the second transaction; `status` shows `Pending` |
| `scripts/setup.ts`, `setup-plan.ts` | registers the owner key first when its file is missing; adds its ~0.15 SOL to the funding estimate |
| `agent-loop.ts` | `Pending` pauses like `Killed`, logging "awaiting owner activation" |
| `agent-guard/guard.ts`, `blink.service.ts` | `GuardStatus` gains `Pending`; the card shows `PAUSED` |
| `.env.example` | `OWNER_MLDSA_FILE` |

The owner's ML-DSA secret key lives on the server next to `payer.json`: the owner is the server's wallet today and
no wallet signs ML-DSA.

## 3. Migration on devnet

1. `onchain/deploy-devnet.sh`: upgrade in place at `BL6Fjh4pADgjvZwaueeAcc7rYddFrdMNWnqK73x78ZSs`.
2. Move `.devnet/agents/*.json` and `.devnet/fleet/{sentinel-01,tick-01}` to `.devnet/legacy-2026-10-11/`. Nothing
   is deleted; the old secret keys stay.
3. `bun scripts/setup.ts`: registers the owner key, registers and activates both agents, imports them into the fleet.
4. Last, after every other program change and only with the user's explicit go:
   `solana program set-upgrade-authority <program> --final`. Irreversible: a later fix needs a new program ID.

The legacy agents stay on chain as `Active` without owner approval; decision 005 and the README name them.

## 4. Testing

Strict TDD, red first.

- Mollusk (`guard.rs`), fixtures from `gen-guard-fixtures.ts` gaining `owner-key.pk` and `activate.sig`:
  - `register_owner` succeeds; a second one for the same owner fails.
  - after `register_agent` the agent is `Pending`; a step fails with `AgentPending`.
  - `activate_agent` with the owner's signature succeeds, then step 1 works.
  - `activate_agent` fails with a flipped signature, with another owner's record, with an `AgentKey` passed as the
    owner key, and a second time (`AgentNotPending`).
  - CU printed for `register_owner` and `activate_agent`.
- TS (`bun test`): message vector, instruction encoding and discriminators, events, setup plan, the agent loop's
  `Pending` pause, owner key file write-ahead.
- Devnet: the migration is the end-to-end check: both agents `Active` with growing counters (`agent.ts status`), and
  a live GUI check of `/api/agents`.

## 5. Docs

- `spec/decisions/005-klucz-pq-wlasciciela-aktywuje-agenta.md`: the owner's ML-DSA-44 key activates every agent; why
  two transactions; the bootstrap trust; the legacy agents; immutable deploy.
- `README.md`: `register_agent` moves from "Not quantum-resistant yet (WIP)" to "Quantum-resistant"; the upgradeable
  program bullet goes once `--final` is done.
