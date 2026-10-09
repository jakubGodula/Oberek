# HANDOFF.md — for whoever (human or model) continues this run

State: Step 1 intake done; Step 2 plan written as a DRAFT on Q&A defaults; waiting for human loop A (answers).

To continue as the plan step after answers arrive:
1. Collect answered files: files in `01-intake/inbox/` override the same-named files in `01-intake/qa/`.
2. For each question: if `Answer:` is non-empty, use it; else apply `Default`. Any `Blocking: yes` with an empty answer
   → write `01-intake/qa-round2/<same file>` containing only those questions and stop (round 2 of max 2).
3. Rewrite `02-plan/ANSWERS-RESOLVED.md` with sources. Where an answer differs from the default, update:
   `02-plan/PLAN.md`, the affected `packages/WP-nn/BRIEF.md` (the "Interfaces" and "Step-by-step" sections cite the
   Q ids), `ASSIGNMENTS.md` (names, models), `MODEL-MATRIX.md`, `TOKENOMICS.md`, `MERGE-PLAN.md` if the module split changed.
   Known high-impact switches: Q-DESIGN-01 (platform), Q-SOL-02 (library), Q-SOL-03 (NFT standard), Q-SOL-05
   (custom program vs SAS → WP-02 becomes optional and WP-07's committer changes), Q-SOL-06 (Blink surface → WP-08
   scope), Q-PAY-01 (protocol), Q-AGENT-01 (agent runtime), Q-PROD-04 (storyline → MANUAL-TESTS).
4. Ask the TL to sign `02-plan/SIGNOFF.md`; then write `02-plan/READY` with the PLAN.md checksum. Update `STATE.json`.

To continue as the execute step: verify `02-plan/READY`, create `03-execution/`, dispatch per `ASSIGNMENTS.md`,
integrate per `MERGE-PLAN.md`, review per `PLAN.md` §5.

Nothing in this folder contains secrets. Reference material lives in `research/`; the source documents are in the parent folder.
