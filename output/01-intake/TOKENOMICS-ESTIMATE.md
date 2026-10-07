# TOKENOMICS-ESTIMATE.md — first estimate (intake, before answers)

Assumptions: Flow 1 (team, async, mixed licences); strong model = TL's Claude Max; mid = Claude 20 USD / Gemini Pro /
Codex; cheap = Sonnet/Flash/DeepSeek class. Tokens are order-of-magnitude per package session (input+output), based on
the Open Mercato repo size (large monorepo: workers must be told to read only `AGENTS.md`, the module docs and the
example module, never the whole tree).

| role / step | model tier | est. tokens | notes |
|-------------|-----------|-------------|-------|
| Intake (this run) | strong | ~0.4 M | done |
| Plan (Step 2, after answers) | strong | ~0.3 M | regenerate after `inbox/` is filled |
| WP-01 foundation (fork, skeletons, CI, versions) | strong | ~1.0 M | day 1–2, TL |
| WP-02 Anchor program | strong | ~0.8 M | Rust owner + strong model |
| WP-03 solana_core (RPC, hot wallet, SIWS, tx sender) | strong/mid | ~0.8 M | |
| WP-04 solana_gates + Core minting | mid | ~0.6 M | |
| WP-05 gateway-solana (Solana Pay) | strong | ~1.0 M | dual review |
| WP-06 solana_events (Helius adapter, polling, activity) | mid | ~0.7 M | |
| WP-07 attestations + PQC + approvals + agent runtime | strong | ~1.2 M | dual review |
| WP-08 solana_actions (Blinks) + Blink page | mid | ~0.6 M | |
| WP-09 dashboard pages, widgets, portal | mid/cheap | ~0.8 M | |
| WP-10 demo seed, E2E script, docs, deck, video | cheap/mid | ~0.5 M | |
| Integration (TL orchestrator, 10 merges × gate) | strong | ~1.0 M | |
| Reviews Gate 1 (10 single + 3 dual) | cheap/mid | ~1.2 M | read-only |
| Intent checks Gate 2 | mid | ~0.3 M | fresh context |
| **Total** | | **~11 M** | ~5.5 M on the strong tier |

Proposed confidence/testing level: **Solid** (see PROBLEM.md §7). Stop rule per package: 2× estimate or 3 failed
check runs → stop and report in `STATUS.md`.
