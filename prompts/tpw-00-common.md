# tpw-00-common.md — shared rules and product spec (read first, by every stage)

This file is not run on its own. Every stage prompt (`tpw-01` … `tpw-05`) starts by reading it.
"TPW" = Two-Phase Work: a team workflow for the hardest tasks, built on Open Mercato skills and Cezar.

## 1. Operating mode
- Fully autonomous. Do not ask the user anything unless truly blocked (a source is unreadable AND no
  reasonable assumption exists). Decide, and log every assumption in `<output>/ASSUMPTIONS.md`
  (id, assumption, why, how to change it).
- Assume the session can die at any time. Write files early; keep `<output>/BUILD_STATE.md` current
  (stage, done, next) so a fresh session can resume.
- Never print, copy or commit secrets (API keys, tokens, `.env` contents, `~/.cezar` credentials).
  Reference paths only.
- English only. Shell must work on both Linux and macOS (no GNU-only or BSD-only flags without a fallback).
- Do not modify Cezar source code, the Open Mercato skills checkout, or `/home/alex/work/temp/skills`.
  They are read-only references. All writing goes to `<output>`.

## 2. Paths
- Prompts (this folder): `/home/alex/work/temp/prompts`
- `<output>` = `~/work/output/two-phase-work-<model-name>-<harness>-<stamp>`
  (`<stamp>` = `date -u +%Y%m%d-%H%M%S`). Stage 01 creates it and writes the resolved path to
  `/home/alex/work/temp/prompts/.tpw-current-output`; later stages read that file.
- Cezar checkout: `~/work/cezar`. Other Cezar-related projects: `~/work/cezar*` (list them, read what is relevant).
- The user's existing skills: `/home/alex/work/temp/skills` (also check `~/work/skills` if it exists).
- Scratch for clones: `~/work/temp/src`.

## 3. Sources of truth and precedence
1. **Cezar**, branch `wip/aw-cezar-runner-03-10-2026` @ `4a8344bc` (fork `Tomeckyyyy/rubikon.exe-cezar`,
   pinned main `1b13522d`). Inspect it in `~/work/cezar`. If that checkout is on another branch, do not
   switch it: use `git -C ~/work/cezar worktree add ~/work/temp/src/cezar-tpw-ref wip/aw-cezar-runner-03-10-2026`
   (fetch from the fork remote first if the branch is missing locally).
2. **Open Mercato skills** (`open-mercato/skills`) — the base and core. Reuse their structure, wording
   and safety rules before inventing anything. Look for an existing local checkout under `~/work`; otherwise
   clone to `~/work/temp/src/om-skills`. Keep MIT attribution on borrowed text.
3. **The user's local skills** in `/home/alex/work/temp/skills` — they define what "two-steps work" means
   to the user.
4. The earlier `prompt.md` (the solo two-phase design), if present in the prompts folder. Its rules on
   worktrees, branches, review gates, key leakage and tokenomics still apply; this spec extends it to teams.

Precedence: on style and conventions, the user's local skills win, then Open Mercato skills. On
requirements, this file wins. Log every conflict and its resolution.

Model names (Fable, Opus, Sonnet, Astra, Deepseek, Gemini Pro, Flash, Grok 4.7, Sol, Luna, Kimi) are
valid in Cezar. Keep them exactly as written; do not flag or replace them.

## 4. Product spec: what the skill set must do

### 4.1 Principle
Every step is an **autonomous task** (no chat back-and-forth). The human loop happens **between** steps,
through files that people fill in, review and share. Skills follow the Open Mercato naming rule:
`auto` in the name means autonomous and non-interactive.

### 4.2 Flow 1 — team, async, mixed licenses (implement fully)
Setting: a team leader (TL) has a high-tier Claude license (about 95 USD/month). Other developers have
cheaper access: Deepseek, Claude at 20 USD, Gemini Pro, and so on. Work must be split so cheaper models
can do real parts of it and the results merge cleanly later.

