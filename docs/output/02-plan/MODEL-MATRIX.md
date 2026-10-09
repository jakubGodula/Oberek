# MODEL-MATRIX.md — role × tier × candidate models (DRAFT; adjust from Q-AI-01…04)

| role | tier | candidates (any of) | why |
|------|------|---------------------|-----|
| Orchestrator (intake, plan, integration decisions, review merge) | strong | Claude Fable 5.1 / Opus 5.5 (TL's Claude Max) | reads whole repo + all packages |
| Rust / Anchor implementation (WP-02) | strong | Claude Fable/Opus; GPT-5-class via Codex | constraints, PDAs, 1.x toolchain quirks |
| Payments reconciliation + tx builder (WP-05), agent runtime + PolicyGuard (WP-07) | strong | Claude Fable/Opus | money/keys/agents |
| Solana core service (WP-03) | strong or mid | Claude Opus/Sonnet 5; Gemini Pro | well-documented patterns |
| Gates, events, actions (WP-04/06/08) | mid | Claude Sonnet 5 (20 USD tier), Gemini Pro, DeepSeek, Codex | module-local, contract-driven |
| Dashboard/portal UI (WP-09) | mid | Sonnet 5, Gemini Pro | follows existing UI components |
| Docs, seed data, scripts, deck (WP-10) | cheap | Haiku 4.5, Gemini Flash, DeepSeek | text + scripts |
| First-pass review (Gate 1 single) | cheap/mid | Sonnet 5, Flash, DeepSeek | read-only, structured report |
| Second review (Gate 1 dual, WP-02/05/07) | strong (orchestrator-level) | Fable/Opus | merged with the worker-level report |
| Intent check (Gate 2) | mid, fresh context | Sonnet 5 / Gemini Pro | "does it do what the brief says, no more" |
| Test writing inside packages | cheap | Haiku 4.5 / Flash | table-driven tests from the brief |

Criticality: **medium overall; critical for WP-02, WP-05, WP-07** → dual review there (Q-AI-06 default).
Cezar note: model names (Fable, Opus, Sonnet, Deepseek, Gemini Pro, Flash, Grok 4.7, Kimi) are valid runner targets if the TL dispatches through Cezar; otherwise each person uses their own harness.
