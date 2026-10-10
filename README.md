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
https://faucet.solana.com. Ctrl+C at that point is safe, and a re-run carries on. Last, it registers `sentinel-01` and
`tick-01` (agent files in `.devnet/agents/`) and imports them into the fleet.

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
bun scripts/fleet.ts import .devnet/agent.json --as tick-01 --name "Tick One"
bun run dev                      # tick-01 appears on the page, read from devnet
bun agents/tick                  # one step every 30 s; see agents/tick/README.md
```

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

## Test

```sh
bun test src agents scripts      # server, fleet, agents and scripts, no network
onchain/run-tests.sh             # the program (Docker); see onchain/README.md
```
