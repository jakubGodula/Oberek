# SIGNOFF.md — team lead sign-off for the execution plan

Plan version: DRAFT-1 (defaults only, 2026-10-07). Re-issue as PLAN-1 after the Q&A answers are merged.

- [ ] All blocking questions answered (see `ANSWERS-RESOLVED.md`; 15 blocking in round 1)
- [ ] Package table, assignments and model matrix reviewed; names filled in `ASSIGNMENTS.md`
- [ ] Contracts (`api-contract` answers) frozen and copied to the repo as `docs/CONTRACTS.md` by WP-01
- [ ] Manual tests accepted as the definition of done for Step 4
- [ ] Security-review session scheduled (day 11)

Signed off by: ______________________  date: __________

When this file is signed, the router writes `READY` next to it with the checksum of `PLAN.md`
(`shasum -a 256 02-plan/PLAN.md | cut -c1-16 > 02-plan/READY`). WP-01 may start before sign-off; nothing else may.
