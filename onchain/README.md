# onchain_agent_guard

Solana program (Anchor 1.2.1) that guards one server-side agent. It stores the agent's ML-DSA-44 public key, accepts
a step or a resume only with a valid ML-DSA-44 signature over a message it builds itself (FIPS 204 context
`onchain-agent-guard:v1`), and lets the owner's wallet kill the agent. Design:
`docs/superpowers/specs/2026-10-10-pq-agent-program-design.md`.

## Test

```sh
onchain/run-tests.sh    # Docker (x86_64) + Bun; append 2>/dev/null to hide cargo logs
```

Builds the program in Docker (the host's glibc 2.31 is too old for the Agave and Anchor CLIs), copies the IDL to
`src/lib/server/modules/agent/onchain_agent_guard.idl.json`, writes fresh noble fixtures with
`scripts/gen-guard-fixtures.ts` and runs the Mollusk tests in `programs/onchain_agent_guard/tests/`.

The program keypair is `onchain/.devnet/program-keypair.json`: gitignored and the only copy, so back it up.
