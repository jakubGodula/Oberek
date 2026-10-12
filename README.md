# Oberek

AI agents whose every step is guarded on Solana with a post-quantum signature. The `onchain_agent_guard` program
holds each agent's ML-DSA-44 public key, records a step only with a valid ML-DSA-44 signature over it, and lets the
owner kill and resume the agent.

- `onchain/`: the program (Anchor), deployed on devnet at `BL6Fjh4pADgjvZwaueeAcc7rYddFrdMNWnqK73x78ZSs`.
- `src/`: the SvelteKit server and operator page. It runs the fleet: signs each agent's steps with its key and sends
  them to the program, and shows the agents with their decisions, approval of large steps, Kill-Switch and resume.
- `agents/`: the agents, each its own process that talks to the server over HTTP and holds no keys:
  `agents/tick` (the simplest one), `agents/sentinel` (rebalances a virtual SOL/USDC treasury from the live price)
  and `agents/jito` (JitoSOL Steward; a quiet cycle stays on the page, a simulated proposal is a vote).
- `kit/`: `pq-agent-guard`, the reusable library the server is built on (next section).

Program design: [docs/superpowers/specs/2026-10-10-pq-agent-program-design.md](docs/superpowers/specs/2026-10-10-pq-agent-program-design.md).

Decision log: each agent's decisions in `.devnet/fleet/<id>/decisions.jsonl` are sealed with AES-256-GCM under a key
wrapped with ML-KEM-768 to the owner, so a copy of the log file alone is unreadable now and after Q-day, and the owner
opens it with the owner's own key; only the SHA-256 of each decision goes on-chain. The server keeps the key next to the
log (`seal.json`) to show the decisions, so this protects neither a compromised server nor a copy of the whole agent
directory.
Design: [docs/superpowers/specs/2026-10-11-sealed-decision-log-design.md](docs/superpowers/specs/2026-10-11-sealed-decision-log-design.md),
decision: [spec/decisions/006-zapieczetowany-log-decyzji-ml-kem.md](spec/decisions/006-zapieczetowany-log-decyzji-ml-kem.md).

## Guard your own agent

The guard is not tied to Oberek. [kit/README.md](kit/README.md): the package `pq-agent-guard` is a building block that
hardens an agent you already have, AI or not, in a few lines. Wrap each action in `agent.step(decision, act)`: the
decision is signed with the agent's ML-DSA-44 key and recorded on chain before the action runs, and once the owner
kills the agent no further step goes through. No Oberek server needed; the app in this repo is its first user.

## What is post-quantum here

- **Quantum-resistant:** an agent's steps and resumes. The program accepts them only with the agent's ML-DSA-44
  signature, verified on-chain, so the decision history can't be forged even with every Ed25519 key broken.
- **Quantum-resistant:** a new agent's start. `register_agent` creates the agent `Pending`, and only the owner's
  ML-DSA-44 signature, verified on-chain against the owner's key registered once per wallet, makes it `Active`
  ([decision 005](spec/decisions/005-klucz-pq-wlasciciela-aktywuje-agenta.md)). This closes the gap where
  `register_agent` took only the owner's Ed25519 signature, so a quantum attacker could have started a fake agent with
  its own key under the owner's address.
- **Not quantum-resistant, on purpose:** `kill` takes only the owner's Ed25519 signature, so the owner can stop an
  agent from an ordinary wallet even when its server is down. A quantum attacker could only stop an agent, not resume
  it.
- **Not quantum-resistant yet (WIP):** the devnet program is still upgradeable by an Ed25519 key (fixable by deploying
  it immutable). Agents registered before owner activation existed stay `Active` on chain without it (decision 005).
- **No DMS:** the Dual-Mode Signature scheme from the original plan ([archived](docs/output/ARCHITECTURE-aegis-mercato-plan.md) §4.3) is not implemented. No verifier for its
  proof exists on Solana, the 5.4 MB proof does not fit a Solana program, and it is only needed after Q-day. The page shows only what exists: the agent's key account
  and the SHA-256 of its last decision, with no SHA3 commitments; a Merkle root appears only for batched agents (below).
  ML-KEM-768 is used only off-chain, to seal each agent's decision log for the owner ([decision 006](spec/decisions/006-zapieczetowany-log-decyzji-ml-kem.md)).

