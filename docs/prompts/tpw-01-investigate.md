# tpw-01-investigate.md — Stage 01: investigate the sources of truth

Read `/home/alex/work/temp/prompts/tpw-00-common.md` and `tpw-DESIRED-OUTPUT.md` first. Follow them.

## Goal
Create `<output>`, then write the four research files. No skills are written in this stage.

## Steps
1. Resolve and create `<output>` (common §2). Write its path to
   `/home/alex/work/temp/prompts/.tpw-current-output`. Start `BUILD_STATE.md` and `ASSUMPTIONS.md`.
2. **Cezar** → `research/01-cezar.md`.
   - Get a read-only view of `wip/aw-cezar-runner-03-10-2026` @ `4a8344bc` (common §3). Confirm the commit
     with `git rev-parse`. Record `git log --oneline 1b13522d..HEAD` and `git diff --stat 1b13522d...HEAD`.
   - List `~/work/cezar*` and note what each project is and whether it matters here.
   - Read: `README.md`, `docs/`, `AGENTS.md`, `AGENT_PROTOCOL.md`, `SDLC.md`, `CODE_REVIEW.md`, `.env.example`,
     `.ai/specs/*`, `.ai/skills/*`, `.ai/cezar/*`, the runner contract (`packages/contract/src/runners.ts` or
     its equivalent), and the code for workflows, dispatch, config and the CLI.
   - Produce a capability table, each row VERIFIED / CHANGED / ABSENT with file paths and exact commands:
     worktree per task and where worktrees and branches are placed; workflow YAML schema (`steps`, `prompt`,
     `skill`, `runner`, model per step, `command`, `onFail`); the list of runners and how a model is chosen
     for each; model discovery; config keys (`skillsRepos`, `defaultRunner`, `baseBranch`, checkout root,
     parallel cap); dispatch (`cez task create|report|list|tree`, caps, budgets, child branches, `--kind review`);
     autonomous mode; variants; review gate; landing check; run-history and cost data; Mission Control;
     handoff export/import; starting a task from a file or folder; headless run versus serve; anything
     this branch adds to the runner.
   - End with "What TPW can use as-is", "What needs glue", "What needs a new feature".
3. **Open Mercato skills** → `research/02-om-skills.md`.
   - Locate or clone the repository (common §3). Record the commit and the skill count you observe.
   - Read in full: `om-auto-create-pr-loop`, `om-auto-continue-pr-loop`, `om-brainstorm`, `om-spec-writing`,
     `om-code-review`, `om-auto-review-pr`, `om-integration-tests`, plus `om-auto-create-pr`,
     `om-check-and-commit`, `om-setup-agent-pipeline`, `om-create-skill`, their `references/`, and
     `.ai/agentic.config.json` handling.
   - Write a borrow list. For every planned TPW skill name its OM ancestor and what is copied or adapted:
     intake ← om-brainstorm + om-spec-writing (open-questions gate becomes Q&A files);
     plan ← om-auto-create-pr-loop (PLAN with task table, HANDOFF, NOTIFY, checkpoints, tier hints);
     execute and resume ← om-auto-create-pr-loop + om-auto-continue-pr-loop;
     review ← om-code-review + om-auto-review-pr; tests ← om-integration-tests.
     Confirm or correct this mapping from what you read.
4. **User skills** → `research/03-user-skills.md`.
   - Read everything under `/home/alex/work/temp/skills` (and `~/work/skills` if present), recursively.
   - Extract the two-steps structure, wording, folder and naming habits, and model and harness habits.
     List conflicts with common §4 and resolve them by the precedence rule.
5. **Decisions** → `research/04-design-decisions.md`: packaging (set of skills + templates + Cezar
   workflows), how each TPW step maps onto Cezar features found in step 2, which step runs where
   (Cezar cockpit, Claude Code, other harness), and open risks with mitigations.
6. Update `BUILD_STATE.md` (stage 01 done). Print the `<output>` path and a five-line summary.

## Done when
The four research files exist, cite concrete paths, and state clearly anything that could not be read.
