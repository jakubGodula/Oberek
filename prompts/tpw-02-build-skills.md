# tpw-02-build-skills.md — Stage 02: build the Flow 1 skill set

Read `tpw-00-common.md`, `tpw-DESIRED-OUTPUT.md`, then `<output>/research/*.md` (path in
`.tpw-current-output`). If the research files are missing, stop and say stage 01 must run first.

## Goal
Write everything in layout A of `tpw-DESIRED-OUTPUT.md` except `FLOW2-…`, `CEZAR-UI-FEATURE-…` and
`SELFCHECK.md`. Open Mercato skills are the base: start each skill from its OM ancestor
(`research/02-om-skills.md`) and change only what TPW needs. Apply the user's conventions from
`research/03-user-skills.md`.

## Build order (commit to disk after each item; update BUILD_STATE.md)
1. `templates/` — all files. The Q&A template and rules follow common §4.5. Question banks give, per
   area, 15–25 reusable questions with typical options, so intake picks and adapts rather than invents.
   `ai-and-budget` must cover: orchestrator model, worker models per person, harness per person, license
   and budget per person, cheap-model roles, criticality, review mode (single or dual), confidence and
   testing level, sharing mode, and whether a separate security audit session is planned.
2. `scripts/` — `tpw-paths.sh` (names and paths from inputs), `tpw-worktree.sh` (create, list, remove),
   `tpw-secret-scan.sh`, `tpw-state.sh` (atomic STATE.json updates), `tpw-qa-collect.sh` (gathers answers
   from the git branch or from `inbox/`, reports unanswered and blocking questions as a table),
   `tpw-share-bundle.sh` (folder mode). All must pass `bash -n` and run on Linux and macOS.
3. Skills, each with `SKILL.md` and `references/`:
   - **tpw-auto-intake** (Step 1). Input: `<run>/00-task/TASK.md`, repo path, sharing mode. Uses cheap
     subagents for repo investigation. Output: `01-intake/` complete. Never asks in chat. Ends by printing
     what to share and with whom.
   - **tpw-qa-assist** (human loop A). Run by a team member on any model. Input: one Q&A file. It checks
     each default against the repo, adds evidence under Notes, proposes an answer, and sets nothing as
     final: the human confirms by editing `Answer`. Plain instructions, no subagents required.
   - **tpw-auto-plan** (Step 2). Collects and validates answers. Blocking gaps → writes `qa-round2/` and
     stops (max 2 rounds, then defaults applied and flagged in `ANSWERS-RESOLVED.md`). Otherwise writes
     `02-plan/` complete. Decomposition rules: disjoint file ownership, explicit contracts between
     packages, each package sized for one executor session, minimum model tier and placement per package,
     assignments that match licenses in `ai-and-budget`, automated tests per acceptance criterion,
     integration tests across packages, and `MANUAL-TESTS.md`. Waits for the TL through `SIGNOFF.md`;
     the router skill writes `READY` with the checksum once sign-off is present.
   - **tpw-auto-worker** (Step 3, one package). Input: a package folder. Creates its worktree and branch
     (common §4.7), follows the brief, one commit per logical step, secret scan before each commit, runs
     the package tests, writes `REPORT.md`, updates `STATUS.md`, removes the worktree. Must work when run
     by a developer by hand in any harness, and when dispatched by Cezar.
   - **tpw-auto-execute** (Step 3, orchestrator). Verifies `READY`. Dispatches unassigned-to-human
     packages (Cezar dispatch or harness subagents), tracks human-run packages by their `STATUS.md` and
     pushed branches, integrates into `feature/<task>-integration-<stamp>` in merge-plan order with the
     gate after each merge, then calls review.
   - **tpw-auto-review**. Gates 0–2 (common §4.8), single or dual review, merged report.
   - **tpw-manual-verify** (Step 4). Walks a person through `MANUAL-TESTS.md` one check at a time when
     run in chat, or prints a checklist to fill in. Writes `MANUAL-TEST-RESULTS.md` and `FINAL-REPORT.md`.
   - **tpw-resume** and the router **two-phase-work** (reads STATE.json, says which skill is next and
     who must act; supports solo mode where one model takes all roles).
4. `cezar/` — workflow YAMLs in the schema found on the branch, one per autonomous step, with runner
   and model per step; `config.snippet.json`; `HOWTO-cezar.md` with exact commands for starting each
   step from a run folder. Validate if the branch offers a validator; otherwise mark UNTESTED.
5. `harness/` — Claude Code subagent definitions and HOWTO; a generic HOWTO for running one work
   package with Deepseek, Gemini or Grok tooling (paste-ready prompt that points at a package folder).
6. `EXAMPLES/flow1-dry-run/` — a full fake run folder: a realistic task touching a Java service, a
   PHP/Laravel service and a React front end; all Q&A files with some answered, some defaulted; a plan
   with 5–7 packages assigned to different models; reports; reviews; manual test results.
7. `README.md`, `INSTALL.md`, `SUMMARY.md`.

## Done when
The acceptance checklist items in `tpw-DESIRED-OUTPUT.md` §C that concern skills, templates, scripts,
Cezar files and the example are met.
