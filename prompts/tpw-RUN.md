# tpw-RUN.md — master prompt: run all stages

You are the coordinator. Everything you need is in `/home/alex/work/temp/prompts`.
Run autonomously to the end; do not ask the user anything unless truly blocked.

1. Read `tpw-00-common.md` and `tpw-DESIRED-OUTPUT.md`.
2. If `.tpw-current-output` exists and its `BUILD_STATE.md` shows an unfinished build, resume from the
   first unfinished stage. Otherwise start fresh.
3. Run the stages below. Run each one as a separate subagent with a fresh context, giving it only this
   instruction: "Read and execute /home/alex/work/temp/prompts/<stage file>." Keep your own context
   small: take back a summary of at most 200 words per stage.

   | Order | Stage file                     | Depends on | Suggested model |
   |-------|--------------------------------|------------|-----------------|
   | 1     | tpw-01-investigate.md          | —          | strong          |
   | 2     | tpw-02-build-skills.md         | 01         | strong          |
   | 2     | tpw-03-flow2-remote-design.md  | 01         | strong          |
   | 3     | tpw-04-cezar-ui-feature.md     | 01, 02     | strong          |
   | 4     | tpw-05-selfcheck.md            | all        | a different model from stage 02 if available |

   Stages 02 and 03 may run in parallel. Inside a stage, cheap models may be used for file reading,
   linting and script checks.
4. After each stage, check that its "Done when" holds by looking at the files, not at the stage's own
   summary. If it does not hold, rerun the stage once with the gap described; then continue and record
   the gap in `BUILD_STATE.md`.
5. Finish by printing the final message that `tpw-05-selfcheck.md` asks for.
