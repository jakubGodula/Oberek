# TESTS.md — WP-10

| # | file | proves | command |
|---|------|--------|---------|
| T-10-01 | `scripts/__tests__/demo-e2e.plan.test.ts` | `--dry-run` prints all 10 steps in order with the routes they call; `--from 6` starts at the payment step. | `yarn test scripts` |
| T-10-02 | `scripts/__tests__/seed-demo.test.ts` | Seed run twice against a test DB creates exactly one tenant, 3 products, 2 customers, 1 gate rule, 1 agent registration (idempotency). | `yarn test scripts` (needs `DATABASE_URL` of the test DB) |
| T-10-03 | manual: `yarn tsx scripts/demo-e2e.ts` on devnet | Full storyline succeeds; every signature resolves on the explorer with `?cluster=devnet`. | run on days 10 and 13; paste output into REPORT.md |
| T-10-04 | manual: README setup on a clean machine | A teammate reaches `/backend` with seeded data in ≤ 10 minutes following README only. | record minutes in REPORT.md |