Why, and what is still open: [spec/decisions/004-bez-dms-ochrona-pq-bez-dowodu-seeda.md](spec/decisions/004-bez-dms-ochrona-pq-bez-dowodu-seeda.md).

Which key lives where and what it signs, with a diagram: [spec/keys.md](spec/keys.md).

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

Needs [Bun](https://bun.sh). Without `.env` the page shows no agents; `bun scripts/setup.ts` below sets them up.

```sh
bun install
bun run dev                      # http://localhost:5173
```

### Quick start: setup and demo

```sh
bun install
bun scripts/setup.ts             # .env, payer wallet, its SOL, the agents; safe to re-run
bun scripts/demo.ts              # server + Sentinel + Tick + JitoSOL steward, + the Telegram bot once .env has its token
```

The two Telegram values can't be generated: the token comes from @BotFather and the chat id from your bot's answer to
`/start`. See [The owner on Telegram](#the-owner-on-telegram); setup ends with a hint on which one is still missing.

`setup.ts` does the steps below for you, skipping each one already done. A machine that already has Sentinel and Tick
keeps them: they are not registered again, and their keys stay where they are. The name on the page is updated to the one in this script. Only an agent that is not in the fleet
yet, such as `jito-01`, is registered, which needs about 0.2 SOL. It creates `.env` from `.env.example` and the
payer wallet at `FEE_PAYER_KEYPAIR`, then funds it with ~0.2 SOL per agent still to register, plus ~0.2 SOL for the
owner's key on the first run: ~0.8 SOL for a fresh setup. It tries a devnet airdrop
first; that is often rate-limited, so it may print the address and wait until you send SOL from
https://faucet.solana.com. Ctrl+C at that point is safe, and a re-run carries on. Last, it creates the owner's ML-KEM-768
key (`OWNER_MLKEM_FILE`), registers the owner's ML-DSA-44 key once per wallet (`OWNER_MLDSA_FILE`), registers and
activates `sentinel-01`, `tick-01` and `jito-01` (agent files in `.devnet/agents/`), imports them into the fleet and
seals their decision logs.

**Back up `.devnet/owner-mldsa.json`.** The program registers the owner's ML-DSA-44 key only once per wallet. Without
that file, the wallet can't activate any new agent, and the only way out is a new wallet; agents already active keep
working ([spec/keys.md](spec/keys.md)).

Agents set up before the owner key existed keep running, but that key never activated them, and setup says so. To
replace them with activated agents, stop the demo and run `bun scripts/setup.ts --reregister`: it moves their files to
`.devnet/retired/reregister-<time>/` and registers new ones (~0.2 SOL each). The new agents start with an empty history;
the old accounts stay on chain.

Something broke? Each run of `setup.ts` and `demo.ts` writes its whole output, children included, to
`.devnet/logs/<script>-<time>.log` and prints the path at the end. The log is timestamped and redacted: tokens, secrets,
the Telegram chat id and keys inside RPC URLs are masked, and the header lists the git revision and the `.env.example`
settings. Glance through it and send it to whoever is helping.

### A real agent on devnet, by hand

```sh
cp .env.example .env
bun scripts/new-keypair.ts .devnet/payer.json   # prints the wallet address; or solana-keygen new --outfile …
```

Fund that address with ~0.2 SOL per agent on devnet, plus ~0.2 SOL once for the owner's key
(https://faucet.solana.com, a few requests per 8 hours; or a transfer from any devnet wallet): each registration locks
~0.15 SOL of rent, each step costs 15,000 lamports. In `.env` this wallet both pays the steps and is the owner the
server signs kill and resume with.

```sh
bun scripts/agent.ts register-owner   # once per wallet: the owner's ML-DSA-44 key, .devnet/owner-mldsa.json; back it up
bun scripts/agent.ts register    # new ML-DSA-44 key + Agent account, written to .devnet/agent.json, activated by the owner's key
bun scripts/fleet.ts owner-key   # once: the owner's ML-KEM-768 key, .devnet/owner-mlkem.json
bun scripts/fleet.ts import .devnet/agent.json --as tick-01 --name "Oberek Tick One — on-chain heartbeat"
bun run dev                      # tick-01 appears on the page, read from devnet
bun agents/tick                  # one step every 30 s; see agents/tick/README.md
```

If `register` reports the agent registered but not active, retry only the activation:
`AGENT_FILE=.devnet/agent.json bun scripts/agent.ts activate`. Until then the program refuses its steps.

An agent imported before logs were sealed: `bun scripts/fleet.ts seal <id>`; its earlier plaintext lines stay readable.

### Second agent: Sentinel

Sentinel rebalances a virtual SOL/USDC treasury from the live Jupiter SOL price. A rebalance worth more than 0.25% of
the treasury is a proposal: Sentinel stops until you approve or reject it on the page. It needs the setup above
(`.env` and a funded wallet) and the server running (`bun run dev` in another terminal), but not Tick. It gets its own
agent file, next to Tick's:

```sh
AGENT_FILE=.devnet/agents/sentinel-01.json bun scripts/agent.ts register
bun scripts/fleet.ts import .devnet/agents/sentinel-01.json --as sentinel-01 --name "Oberek Sentinel Alpha — Treasury Rebalancer" --risk MEDIUM
bun agents/sentinel              # one decision every 30 s
```

For a demo, start it with `SENTINEL_SCHEDULE_MIN=2 SENTINEL_INTERVAL_MS=10000 bun agents/sentinel` (a rebalance about
every 2 minutes) and press **Simulate a price shock (−3%)** in the **Simulate** panel: the next decision is made at the price moved by −3%,
is large enough to need approval, and waits for **Zatwierdź** or **Odrzuć**. Details:
[agents/sentinel/README.md](agents/sentinel/README.md).

### Third agent: JitoSOL steward

The steward speaks for JitoSOL holders who also hold JTO. Every 30 seconds, with nothing armed, the page shows
`No new proposals detected` and counts the repeats; that cycle sends no transaction. Arm an upcoming proposal from the
**Simulate** panel: one the steward reads as positive for JitoSOL holders is recorded as `FOR`, one it reads as negative
as `AGAINST`. The answer is simulated in the agent: it does not call a model, and it does not vote on Jito's Realms.
It needs the setup above and the server running.

```sh
AGENT_FILE=.devnet/agents/jito-01.json bun scripts/agent.ts register
bun scripts/fleet.ts import .devnet/agents/jito-01.json --as jito-01 --name "JitoSOL Steward" --risk MEDIUM
bun agents/jito                 # a quiet check every 30 s; a vote when a proposal is armed
```

Details: [agents/jito/README.md](agents/jito/README.md).

`.devnet/` is gitignored and holds the keys: the agents' and the owner's ML-DSA-44 secret keys are only there.

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

With the agents set up as above:

```sh
bun scripts/demo.ts              # server, then Sentinel at demo pace, Tick, the JitoSOL steward and the Telegram bot, in one terminal
```

The Telegram bot starts only when `.env` has `TELEGRAM_BOT_TOKEN` (see [The owner on Telegram](#the-owner-on-telegram));
without it the demo says so and runs the rest. Each output line is prefixed with `[server]`, `[sentinel]`, `[tick]`,
`[jito]` or `[telegram]`. Ctrl+C stops it gracefully: the agents finish
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
bun test                         # server, fleet, agents, scripts, the Telegram bot and the kit, no network
onchain/run-tests.sh             # the program (Docker); see onchain/README.md
bun scripts/setup.ts --e2e       # once: the e2e tests' own fleet on devnet (E2E Sentinel, E2E Tick); payer needs 0.4 SOL, spends ~0.25
bun run e2e                      # the website in a real browser against that fleet on devnet; --headed to watch
```

The e2e tests start their own server on port 5174 and their own agent processes, check the chain as well as the page,
and leave the demo fleet alone. They drive the installed Google Chrome. A failed run's trace and screenshots are in
`playwright-report/`.
