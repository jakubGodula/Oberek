# TESTS.md — WP-01 Foundation

| # | file | proves | command |
|---|------|--------|---------|
| 1 | `apps/mercato/src/modules/solana_core/__tests__/skeleton.test.ts` (and the same file in `solana_gates`, `solana_events`, `solana_actions`, `solana_attestations`) | `metadata.name` equals the folder name; `acl.ts` exports `<module>.view` and `<module>.manage`; `events.ts` exports an (empty) `as const` array | `yarn test --testPathPattern skeleton` |
| 2 | `packages/gateway-solana/src/modules/gateway_solana/__tests__/skeleton.test.ts` | package resolves, `metadata.name === 'gateway_solana'`, `integration.ts` declares `treasuryWallet` and `acceptedMints` credential fields | `yarn test --testPathPattern gateway_solana` |
| 3 | `scripts/__tests__/env-example.test.ts` | every key in BRIEF §6 exists in `apps/mercato/.env.example` and none has a non-placeholder value | `yarn test --testPathPattern env-example` |
| 4 | `scripts/__tests__/resolutions.test.ts` | root `package.json` `resolutions["@solana/web3.js"]` starts with `1.99.` and equals the pin in `apps/mercato/package.json` | `yarn test --testPathPattern resolutions` |
| 5 | `.github/workflows/ci.yml` (no file) | the whole validation set is green in CI on the package branch | push → GitHub Actions |
| 6 | `programs/aegis_registry` (no file) | the empty program builds locally and in Docker; `anchor keys sync` leaves the tree clean | `anchor build && git status --porcelain` |
| 7 | manual, recorded in REPORT.md | gitleaks hook blocks a staged file containing a fake 88-char base58 string | stage a dummy file → `git commit` → expect rejection → remove file |
| 8 | manual, recorded in REPORT.md | `docker compose -f deploy/docker-compose.vps.yml config` validates | the command |
