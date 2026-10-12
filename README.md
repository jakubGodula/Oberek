# SolanaHackaton01

AI agents whose every step is guarded on Solana with a post-quantum signature. The `onchain_agent_guard` program
holds each agent's ML-DSA-44 public key, records a step only with a valid ML-DSA-44 signature over it, and lets the
owner kill and resume the agent.

- `onchain/`: the program (Anchor), deployed on devnet at `BL6Fjh4pADgjvZwaueeAcc7rYddFrdMNWnqK73x78ZSs`.
- `src/`: the SvelteKit server and operator page. It runs the fleet: signs each agent's steps with its key and sends
  them to the program, and shows the agents with their decisions, approval of large steps, Kill-Switch and resume.
- `agents/`: the agents, each its own process that talks to the server over HTTP and holds no keys:
  `agents/tick` (the simplest one) and `agents/sentinel` (rebalances a virtual SOL/USDC treasury from the live price).

Program design: [docs/superpowers/specs/2026-10-10-pq-agent-program-design.md](docs/superpowers/specs/2026-10-10-pq-agent-program-design.md).

Decision log: each agent's decisions in `.devnet/fleet/<id>/decisions.jsonl` are sealed with AES-256-GCM under a key
wrapped with ML-KEM-768 to the owner, so a copy of the log file alone is unreadable now and after Q-day, and the owner
opens it with the owner's own key; only the SHA-256 of each decision goes on-chain. The server keeps the key next to the
log (`seal.json`) to show the decisions, so this protects neither a compromised server nor a copy of the whole agent
directory.
Design: [docs/superpowers/specs/2026-10-11-sealed-decision-log-design.md](docs/superpowers/specs/2026-10-11-sealed-decision-log-design.md),
decision: [spec/decisions/006-zapieczetowany-log-decyzji-ml-kem.md](spec/decisions/006-zapieczetowany-log-decyzji-ml-kem.md).

## What is post-quantum here

- **Quantum-resistant:** an agent's steps and resumes. The program accepts them only with the agent's ML-DSA-44
  signature, verified on-chain, so the decision history can't be forged even with every Ed25519 key broken.
- **Not quantum-resistant, on purpose:** `kill` takes only the owner's Ed25519 signature, so the owner can stop an
  agent from an ordinary wallet even when its server is down. A quantum attacker could only stop an agent, not resume
  it.
- **Not quantum-resistant yet (WIP):** `register_agent` takes only the owner's Ed25519 signature (fixable with an owner
  ML-DSA-44 key), and the devnet program is still upgradeable by an Ed25519 key (fixable by deploying it immutable).
- **No DMS:** the Dual-Mode Signature scheme from `spec/ARCHITECTURE.md` §4.3 is not implemented. No verifier for its
  proof exists on Solana, the 5.4 MB proof does not fit a Solana program, and it is only needed after Q-day. The page shows only what exists: the agent's key account
  and the SHA-256 of its last decision, with no SHA3 commitments; a Merkle root appears only for batched agents (below).
  ML-KEM-768 is used only off-chain, to seal each agent's decision log for the owner ([decision 006](spec/decisions/006-zapieczetowany-log-decyzji-ml-kem.md)).

Why, and what is still open: [spec/decisions/004-bez-dms-ochrona-pq-bez-dowodu-seeda.md](spec/decisions/004-bez-dms-ochrona-pq-bez-dowodu-seeda.md).

## Batched agents: many decisions in one transaction

Agents listed in `BATCHED_AGENT_IDS` (`.env`) get `202` for each decision. The server buffers them and every
`BATCH_FLUSH_MS` (default 10 s) after the first decision in an empty buffer, or at `BATCH_MAX_DECISIONS` (default 16), records the whole buffer with one
`record_batch`: one ML-DSA-44 signature over the SHA-256 Merkle root of the batch, verified on-chain at the cost of one
step. Each decision is logged with its Merkle proof, so it can be shown and checked against the root on-chain without
the rest of the batch; `scripts/audit.ts` checks every proof. A buffer holding a single decision goes as an ordinary
step, and a decision that needs approval is never batched. Decisions
still in the buffer when the server stops are lost; they never reached the chain.
Decision: [spec/decisions/007-korzen-merkle-dla-paczki-decyzji.md](spec/decisions/007-korzen-merkle-dla-paczki-decyzji.md).

## Run

