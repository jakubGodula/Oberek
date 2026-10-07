# WP-01 — Foundation: fork, toolchain, module skeletons, contracts, CI, hosting

| field | value |
|---|---|
| Package id | WP-01 |
| Branch | `feature/om-solana-wp-01-<model>-<harness>-<stamp>` |
| Worktree | `<repo>-for-ai/<model>-<stamp>` (from the fork's default branch; this package *creates* the integration branch, see MERGE-PLAN.md) |
| Minimum model tier | strong |
| Placement | local |
| Estimated tokens | 1.0 M |
| Estimated effort | 2 person-days (days 1–2) |
| Depends on | — (first package; everything else depends on it) |
| Dual review | no (single review, but the TL executes it personally) |

## 1. Objective (2–4 sentences)
Fork Open Mercato at `v0.8.0`, pin every toolchain version, create empty-but-building skeletons for the five Solana
modules and the `gateway-solana` package, freeze the cross-package contracts in `docs/CONTRACTS.md`, and stand up CI,
the secret scan and the VPS hosting files. When this package is merged, every other package can start on its own
branch and compile against the skeletons without touching shared files.

## 2. Acceptance criteria covered
- AC-11 (partial): `yarn generate && yarn typecheck && yarn lint && yarn test` pass on the fork with all six empty units registered; CI runs the same set and is green.
- Enables AC-1…AC-10 by providing module folders, env keys, toolchain pins and the Anchor workspace that builds an empty program.

## 3. Read first (exact files in the repo; nothing else)
1. `AGENTS.md` (root) — the task router and the validation set (`yarn generate`, `build:packages`, `typecheck`, `lint`, `test`, `build:app`).
2. `.ai/docs/module-development.md` — module anatomy, `modules.ts` registration, the `om-ds/*` ESLint block per module in `eslint.ds.config.mjs`.
3. `apps/mercato/src/modules/example/` — the reference module (`index.ts`, `acl.ts`, `setup.ts`, `di.ts`, `events.ts`, `i18n/en.json`, `migrations/`).
4. `apps/mercato/src/modules.ts` — where `enabledModules` lives.
5. `packages/gateway-stripe/` (`package.json`, `src/modules/gateway_stripe/index.ts`, `di.ts`, `integration.ts`) — the model for a provider package.
6. `apps/docs/docs/framework/modules/building-gateway-provider.mdx`.
7. `apps/mercato/.env.example`, `docker-compose.yml`, `Dockerfile`, `starters/docker/*`, `.github/workflows/*` (whatever exists).
8. `README.md` "Quick start" (corepack enable → `yarn infra:up` → `.env` → `yarn dev:greenfield`).
9. `/Users/macbook/work/sandbox/solana-2026/output/01-intake/qa/api-contract-q_and_a.md` (Q-API-01…05) and `01-intake/qa/typescript-q_and_a.md` Q-TS-04/05 — the contracts to copy into `docs/CONTRACTS.md`.
10. `/Users/macbook/work/sandbox/solana-2026/output/research/02-solana-stack-2026.md` §0, §3, §4 — the version pins.

## 4. Files owned (create/modify only these)
- Repo-level: `package.json` (root: `resolutions`, `engines`), `.nvmrc` (24), `.yarnrc.yml` (unchanged unless needed), `rust-toolchain.toml` (`channel = "1.89.0"`), `.gitleaks.toml`, `.husky/pre-commit` or `lefthook.yml` (whichever the repo already uses; otherwise a plain `scripts/pre-commit.sh` wired via `core.hooksPath`), `.github/workflows/ci.yml`, `.github/workflows/anchor.yml`, `docs/CONTRACTS.md`, `docs/SETUP.md`, `docs/research/solana-stack-2026.md`, `docs/research/open-mercato-seams.md`, `deploy/docker-compose.vps.yml`, `deploy/Caddyfile`, `deploy/README.md`.
- `apps/mercato/.env.example` (add keys listed in §7 step 5), `apps/mercato/src/modules.ts` (six new entries), `eslint.ds.config.mjs` (six `om-ds` blocks), `apps/mercato/package.json` (Solana dependencies with exact versions).
- Module skeletons: `apps/mercato/src/modules/solana_core/`, `solana_gates/`, `solana_events/`, `solana_actions/`, `solana_attestations/` — each with `index.ts`, `acl.ts`, `setup.ts`, `di.ts`, `events.ts`, `i18n/en.json`, `data/entities.ts` (empty export), `migrations/.gitkeep`, `README.md` (one paragraph: owner package id, what goes here).
- `packages/gateway-solana/` — `package.json` (`@open-mercato/gateway-solana`, version `0.8.0`, workspace deps mirroring `gateway-stripe`), `tsconfig.json`, `src/modules/gateway_solana/{index.ts,acl.ts,setup.ts,di.ts,events.ts,integration.ts,i18n/en.json,README.md}`.
- `programs/aegis_registry/` — Anchor workspace: `Anchor.toml`, `Cargo.toml` (workspace), `programs/aegis_registry/Cargo.toml`, `programs/aegis_registry/src/lib.rs` (empty `#[program]` with one `initialize` no-op or none), `tests/.gitkeep`, `package.json` (LiteSVM + `@anchor-lang/core@1.2.1`), `Dockerfile.anchor` (Rust 1.89 + Agave 4.3.0 + Anchor 1.2.1).
- `scripts/fund-wallet.ts`, `scripts/mint-test-token.ts`, `scripts/README.md`.

## 5. Files NOT to touch
- Any code inside `packages/core`, `packages/shared`, `packages/ai-assistant`, `packages/webhooks`, `packages/checkout`, `packages/gateway-stripe` beyond reading. No business logic inside the new module folders (skeletons only; the owning packages WP-02…WP-09 fill them).
- After this package is merged, the shared files above (`modules.ts`, root `package.json`, `apps/mercato/package.json`, CI, `.env.example`, `eslint.ds.config.mjs`) belong to the TL during integration. Later packages must request changes to them in their `REPORT.md` under "Shared-file changes requested".

## 6. Interfaces and contracts
This package *publishes* the contracts; it implements none of them.
- `docs/CONTRACTS.md` must contain verbatim: routes (Q-API-01), `SolanaCoreService` (Q-API-02), the normalised event payload (Q-API-03), agent tool names (Q-API-04), the program instruction set (Q-API-05), the event ids (Q-TS-05), the table names (Q-TS-04), and the module ↔ package ownership table from `PLAN.md` §1.
- Env keys (in `apps/mercato/.env.example`, with comments, no values): `DATABASE_URL`, `JWT_SECRET`, `REDIS_URL`, `SOLANA_CLUSTER=devnet`, `SOLANA_RPC_URL`, `HELIUS_API_KEY`, `HELIUS_WEBHOOK_AUTH`, `SOLANA_HOT_WALLET_SECRET`, `AEGIS_PROGRAM_ID`, `TREASURY_WALLET`, `USDC_MINT=4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`, `PQC_DSA_SECRET`, `PUBLIC_BASE_URL`, plus three keys reserved for later packages: `DEMO_API_KEY` (WP-10, MCP/e2e API key), `X402_FACILITATOR_URL`, `X402_PAY_TO` (WP-12, optional). 16 keys in total.
- Module ids and ACL feature prefixes: `solana_core`, `solana_gates`, `solana_events`, `solana_actions`, `solana_attestations`, `gateway_solana`; each `acl.ts` declares `<module>.view` and `<module>.manage` (`dependsOn: ['<module>.view']`); each `setup.ts` grants `admin: ['<module>.*']`, `employee: ['<module>.view']`.
- Dependency pins (exact, in `apps/mercato/package.json`): `@solana/web3.js@1.99.0` (or the latest 1.99.x on day 1 — record it), `@solana/wallet-adapter-base`, `@solana/wallet-adapter-react@0.15.40`, `@solana/wallet-adapter-react-ui`, `@solana/wallet-adapter-wallets`, `@solana/wallet-standard-util`, `@solana/spl-token@0.4.x`, `@solana/actions@1.6.6`, `@metaplex-foundation/umi@1.6.x`, `@metaplex-foundation/umi-bundle-defaults@1.6.x`, `@metaplex-foundation/mpl-core@1.10.0`, `@anchor-lang/core@1.2.1`, `@noble/post-quantum` (latest 0.x exact), `@noble/hashes`. `@solana/pay@1.0.26` only in `packages/gateway-solana/package.json`. Root `package.json` `resolutions`: `"@solana/web3.js": "1.99.0"` (same value as the pin) so v3 can never be hoisted after 2026-10-19.

## 7. Step-by-step implementation guide (numbered, each step = one commit)
1. **Fork and branch.** Fork `open-mercato/open-mercato`, `git checkout v0.8.0`, create the fork's working branch `main` from the tag (record the tag SHA in `docs/SETUP.md`). Create the worktree and the package branch. Commit: `chore: start from open-mercato v0.8.0`.
2. **Toolchain pins.** `.nvmrc` = `24`; `corepack enable && yarn --version` must print 4.17.x; add `rust-toolchain.toml` with `channel = "1.89.0"`, `components = ["clippy", "rustfmt"]`. Write `docs/SETUP.md`: install Node 24 (nvm), corepack, Rust 1.89, Agave CLI 4.3.0 (`sh -c "$(curl -sSfL https://release.anza.xyz/v4.3.0/install)"`), Anchor 1.2.1 via `avm install 1.2.1 && avm use 1.2.1`, Docker, plus the `Dockerfile.anchor` alternative. Run `yarn install` and the full validation set once to prove the baseline is green; record timings. Commit.
3. **Dependencies and resolutions.** Add the pins from §6 to `apps/mercato/package.json` and `resolutions` to the root `package.json`. `yarn install`. Confirm `yarn why @solana/web3.js` shows only 1.99.x. Commit.
4. **Module skeletons.** For each of the five app modules create the files listed in §4, copying from `apps/mercato/src/modules/example/` and stripping everything but metadata, ACL, setup, empty DI `register`, empty `createModuleEvents({ moduleId, events: [] as const })`, `i18n/en.json` with the module title. Add `{ id: '<module>', from: '@app' }` entries to `apps/mercato/src/modules.ts` in the order `solana_core, solana_events, solana_gates, solana_attestations, solana_actions`. Add the `om-ds` ESLint block per module in `eslint.ds.config.mjs`. Run `yarn generate && yarn typecheck && yarn lint`. Commit.
5. **Gateway package skeleton.** Create `packages/gateway-solana` mirroring `packages/gateway-stripe` (same `package.json` shape, same `tsconfig`, `src/modules/gateway_solana/`). `integration.ts` declares an `IntegrationDefinition` with credential fields `treasuryWallet` (text) and `acceptedMints` (text, comma-separated) — fields only, no adapter yet. Register in `modules.ts` as `{ id: 'gateway_solana', from: '@open-mercato/gateway-solana' }`. Add the workspace to the root `package.json` `workspaces` if not globbed. `yarn install && yarn generate && yarn build:packages && yarn typecheck`. Commit.
6. **Env keys.** Add the keys from §6 to `apps/mercato/.env.example` with one comment line each (where to obtain: Helius dashboard, `solana-keygen`, Circle devnet USDC). Commit.
7. **Contracts.** Write `docs/CONTRACTS.md` (§6). Add a line at the top: "Frozen on day 2 after Q&A; changes only by the TL with a note in `02-plan/ANSWERS-RESOLVED.md`." Commit.
8. **Anchor workspace.** `anchor init programs/aegis_registry --no-git` is *not* used (it creates a nested layout); instead create `programs/aegis_registry/` by hand as an Anchor workspace whose `Anchor.toml` has `[programs.devnet] aegis_registry = "<placeholder>"`, `[provider] cluster = "devnet"`, `wallet = "~/.config/solana/id.json"`, `[toolchain] anchor_version = "1.2.1"`, and a minimal `lib.rs` with `declare_id!` and an empty `#[program] pub mod aegis_registry {}`. Run `anchor keys sync` then `anchor build` locally **and** inside `Dockerfile.anchor`. Commit the public program id in `Anchor.toml` and `lib.rs`; the keypair in `target/deploy/` stays untracked (`.gitignore` `target/`).
9. **Scripts.** `scripts/fund-wallet.ts` (tsx/bun-runnable: airdrop loop with backoff until balance ≥ N SOL on devnet, prints balance), `scripts/mint-test-token.ts` (creates a 6-decimal SPL mint `AGUSD` with the hot wallet as mint authority, mints to a list of addresses, prints the mint address). Commit.
10. **CI.** `.github/workflows/ci.yml`: Node 24, corepack, `yarn install --immutable`, `yarn generate`, `yarn build:packages`, `yarn typecheck`, `yarn lint`, `yarn test`, gitleaks action, `npm audit --audit-level=high || true` (report-only in week 1). `.github/workflows/anchor.yml`: build inside `Dockerfile.anchor`, `cargo clippy -- -D warnings`, `cargo audit`, `continue-on-error: true` until WP-02 lands. Commit.
11. **Secret scan hook.** `.gitleaks.toml` (default rules + allowlist for `.env.example`), pre-commit hook running `gitleaks protect --staged` with a regex fallback (`grep -E '([0-9A-Za-z]{87,88}|\[([0-9]{1,3},){63}[0-9]{1,3}\])'` for base58/JSON keypairs) when gitleaks is missing. Commit.
12. **Hosting files.** `deploy/docker-compose.vps.yml` (app from `Dockerfile`, `pgvector/pgvector:pg17`, redis, caddy), `deploy/Caddyfile` (reverse proxy to `app:3000`, automatic TLS for `${PUBLIC_HOST}`), `deploy/README.md` (provision, `.env`, `docker compose up -d`, migrations, how to check the Helius webhook reaches `/api/webhooks/inbound/<id>`). Commit.
13. **Validation and report.** Full validation set + `anchor build`; write `REPORT.md` (§12). Push the branch.

## 8. Exact commands
```bash
corepack enable && yarn --version          # 4.17.x
nvm use                                     # Node 24
yarn install
yarn infra:up                               # Postgres, Redis, Meilisearch
cp apps/mercato/.env.example apps/mercato/.env   # fill DATABASE_URL, JWT_SECRET, REDIS_URL locally
yarn generate && yarn build:packages && yarn typecheck && yarn lint && yarn test
yarn db:migrate                             # baseline schema (no new migrations in this package)
yarn mercato auth sync-role-acls
yarn mercato configs cache structural --all-tenants
yarn dev:greenfield                         # http://localhost:3000/backend
cd programs/aegis_registry && anchor keys sync && anchor build && cd -
docker build -f programs/aegis_registry/Dockerfile.anchor -t aegis-anchor programs/aegis_registry
yarn why @solana/web3.js                    # must list 1.99.x only
gitleaks detect --source . --no-git
```

## 9. Tests to add
See `TESTS.md`. This package adds smoke tests only: one Jest test per skeleton module asserting `metadata.name`, ACL feature ids and that `events.ts` exports an array; a `scripts/__tests__/env-example.test.ts` asserting every key from §6 is present in `.env.example`; CI itself is the test for the toolchain.

## 10. Definition of done (checklist)
- [ ] Fork at `v0.8.0`, SHA recorded in `docs/SETUP.md`; `.nvmrc`, `rust-toolchain.toml`, `Anchor.toml` toolchain pins present.
- [ ] Six units registered in `modules.ts`; `yarn generate && yarn build:packages && yarn typecheck && yarn lint && yarn test` green locally and in CI.
- [ ] `yarn why @solana/web3.js` shows exactly one 1.99.x version; `resolutions` present.
- [ ] `anchor build` succeeds locally and in Docker; public program id committed; keypair untracked.
- [ ] `.env.example` has all 16 keys; `docs/research/solana-stack-2026.md` and `docs/research/open-mercato-seams.md` exist (copies of `research/02-solana-stack-2026.md` and `research/01-open-mercato.md` from this run folder, so later briefs' "Read first" references resolve inside the repo); `docs/CONTRACTS.md` matches Q-API-01…05, Q-TS-04/05 verbatim.
- [ ] gitleaks hook blocks a fake base58 key in a staged file (tested once, documented in REPORT.md).
- [ ] `deploy/` files exist and `docker compose -f deploy/docker-compose.vps.yml config` validates.
- [ ] `scripts/fund-wallet.ts` and `scripts/mint-test-token.ts` run on devnet (output pasted into REPORT.md, addresses only).
- [ ] No AI mentions in commits, code comments or docs.
- [ ] `REPORT.md` and `STATUS.md` written; worktree removed after push.

## 11. Stop conditions
- `yarn install`/`yarn generate` on the pristine `v0.8.0` fails for more than 2 hours → stop, report, propose Q-DESIGN-01 option B (`create-mercato-app`).
- `anchor build` with 1.2.1 fails for toolchain reasons after 2 hours → stop and report; WP-02 decides the fallback (0.32 line) — do not switch here silently.
- Token use above 2.0 M or three failed full-validation runs → stop and report.
- Any need to change a frozen contract → stop; the TL edits `docs/CONTRACTS.md`.

## 12. Report (what REPORT.md must contain)
Tag SHA and fork URL; exact versions installed (Node, Yarn, Rust, Agave, Anchor, web3.js); the program id; validation-set timings; the public URL once `deploy/` is applied (or "not yet"); the list of shared files that later packages may need; any deviation from this brief with reason; ≤300 words plus the version table.
