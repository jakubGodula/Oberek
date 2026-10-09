---
file: ai-and-budget-q_and_a.md
area: ai-and-budget
task: om-solana
round: 1
owner: team lead
status: open
---
> Only the team lead answers this file. It decides who works with which model and where the strong-model budget goes.
> Empty answer = default accepted. `Blocking: yes` must be answered before the plan is final.

## Q-AI-01 — Who holds which AI licence?
- Why it matters: `02-plan/ASSIGNMENTS.md` maps packages to people by model tier. Rust/Anchor and the Solana Pay reconciliation need a strong model; UI widgets and tests do not.
- Options: A) TL: Claude Max (Opus/Fable); others: Claude 20 USD. B) TL: Claude Max; others mixed (DeepSeek, Gemini Pro, Codex/ChatGPT Plus, Cursor). C) Everyone on Claude Max for the two weeks (team buys 5 extra seats). D) Other — list per person.
- Default (used if unanswered): B
- AI recommendation: B, confidence medium, because it matches the brief ("mixed licences") and the plan can route the two hardest packages (WP-02 Anchor program, WP-05 payments) to the TL's model.
- Impact if wrong: high
- Blocking: yes
- Answer:
- Answered by / date:
- Notes: Write one line per person: name — model/harness — tier (strong / mid / cheap). Names stay in this file only.

## Q-AI-02 — Which harnesses are in use?
- Why it matters: work-package briefs are written to be harness-neutral, but the orchestrator commands differ (Claude Code subagents vs Cursor vs Codex CLI vs Gemini CLI vs Cezar).
- Options: A) Claude Code for everyone who has Claude; others use their vendor CLI. B) Cezar cockpit on the TL's machine dispatches all autonomous packages; humans run their own harness for assigned ones. C) Cursor/VS Code only, no CLIs.
- Default (used if unanswered): A
- AI recommendation: A, confidence medium; B is better if the TL's Cezar runner branch is stable enough to spend no hackathon time on it.
- Impact if wrong: medium
- Blocking: no
- Answer:
- Answered by / date:
- Notes:

## Q-AI-03 — Orchestrator model for intake, plan, integration and review-merge
- Why it matters: these steps read the whole repo and all packages; a weaker model here costs integration days.
- Options: A) Claude Fable/Opus-class on the TL's licence. B) GPT-5-class via the TL's ChatGPT/Codex licence. C) Gemini Pro.
- Default (used if unanswered): A
- AI recommendation: A, confidence high, because the TL already uses it and the skills in this run folder are written for it.
- Impact if wrong: medium
- Blocking: no
- Answer:
- Answered by / date:
- Notes:

## Q-AI-04 — Worker model minimum per package type
- Why it matters: each `BRIEF.md` states `Minimum model tier`. The plan uses: Anchor/Rust → strong; Solana TS core, payments, agent runtime → strong or mid; widgets, docs, tests, demo data → cheap OK.
- Options: A) Accept the plan's per-package minimums. B) Everything mid or better (no cheap-model packages). C) Let each person pick; no minimums.
- Default (used if unanswered): A
- AI recommendation: A, confidence medium.
- Impact if wrong: medium
- Blocking: no
- Answer:
- Answered by / date:
- Notes:

## Q-AI-05 — Token/money budget for AI during the two weeks
- Why it matters: `02-plan/TOKENOMICS.md` estimates ~6–9 M input tokens of strong-model work for integration and review. If the TL's plan is a flat subscription, the budget is time, not money.
- Options: A) Subscriptions only; no API spend. B) Subscriptions + up to 100 USD API (for Cezar dispatch / overnight runs). C) Subscriptions + up to 300 USD API.
- Default (used if unanswered): A
- AI recommendation: B, confidence low, because overnight autonomous runs of test-writing packages are cheap and save human hours; but it needs an API key and someone watching cost.
- Impact if wrong: low
- Blocking: no
- Answer:
- Answered by / date:
- Notes:

## Q-AI-06 — Criticality and review mode
- Why it matters: Gate 1 can be single review (one cheaper model, read-only) or dual review (orchestrator-level + worker-level, merged report). Dual costs ~2× review tokens and ~1 extra hour per package.
- Options: A) Dual review only for WP-02 (Anchor program), WP-05 (payments) and WP-07 (agent runtime, spend limits); single for the rest. B) Single everywhere (hackathon). C) Dual everywhere.
- Default (used if unanswered): A
- AI recommendation: A, confidence high: money-touching and key-touching code gets two reviews; widgets do not.
- Impact if wrong: medium
- Blocking: no
- Answer:
- Answered by / date:
- Notes:

## Q-AI-07 — Confidence and testing level
- Why it matters: decides how much of each package's time goes to tests. Hackathon judges reward a working demo, but a payments flow that double-books an order on stage is fatal.
- Options: A) "Demo-grade": unit tests for crypto/pay reconciliation, smoke E2E for the demo path, nothing else. B) "Solid": A + integration tests per module + Anchor tests on a local validator in CI. C) "Product-grade": B + load/security tests.
- Default (used if unanswered): B
- AI recommendation: B, confidence medium; A is acceptable if the team is fewer than 5 by week 2.
- Impact if wrong: medium
- Blocking: no
- Answer:
- Answered by / date:
- Notes:

## Q-AI-08 — Separate security-audit session planned?
- Why it matters: this workflow does **no** security audit; only a secret-leak scan before commits. A product aimed at security agencies will be judged on this, and a wallet-signing endpoint deserves one adversarial pass.
- Options: A) Yes — one dedicated adversarial review session (strong model + a human) on days 11–12 over the Anchor program, the Actions endpoints and the agent spend limits. B) No, rely on Gate 1 reviews. C) Yes, and also run `cargo audit`, `npm audit`, gitleaks and a Blink-spec linter in CI.
- Default (used if unanswered): A
- AI recommendation: C, confidence medium; the CI part is cheap and shows well in the pitch for a security-agency audience.
- Impact if wrong: high
- Blocking: yes
- Answer:
- Answered by / date:
- Notes:

## Q-AI-09 — Sharing mode for Q&A and plan files
- Why it matters: this run is in folder mode (`output/` shared by the TL). Git mode keeps history and lets `inbox/` be a PR.
- Options: A) Keep folder mode for round 1; move `02-plan/` into the repo under `ai-output/tpw/...` once the repo exists. B) Git mode from now on (branch `ai/tpw-om-solana-open-mercato-solana-hackathon`). C) Folder mode throughout.
- Default (used if unanswered): A
- AI recommendation: A, confidence high.
- Impact if wrong: low
- Blocking: no
- Answer:
- Answered by / date:
- Notes:

## Q-AI-10 — Solo-mode fallback
- Why it matters: if teammates drop out, the plan must still be executable by the TL's model alone in sequence (solo mode: one model, one branch pattern `feature/om-solana-<model>-<harness>-<stamp>`).
- Options: A) Plan must contain a "minimum viable path" of ≤4 packages that one person can finish in 2 weeks. B) No fallback; all-or-nothing.
- Default (used if unanswered): A
- AI recommendation: A, confidence high; the plan marks WP-01, WP-03, WP-05, WP-09 as the minimum demo path.
- Impact if wrong: medium
- Blocking: no
- Answer:
- Answered by / date:
- Notes:
