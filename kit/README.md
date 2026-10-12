# pq-agent-guard

Puts an existing agent behind the `onchain_agent_guard` program on Solana. Before each action, the agent's decision is
signed with its ML-DSA-44 key (post-quantum), and the program verifies that signature on chain and records it. Only
then does the action run. Once the owner kills the agent, every further step is refused, so no further action runs,
whatever the agent's code: a resume needs the owner's wallet, and `openGuardedAgent` refuses it as the agent's payer.

The kit talks to the program directly; you do not need the Oberek server. Oberek itself
(`src/lib/server/modules/fleet/`) runs its agents on this package and is the larger worked example.

## Setup, once

From the repo root, with `.env` from `.env.example` (`GUARD_PROGRAM_ID`, `OWNER_KEYPAIR`, `OWNER_MLDSA_FILE`) and the
owner's wallet funded on devnet (https://faucet.solana.com):

```sh
bun scripts/agent.ts register-owner                              # the owner's ML-DSA-44 key, once per wallet (~0.2 SOL)
AGENT_FILE=.devnet/my-agent.json bun scripts/agent.ts register   # registers and activates the agent (~0.2 SOL)
```

If the activation fails after the registration landed, `AGENT_FILE=.devnet/my-agent.json bun scripts/agent.ts
activate` retries it. **Back up `.devnet/owner-mldsa.json` and the agent file.** The first is registered once per
wallet; without it the wallet cannot activate new agents. The second holds the agent's only ML-DSA-44 secret key.

Then give the agent its own fee payer, not the owner's wallet, and fund it with a small balance:

```sh
bun scripts/new-keypair.ts .devnet/agent-payer.json   # send it ~0.05 SOL: each step costs ~15,000 lamports
```

## Use

```ts
import { GuardError, openGuardedAgent } from 'pq-agent-guard';

const agent = await openGuardedAgent({
	agentFile: '.devnet/my-agent.json',
	payer: '.devnet/agent-payer.json' // pays the steps; not the owner's wallet
	// rpcUrl, wsUrl, programId: default to devnet and the devnet deploy
});

const { counter, decisionHash, result } = await agent.step(JSON.stringify({ action: 'transfer', to, lamports }), () =>
	doTransfer()
);
```

`step` records the decision as the agent's next step and runs the action only after the step landed. The decision is a
string you serialize; its SHA-256 (of the UTF-8 bytes) goes on chain, so keep the string if you want to prove later
what the agent decided. If the action throws, the step stays recorded: the record says the agent decided, not that the
action succeeded.

A refused step throws `GuardError`, and the action does not run. `error.code`:

| code | meaning |
| --- | --- |
| `AgentKilled` | the owner killed the agent |
| `AgentPending` | registered, not activated by the owner yet |
| `CounterMismatch` | another process recorded a step for this agent first; retry |
| `PayerUnfunded` | the payer (or, for kill and resume, the owner) cannot pay the fee; nothing was sent |
| `AgentNotFound` | no such agent on this cluster |

Runnable: `AGENT_FILE=.devnet/my-agent.json bun kit/example.ts` records three steps and prints the status.

To test your agent without the network, use the in-memory guard:

```ts
import { createGuardedAgent } from 'pq-agent-guard';
import { MemoryGuard } from 'pq-agent-guard/testing';

const agent = createGuardedAgent(new MemoryGuard('my-agent', 'owner'), 'my-agent');
```

## Kill and resume

From a process the agent cannot reach, with the owner's wallet:

```ts
import { openAgentOwner } from 'pq-agent-guard';

const owner = await openAgentOwner({ agentFile: '.devnet/my-agent.json', owner: '.devnet/payer.json' });
await owner.kill();
await owner.resume();
```

or `bun scripts/agent.ts kill` / `resume` with the same `AGENT_FILE`. The agent's handle has neither. A resume needs two
signatures: the owner's wallet and the agent's ML-DSA-44 key. So whoever takes the agent's process (its payer and its
ML-DSA-44 key) cannot undo a kill, and the owner's Solana key alone cannot either.

## What it protects, and what it does not

- **Protected:** the agent's decisions, as an on-chain record no one can forge without the ML-DSA-44 key, and the
  owner's kill switch, which the agent cannot get around through `step` or undo without the owner's wallet.
- **Not protected:** the agent's own Solana wallet. It is still an Ed25519 key, as quantum-vulnerable as any wallet
  today.
- **Only what goes through `step`.** An action the agent runs without `step` is neither recorded nor stopped by a kill.
- **Ask before acting.** `step` stops an action only because it runs first. Recording after the action gives an audit
  trail but no kill switch.
- **Until the kill.** Whoever takes the agent's process can record steps while the agent is active, and spend its
  payer's balance. Kill it, and keep that balance small. `openGuardedAgent` refuses the owner's wallet as the payer;
  code that loads the owner's wallet into the agent's process anyway gives the agent a way to resume itself.

## Gating your own on-chain program

An agent that skips `step` is not stopped. To stop it, keep the funds behind your own program and have that program
check the agent's account before it acts. Pass the `Agent` account in the instruction and check:

- it is the agent you expect (its address, kept in your program's config);
- its owner is the guard program `BL6Fjh4pADgjvZwaueeAcc7rYddFrdMNWnqK73x78ZSs`;
- its first 8 bytes are the `Agent` discriminator `[47, 166, 112, 147, 155, 197, 86, 7]`;
- byte 72 is `0` (Active). `1` is Killed, `2` is Pending.

A sketch in Anchor (not compiled in this repo; `kit/src/agent-layout.test.ts` pins the bytes above):

```rust
const GUARD_PROGRAM_ID: Pubkey = pubkey!("BL6Fjh4pADgjvZwaueeAcc7rYddFrdMNWnqK73x78ZSs");
const AGENT_DISCRIMINATOR: [u8; 8] = [47, 166, 112, 147, 155, 197, 86, 7];
const STATUS_OFFSET: usize = 72;
const ACTIVE: u8 = 0;

fn require_active_agent(agent: &AccountInfo, expected: &Pubkey) -> Result<()> {
    require_keys_eq!(*agent.key, *expected, GateError::WrongAgent);
    require_keys_eq!(*agent.owner, GUARD_PROGRAM_ID, GateError::WrongAgent);
    let data = agent.try_borrow_data()?;
    require!(data.len() > STATUS_OFFSET && data[..8] == AGENT_DISCRIMINATOR, GateError::WrongAgent);
    require!(data[STATUS_OFFSET] == ACTIVE, GateError::AgentNotActive);
    Ok(())
}
```

No CPI: the check reads the account. A kill takes effect for your program from the next transaction.

## Lower level

`pq-agent-guard` also exports what the one-agent API is built on: `OnchainGuard` (many agents by id, checks before
sending, program errors as `GuardError`), the instructions and the messages the keys sign, `connect` and `sendV1`
(V1 transactions, needed for the ~2.4 KB ML-DSA-44 signatures), the key files, and `fetchGuardEvents` for an agent's
history. The server in this repo uses them directly.

## Trust

The team holds the guard program's upgrade authority, and the program is not immutable yet. Until it is, you trust the
team not to change it.

## Test

```sh
bun test kit
```
