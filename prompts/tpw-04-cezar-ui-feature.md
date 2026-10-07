# tpw-04-cezar-ui-feature.md — Stage 04: Cezar UI feature description

Read `tpw-00-common.md`, then `<output>/research/01-cezar.md`, `research/04-design-decisions.md` and,
if present, `<output>/templates/run-folder-layout.md`. Write one file:
`<output>/CEZAR-UI-FEATURE-two-phase-work.md`. Do not change Cezar code.

Write it in the style of the specs under `.ai/specs/` on the branch (same headings and depth).
State for each part whether it builds on an existing feature (cite the file) or is new.

## Required content
1. Problem, users (team leader, team member), goals, non-goals.
2. File contract: the feature reads and writes the TPW run folder only; no database.
3. Screens, each with a text mock-up:
   - **Runs**: list of TPW run folders in a project, with step and who must act next.
   - **Intake**: pick or paste TASK.md, choose sharing mode, start Step 1.
   - **Q&A board**: one column per Q&A file; owner, answered and blocking counts; open a question,
     see options, default, AI recommendation; answer in place; "accept all defaults" per file;
     export and import for folder mode; diff of answers arriving from git.
   - **Plan**: package table, dependency graph, assignments (person, model, harness, placement),
     tokenomics per person and license, manual-test list, sign-off button that writes SIGNOFF.md and READY.
   - **Model matrix**: role × runner × model with search; cheap-model roles; criticality and dual review.
   - **Execution**: packages as cards (local Cezar, external human-run, remote), branch per package,
     integration progress, gates as chips, cost by runner and model.
   - **Verify**: manual-test checklist with pass, fail, notes; final report.
4. External executors: how a package done outside Cezar (a developer with Deepseek) appears: by its
   pushed branch and `STATUS.md`.
5. CLI and API surface that mirrors the screens, so every action also works headless.
6. Flow 2 hooks: a placement column and a remote target, marked "future".
7. Phasing (smallest useful slice first: Runs + Q&A board + Plan sign-off), risks, acceptance
   criteria, open questions.