- **Step 0 (human).** A developer writes a detailed task description into `<run>/00-task/TASK.md`.
- **Step 1 — intake (autonomous, TL's strong model).** Analyses the task and the repo. Writes the problem
  statement, requirements, acceptance criteria, draft decisions, a first tokenomics estimate, and a
  proposed confidence/testing level. Outputs **Q&A files with defaults and options** for the team:
  - Fixed core set: `security-q_and_a.md`, `design-q_and_a.md`, `fe-q_and_a.md`, and one backend file
    per backend language in scope, named by language (`java-q_and_a.md`, `php-q_and_a.md`, `go-q_and_a.md`).
    If no backend language is detected, still output `java-q_and_a.md` only when Java is in the repo;
    otherwise `backend-q_and_a.md`.
  - Core for the TL: `ai-and-budget-q_and_a.md` (orchestrator and worker models, harnesses, who has which
    license, budget, confidence/testing level, criticality, review mode).
  - Extras per task when relevant: `testing-`, `data-`, `devops-`, `product-`, `api-contract-q_and_a.md`.
  - A core file with nothing to ask is still written, containing "No open questions" and the assumptions made.
- **Human loop A.** The TL shares the files. Team members answer. Each may run the helper skill
  `tpw-qa-assist` with their own (cheaper) model to check the AI defaults in their file against the repo.
- **Step 2 — plan (autonomous, TL's strong model).** Collects all answers, validates them (missing,
  contradictory, high-impact unanswered). If blocking gaps remain, it writes a round-2 Q&A containing
  only those questions and stops (maximum 2 rounds; after that, defaults are applied and flagged).
  Otherwise it produces the **execution folder** `<run>/02-plan/`: a multi-plan of self-contained work
  packages that different people, models and harnesses can execute in parallel, with assignments,
  a merge plan, automated tests, and a list of manual tests.
- **Human loop B.** The TL reviews the plan and signs off (edits `SIGNOFF.md`). Packages are handed out.
- **Step 3 — execute (autonomous, many executors).** The team or Cezar executes packages in parallel.
  Some are done by Grok, Deepseek and others on developers' machines. Each package produces one branch.
  The TL's orchestrator integrates the branches in merge-plan order, runs the gates and the reviews.
- **Step 4 — verify (human, guided).** People run the manual tests from the plan; results are recorded;
  the final report is written. Nothing merges to main automatically.

### 4.3 Flow 2 — as Flow 1, plus a rented remote machine (DESIGN ONLY)
Some packages run on a rented 500+ GB RAM machine. Main purpose: running local/open-weight LLMs as
workers. Secondary: heavy parallel agent work (many worktrees), for example rewriting microservices.
Heavy builds and data jobs are out of scope. Produce a design document only; implement nothing.
The Flow 1 plan format must already carry the fields Flow 2 needs (`placement: local|remote|either`).

### 4.4 Sharing modes for Q&A and plan files
- **Default: git.** The run folder lives in the task repo at `ai-output/tpw/<task>-<title>/` on branch
  `ai/tpw-<task>-<title>`. Answers arrive as commits or a PR on that branch. This branch is never merged
  to main; the skills must say so. Offer a variant: a separate private "AI notes" repository with the same layout.
- **Alternative: folder.** The run folder lives at `~/work/temp/tpw/<task>-<title>/`. Step 1 also writes
  a `share/` bundle (the Q&A files plus `HOWTO-ANSWER.md`) to send by chat or shared drive; Step 2
  imports returned files from `inbox/`.
- Mode is chosen by a flag or config value; default is git. Both modes use the identical layout.

### 4.5 Q&A file format (same for every file)
```markdown
---
file: java-q_and_a.md
area: backend-java
task: <task>
round: 1
owner:            # role or name, set by the TL
status: open      # open | answered | verified
---
## Q-JAVA-01 — <short title>
- Why it matters: <one or two lines, with file paths>
- Options: A) … B) … C) …
- Default (used if unanswered): B
- AI recommendation: B, confidence medium, because …
- Impact if wrong: low | medium | high
- Blocking: no            # yes = an explicit answer is required
- Answer:
- Answered by / date:
- Notes:
```
Rules: an empty answer means the default is accepted, except where `Blocking: yes`. Questions with
high impact are blocking. At most 10 questions per file per round, highest value first.

### 4.6 Work packages (the unit of parallel work)
Each package `WP-nn-<slug>/` holds `BRIEF.md`, `TESTS.md` and `STATUS.md`. The brief must be executable
by a mid-tier model with no other context: objective, acceptance criteria covered, a step-by-step
implementation guide, files owned (disjoint from parallel packages), files not to touch, interfaces
and contracts with other packages, exact commands, tests to add, definition of done, minimum model
tier, placement, estimated tokens, and dependencies.

### 4.7 Naming, isolation, cleanup
- `<task>` lower-kebab ≤24 chars; `<title>` lower-kebab ≤40 chars; `<stamp>` UTC `YYYYMMDD-HHMMSS`.
- Package branch: `feature/<task>-<wp>-<model>-<harness>-<stamp>`.
- Integration branch: `feature/<task>-integration-<stamp>`.
- Solo mode (one model does everything): `feature/<task>-<model>-<harness>-<stamp>`.
- Work happens in a clean temporary worktree next to the repo: `<repo>-for-ai/<model>-<stamp>`,
  created from the repo's main. After the work, the worktree is removed and pruned; only the branch stays.
- One executor = one worktree = one branch. Never share. Never force-push. Never delete branches.
  Never merge to main. Never use `--no-verify`. Never weaken or skip tests.

### 4.8 Quality
- Gate 0: all validation commands pass; every acceptance criterion maps to a passing test.
- Gate 1: review by a separate agent on a cheaper model, read-only. For critical tasks: two reviews
  (orchestrator-level and worker-level); the orchestrator merges both reports. Critical mode is
  confirmed by the TL in `ai-and-budget-q_and_a.md`.
- Gate 2: intent check by a fresh-context agent: does the result do what was asked, no more, no less?
- Self-review by the authoring agent does not count.
- Step 4 manual tests are part of the definition of done.

### 4.9 Security scope
`security-q_and_a.md` collects the team's security decisions and constraints so the plan respects
them. The workflow itself performs no security audit; a separate security-auditor session does that,
and the skills remind the user of it. The only enforced security gate is secret and key leakage:
a staged-diff scan before every commit (gitleaks if installed, regex fallback).

### 4.10 Tokenomics
- Strong model: intake, decomposition, plan, integration decisions, review merge.
  Mid-tier: implementation. Cheap (Sonnet, Flash class): tests, scripts, investigation, first-pass review.
- The plan includes `TOKENOMICS.md`: estimate per package and per role, mapped to who holds which license,
  so the TL's budget is spent only where a strong model is needed.
- Pass file paths, not file contents. Reports of 200–300 words. Parallelise only disjoint packages.
- Stop rule: a package that exceeds twice its estimate or fails its checks three times stops and reports.

### 4.11 Resumability
All state is in files: `STATE.json` (atomic writes), `HANDOFF.md` (rewritten), `NOTIFY.md` (append-only),
borrowed from the Open Mercato run-folder pattern. Any step can be resumed by a different model in a
different harness.
