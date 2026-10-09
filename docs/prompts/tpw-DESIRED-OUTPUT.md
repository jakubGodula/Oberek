# tpw-DESIRED-OUTPUT.md — what must exist when all stages are done

Two layouts are defined here: (A) the build output that the stage prompts produce once, and
(B) the run folder that the produced skills create for every real task.

## A. Build output: `<output>` = `~/work/output/two-phase-work-<model>-<harness>-<stamp>`

```
<output>/
  README.md                     # what this is; quickstart for TL and for a team member
  SUMMARY.md                    # findings, decisions, what was reused from where, next steps
  ASSUMPTIONS.md
  BUILD_STATE.md
  INSTALL.md                    # install into ~/.claude/skills, a repo's .ai/skills, and Cezar (skillsRepos)
  research/
    01-cezar.md                 # capability table for branch @ 4a8344bc: VERIFIED / CHANGED / ABSENT, with file paths
    02-om-skills.md             # borrow list: OM file -> what is reused -> where it lands
    03-user-skills.md           # the user's two-steps conventions; conflicts and resolutions
    04-design-decisions.md      # packaging and flow decisions, with reasons
  skills/
    two-phase-work/             # router: detects run state, tells which skill runs next
    tpw-auto-intake/            # Step 1
    tpw-qa-assist/              # human loop A helper; must work on cheap models
    tpw-auto-plan/              # Step 2
    tpw-auto-execute/           # Step 3, orchestrator and integrator side
    tpw-auto-worker/            # Step 3, one work package
    tpw-auto-review/            # gates 0-2, single and dual review, merged report
    tpw-manual-verify/          # Step 4
    tpw-resume/
      (each: SKILL.md + references/*.md, OM-style)
  templates/
    run-folder-layout.md
    STATE.json
    TASK.md  PROBLEM.md  DECISIONS-DRAFT.md
    q_and_a.template.md  QA-INDEX.md  HOWTO-ANSWER.md
    question-banks/security.md design.md fe.md backend.md ai-and-budget.md testing.md data.md devops.md
    PLAN.md  WP-BRIEF.md  WP-TESTS.md  WP-STATUS.md
    ASSIGNMENTS.md  MERGE-PLAN.md  TEST-PLAN.md  MANUAL-TESTS.md
    MODEL-MATRIX.md  TOKENOMICS.md  SIGNOFF.md
    HANDOFF.md  NOTIFY.md
    REVIEW-REPORT.md  REVIEW-MERGED.md  INTENT-CHECK.md
    MANUAL-TEST-RESULTS.md  FINAL-REPORT.md
  cezar/
    workflows/tpw-intake.yaml  tpw-plan.yaml  tpw-execute.yaml  tpw-worker.yaml  tpw-review.yaml
    config.snippet.json
    HOWTO-cezar.md
  harness/
    claude-code/agents/*.md     # reviewer, investigator, test-runner, intent-checker
    claude-code/HOWTO-claude-code.md
    other/HOWTO-generic-harness.md   # running a work package with Deepseek, Gemini, Grok tooling
  scripts/
    tpw-paths.sh  tpw-worktree.sh  tpw-secret-scan.sh  tpw-state.sh  tpw-qa-collect.sh  tpw-share-bundle.sh
  FLOW2-remote-machine-design.md        # design only
  CEZAR-UI-FEATURE-two-phase-work.md    # feature spec
  EXAMPLES/
    flow1-dry-run/              # a complete fake run folder (layout B) with every file filled in
  SELFCHECK.md                  # result of stage 05
```

## B. Run folder, created per task by the skills: `<run>`
Git mode (default): `<repo>/ai-output/tpw/<task>-<title>/` on branch `ai/tpw-<task>-<title>`.
Folder mode: `~/work/temp/tpw/<task>-<title>/`.

```
<run>/
  STATE.json   HANDOFF.md   NOTIFY.md
  00-task/TASK.md                       # written by a developer
  01-intake/
    PROBLEM.md                          # restatement, FR, NFR, out of scope, acceptance criteria, risks
    DECISIONS-DRAFT.md                  # decisions already taken by AI, each with a reason
    TOKENOMICS-ESTIMATE.md              # first estimate, confidence and testing level proposal
    QA-INDEX.md                         # table: file, owner, questions, blocking, status
    HOWTO-ANSWER.md
    qa/security-q_and_a.md  design-q_and_a.md  fe-q_and_a.md  <lang>-q_and_a.md  ai-and-budget-q_and_a.md  [extras]
    qa-round2/                          # only if Step 2 found blocking gaps
    share/  inbox/                      # folder mode only
  02-plan/                              # the execution folder
    PLAN.md                             # package table first: id, title, depends-on, parallel group, tier, placement, assignee, status
    packages/WP-01-<slug>/BRIEF.md TESTS.md STATUS.md
    ASSIGNMENTS.md                      # package -> person -> model -> harness
    MODEL-MATRIX.md   TOKENOMICS.md
    MERGE-PLAN.md                       # integration order, contract checks, conflict policy
    TEST-PLAN.md                        # acceptance criterion -> automated test, commands
    MANUAL-TESTS.md                     # numbered manual checks for Step 4, with expected results
    ANSWERS-RESOLVED.md                 # every question with the final answer and its source (human or default)
    SIGNOFF.md   READY                  # READY holds the checksum of the plan after TL sign-off
  03-execution/<wp>-<model>-<stamp>/REPORT.md HANDOFF.md LOCK
  03-execution/integration-<stamp>/INTEGRATION-LOG.md
  04-verification/REVIEW-REPORT.md [REVIEW-MERGED.md] INTENT-CHECK.md MANUAL-TEST-RESULTS.md FINAL-REPORT.md
```

In the task repo itself, after Step 3: package branches `feature/<task>-<wp>-<model>-<harness>-<stamp>`
and one `feature/<task>-integration-<stamp>`. No leftover worktrees.

## C. Acceptance checklist for the whole build
- [ ] Every path in layout A exists; no "TBD" outside ASSUMPTIONS and open-question sections.
- [ ] Every `SKILL.md` has valid frontmatter (`name` equals folder name, a specific `description` with
      trigger phrases), a numbered algorithm, inputs, outputs, stop conditions, resume notes; body under ~5,000 tokens.
- [ ] Each `auto` skill runs with no user interaction; all human input arrives through files.
- [ ] `tpw-qa-assist` and `tpw-auto-worker` avoid harness-specific features, so they work with cheap models.
- [ ] Both sharing modes work with the same layout; git is the default.
- [ ] Core Q&A set, extras rule, round-2 rule and blocking rule are implemented as in `tpw-00-common.md`.
- [ ] Work-package briefs in the example are executable without other context and carry `placement`.
- [ ] Scripts pass `bash -n`; `tpw-paths.sh` sample output is shown in README.
- [ ] Cezar workflow YAMLs are validated against the branch's schema and marked TESTED or UNTESTED.
- [ ] `research/01-cezar.md` cites concrete files from commit `4a8344bc`.
- [ ] `research/02-om-skills.md` shows Open Mercato skills as the base: each TPW skill names its OM ancestor.
- [ ] `FLOW2-remote-machine-design.md` and `CEZAR-UI-FEATURE-two-phase-work.md` are complete per their stage prompts.
- [ ] Secret scan over `<output>` is clean; result recorded in SUMMARY.md.
