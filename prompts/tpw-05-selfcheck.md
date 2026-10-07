# tpw-05-selfcheck.md — Stage 05: verify the build

Read `tpw-00-common.md` and `tpw-DESIRED-OUTPUT.md`. Work on `<output>` (path in `.tpw-current-output`).
Act as an independent reviewer: assume earlier stages made mistakes.

1. Check every item of the acceptance checklist (`tpw-DESIRED-OUTPUT.md` §C). Record pass or fail with evidence.
2. Lint: frontmatter of every `SKILL.md`; `bash -n` on every script; run `tpw-paths.sh` with a sample;
   validate YAML and JSON files; search for "TBD", "TODO", broken relative links.
3. Trace test, on paper, using `EXAMPLES/flow1-dry-run/`: for each step, can the skill run from the
   files of the previous step alone, with no chat input? Does a mid-tier model have all it needs in one
   package brief? Can Step 3 resume after a lost session from STATE.json and HANDOFF.md?
4. Consistency: names, paths, branch patterns and file names are identical across skills, templates,
   scripts, Cezar files, the UI spec and the Flow 2 design.
5. Run the secret scan over `<output>`.
6. Fix what fails. What cannot be fixed goes into `SELFCHECK.md` as an open issue with a suggested fix.
7. Write `SELFCHECK.md` and finish `SUMMARY.md`. Final message: the `<output>` path, pass and fail
   counts, open issues, and the exact commands to (a) install the skills, (b) start Step 1 for a new
   task as team leader, (c) answer a Q&A file as a team member, (d) run Step 2, (e) run one work
   package by hand, (f) run Step 3 in Cezar.
