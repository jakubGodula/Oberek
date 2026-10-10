# SolanaHackaton01

AI agents whose every step is guarded on Solana with a post-quantum signature. The `onchain_agent_guard` program
holds each agent's ML-DSA-44 public key, records a step only with a valid ML-DSA-44 signature over it, and lets the
owner kill and resume the agent.

- `onchain/`: the program (Anchor), deployed on devnet at `BL6Fjh4pADgjvZwaueeAcc7rYddFrdMNWnqK73x78ZSs`.
- `src/`: the SvelteKit server and operator page. It runs the fleet: signs each agent's steps with its key and sends
  them to the program, and shows the agents with Kill-Switch and resume.
- `agents/`: the agents, each its own process that talks to the server over HTTP and holds no keys
  (`agents/tick`, the simplest one).

Program design: [docs/superpowers/specs/2026-10-10-pq-agent-program-design.md](docs/superpowers/specs/2026-10-10-pq-agent-program-design.md).

## Run

Needs [Bun](https://bun.sh). Without `.env` the page shows only the three built-in mock agents.

```sh
bun install
bun run dev                      # http://localhost:5173
```

### A real agent on devnet

```sh
cp .env.example .env
mkdir -p .devnet && solana-keygen new --outfile .devnet/payer.json   # any 64-byte keypair JSON works
```

Fund `.devnet/payer.json` with ~0.2 SOL on devnet (https://faucet.solana.com): registration locks ~0.15 SOL of rent,
each step costs 15,000 lamports. In `.env` this wallet both pays the steps and is the owner the server signs kill and
resume with.

```sh
bun scripts/agent.ts register    # new ML-DSA-44 key + Agent account, written to .devnet/agent.json
bun scripts/fleet.ts import .devnet/agent.json --as tick-01 --name "Tick One"
bun run dev                      # tick-01 appears on the page, read from devnet
bun agents/tick                  # one step every 30 s; see agents/tick/README.md
```

`.devnet/` is gitignored and holds the keys: the agent's ML-DSA-44 secret key is only there.

## Test

```sh
bun test src agents              # server, fleet and agents, no network
onchain/run-tests.sh             # the program (Docker); see onchain/README.md
```
