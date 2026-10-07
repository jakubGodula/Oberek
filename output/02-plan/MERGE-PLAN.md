# MERGE-PLAN.md — integration order, contract checks, conflict policy

Integration branch: `feature/om-solana-integration-<stamp>` created from the fork's default branch after WP-01 lands
(day 2). All package branches start from the integration branch at that time; packages that start later (WP-07…WP-10)
branch from the integration branch as it is on their start day.

## Order
| step | merge | day | gate after merge | contract check |
|------|-------|-----|------------------|----------------|
| 0 | WP-01 → integration | 2 | Gate 0 (`yarn generate && yarn typecheck && yarn lint && yarn test`), skeleton app boots, CI green | `docs/CONTRACTS.md` matches `api-contract` answers |
| 1 | WP-03 solana_core | 5 | Gate 0 + Gate 1 single + Gate 2 | `SolanaCoreService` + fake exported; SIWS routes conform to Q-API-01 |
| 2 | WP-02 anchor program | 6 | Gate 0 (LiteSVM tests) + Gate 1 dual + Gate 2 | IDL at `solana_attestations/idl/aegis_registry.json` matches Q-API-05; program id in `.env.example` (TL edits) |
| 3 | WP-06 solana_events | 6 | Gate 0 + single + intent | event payload = Q-API-03; dedup on signature |
| 4 | WP-04 solana_gates | 6 | Gate 0 + single + intent | rule schema = Q-SOL-04 notes; routes = Q-API-01 |
| 5 | WP-05 gateway-solana | 7 | Gate 0 + **dual** + intent | adapter registered; transaction-request route; reconciliation tests table complete |
| 6 | WP-07 attestations + agents | 10 | Gate 0 + **dual** + intent | approvals API; tool names = Q-API-04; PolicyGuard on every mutation |
| 7 | WP-08 solana_actions | 10 | Gate 0 + single + intent | conformance suite green; inspector loads all three actions on the public URL |
| 8 | WP-09 dashboard + portal | 11 | Gate 0 + single + intent | no API changes (UI only) |
| 9 | WP-10 demo + submission | 13 | Gate 0 + intent; E2E script green on devnet | seed idempotent |
| 10 | WP-11 / WP-12 (optional) | 13 | Gate 0 + single | must not touch merged contracts |

Each merge: `git merge --no-ff <package-branch>` into the integration branch inside the TL's worktree, run the gate,
write `03-execution/integration-<stamp>/INTEGRATION-LOG.md` (branch, sha, gate results, review report paths).
Migrations: after each merge run `yarn db:generate` and confirm no diff (packages ship their migrations); if two
packages generated conflicting snapshots, regenerate once on the integration branch and record it.

## Conflict policy
- Shared files (`modules.ts`, root `package.json`, `.env.example`, CI, `eslint.ds.config.mjs`) are edited only by the
  TL during integration from the package's `REPORT.md` "requested shared changes" section.
- A contract change discovered mid-package: stop, write it in `STATUS.md` + `NOTIFY.md`, TL decides, both affected
  packages rebase. No silent interface changes.
- Rebase, never force-push: a package that falls behind the integration branch merges the integration branch into
  its own branch (`git merge feature/om-solana-integration-<stamp>`) before asking for review.
- Never merge to `main`. The fork's `main` stays at upstream v0.8.0 + WP-01 only until the hackathon ends; the demo
  deploys from the integration branch.

## Human-run packages
Tracked by `02-plan/packages/WP-nn/STATUS.md` (updated by the person) and the pushed branch name. The orchestrator
polls both; a package with no push for 2 days is flagged in `NOTIFY.md`.
