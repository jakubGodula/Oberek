# ASSIGNMENTS.md — package → person → model → harness (DRAFT; names to be filled by the TL from Q-AI-01)

| package | role | person | model (min tier) | harness | placement | days | notes |
|---------|------|--------|------------------|---------|-----------|------|-------|
| WP-01 foundation | TL | _name_ | strong (Claude Max: Fable/Opus) | Claude Code | local | 1–2 | the only package on day 1 |
| WP-02 anchor program | Rust owner | _name_ | strong | any (Claude Code / Cursor / Codex) | local | 2–6 | needs Anchor 1.2.1 toolchain + devnet deploy key |
| WP-03 solana_core | backend A | _name_ | strong or mid | any | either | 2–5 | publishes `SolanaCoreService` + fake on day 2 evening |
| WP-04 solana_gates | backend B | _name_ | mid (Claude 20 USD / Gemini Pro / DeepSeek) | any | either | 2–6 | |
| WP-05 gateway-solana | payments owner | _name_ | strong | any | local | 2–7 | dual review |
| WP-06 solana_events | frontend owner | _name_ | mid | any | either | 2–5 | small backend module before the UI work |
| WP-07 attestations + agents | TL (+ agents owner) | _name_ | strong | Claude Code | local | 5–10 | dual review |
| WP-08 solana_actions | backend A | _name_ | mid | any | either | 6–10 | |
| WP-09 dashboard + portal | frontend owner | _name_ | mid | any | either | 6–11 | |
| WP-10 demo + submission | backend B (pitch owner) | _name_ | cheap for docs, mid for E2E script | any | local | 8–14 | human-heavy |
| WP-11 stretch ML-KEM vault | payments owner | _name_ | mid | any | either | 11–13 | optional |
| WP-12 stretch x402 + MCP | Rust owner | _name_ | mid | any | either | 11–13 | optional, spike first |
| Integration + review merge | TL | _name_ | strong | Claude Code (or Cezar cockpit) | local | 5–13 | |
| Gate 1 reviews | rotating | — | cheap/mid, never the author | any | either | per merge | read-only |
| Gate 2 intent checks | TL | — | mid, fresh context | any | either | per merge | |
| Security review session (Q-AI-08) | payments owner + TL | — | strong | Claude Code | local | 11 | adversarial pass |

Rules: one executor = one worktree = one branch. A human-run package is tracked by its `STATUS.md` and pushed branch.