Needs [Bun](https://bun.sh). Without `.env` the page shows only the two built-in mock agents, labelled MOCK.

```sh
bun install
bun run dev                      # http://localhost:5173
```

### Quick start: setup and demo

```sh
bun install
bun scripts/setup.ts             # .env, payer wallet, its SOL, both agents; safe to re-run
bun scripts/demo.ts              # server + Sentinel + Tick; see "The whole demo in one command"
```

`setup.ts` does the steps below for you, skipping each one already done. It creates `.env` from `.env.example` and the
payer wallet at `FEE_PAYER_KEYPAIR`, then funds it with ~0.2 SOL per agent still to register. It tries a devnet airdrop
first; that is often rate-limited, so it may print the address and wait until you send SOL from
https://faucet.solana.com. Ctrl+C at that point is safe, and a re-run carries on. Last, it creates the owner's ML-KEM-768
key (`OWNER_MLKEM_FILE`), registers `sentinel-01` and `tick-01` (agent files in `.devnet/agents/`), imports them into
the fleet and seals their decision logs.

### A real agent on devnet, by hand

```sh
cp .env.example .env
bun scripts/new-keypair.ts .devnet/payer.json   # prints the wallet address; or solana-keygen new --outfile …
```

Fund that address with ~0.2 SOL per agent on devnet, ~0.35 SOL for Tick and Sentinel (https://faucet.solana.com, a few
requests per 8 hours; or a transfer from any devnet wallet): each registration locks ~0.15 SOL of rent, each step costs
15,000 lamports. In `.env` this wallet both pays the steps and is the owner the server signs kill and resume with.

```sh
bun scripts/agent.ts register    # new ML-DSA-44 key + Agent account, written to .devnet/agent.json
bun scripts/fleet.ts owner-key   # once: the owner's ML-KEM-768 key, .devnet/owner-mlkem.json
bun scripts/fleet.ts import .devnet/agent.json --as tick-01 --name "Tick One"
bun run dev                      # tick-01 appears on the page, read from devnet
bun agents/tick                  # one step every 30 s; see agents/tick/README.md
```

An agent imported before logs were sealed: `bun scripts/fleet.ts seal <id>`; its earlier plaintext lines stay readable.

### Second agent: Sentinel

Sentinel rebalances a virtual SOL/USDC treasury from the live Jupiter SOL price. A rebalance worth more than 0.25% of
the treasury is a proposal: Sentinel stops until you approve or reject it on the page. It needs the setup above
(`.env` and a funded wallet) and the server running (`bun run dev` in another terminal), but not Tick. It gets its own
agent file, next to Tick's:

```sh
AGENT_FILE=.devnet/agents/sentinel-01.json bun scripts/agent.ts register
bun scripts/fleet.ts import .devnet/agents/sentinel-01.json --as sentinel-01 --name "Aegis Sentinel Alpha — Treasury Rebalancer" --risk MEDIUM
bun agents/sentinel              # one decision every 30 s
```

For a demo, start it with `SENTINEL_SCHEDULE_MIN=2 SENTINEL_INTERVAL_MS=10000 bun agents/sentinel` (a rebalance about
every 2 minutes) and press **Symuluj szok ceny (−3%)** on its card: the next decision is made at the price moved by −3%,
is large enough to need approval, and waits for **Zatwierdź** or **Odrzuć**. Details:
[agents/sentinel/README.md](agents/sentinel/README.md).

`.devnet/` is gitignored and holds the keys: the agent's ML-DSA-44 secret key is only there.

### The owner on Telegram

The bot sends each proposal to your Telegram chat with **Accept** and **Reject**, and **Kill** or **Resume** when an
agent's status changes; `/agents` lists the fleet with the buttons each agent's state allows. It runs as its own
process and talks to the server over HTTP, so it works from localhost.

The bot has no dependencies of its own: the `bun install` from [Run](#run) covers it. A checkout from before the bot
needs that `bun install` again, because the lockfile changed (the Blinks package `@solana/actions` is gone).

**Create the bot (once).**

1. In Telegram, open **@BotFather** (the verified one) and send `/newbot`.
2. Give it a display name (e.g. `Oberek Owner`) and a username ending in `bot` (e.g. `oberek_owner_bot`).
3. BotFather answers with a token like `123456789:AAH…`. It controls the bot, so keep it out of git and chats: put it
   in `.env` in the repository root as `TELEGRAM_BOT_TOKEN=…` (`.env` is gitignored). If it leaks, send `/revoke` to
   @BotFather for a new one.

**Connect your chat (once).**

4. Start the server (`bun run dev`) and the bot (`bun bot/telegram`, from the repository root: Bun reads `.env` there).
5. Open your bot in Telegram and send `/start`. It answers with your chat id; put it in `.env` as
   `TELEGRAM_OWNER_CHAT_ID=…` and restart the bot. Only that chat can press buttons. Use your private chat with the
   bot: in a group every member could press them.

**Use it.** Send `/agents` for one message per fleet agent with its buttons. Proposals, kills and resumes arrive on
their own, every 3 s at most. Accept and Reject act only on the proposal their message shows: if a newer one is waiting,
the server refuses (409) and the message says so.

```bash
bun bot/telegram                 # needs the server (bun run dev); TELEGRAM_API_URL if not on :5173
```

### The whole demo in one command

With both agents set up as above:

```sh
bun scripts/demo.ts              # server, then Sentinel at demo pace and Tick, in one terminal
```

Each output line is prefixed with `[server]`, `[sentinel]` or `[tick]`. Ctrl+C stops it gracefully: the agents finish
the step in flight and exit, and only then the server stops. If any of them exits on its own, the rest are stopped the
same way. Port 5173 must be free.

### Audit an agent's history

```sh
bun scripts/audit.ts sentinel-01  # decision log vs. on-chain history; exit code 1 on a problem
```

Reads the agent account and every transaction in its history (read-only, no fees). It checks that each counter
1..N has exactly one step or resume on-chain, that the account's last decision is the last step's hash, that the log
holds a record for every on-chain hash that still hashes to it, and that every log entry not marked `unconfirmed` is
on-chain with the same hash.

Sealed lines are opened with the owner's ML-KEM secret key from `OWNER_MLKEM_FILE` (`.devnet/owner-mlkem.json`), not
the server's copy, so the audit needs that file. The output says how many lines are sealed and how many are plaintext
from before sealing. A wrong owner key opens no sealed line: each is skipped with a warning and its step is reported as
`on-chain, but not in the log`, which looks like tampering but is the key. Keep a backup of that file.

The free-tier devnet RPC allows only a few `getTransaction` calls per window, so it takes
about 3 s per transaction: ~20 minutes for 400. Steps run with `bun scripts/agent.ts run` before the import into the
fleet are logged in `.devnet/decisions.jsonl`, not in the fleet log, so they show as missing. How it works:
[spec/history-audit.md](spec/history-audit.md).

## Test

```sh
bun test                         # server, fleet, agents, scripts and the Telegram bot, no network
onchain/run-tests.sh             # the program (Docker); see onchain/README.md
```
