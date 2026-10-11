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
on-chain with the same hash. Sealed lines are opened with the owner's ML-KEM secret key, not the server's copy. The
free-tier devnet RPC allows only a few `getTransaction` calls per window, so it takes
about 3 s per transaction: ~20 minutes for 400. Steps run with `bun scripts/agent.ts run` before the import into the
fleet are logged in `.devnet/decisions.jsonl`, not in the fleet log, so they show as missing. How it works:
[spec/history-audit.md](spec/history-audit.md).

## Test

```sh
bun test src agents scripts      # server, fleet, agents and scripts, no network
onchain/run-tests.sh             # the program (Docker); see onchain/README.md
```
