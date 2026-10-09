# research/01-open-mercato.md — Open Mercato as found on 2026-10-07

Source: shallow clone of `github.com/open-mercato/open-mercato`, HEAD `fefc71d09efe2aa8c732dc6fafaa084a0e0dae3c`
(2026-09-23, "docs(github): add Itrix contributor (#6390)"); skills repo `open-mercato/skills` HEAD
`3fc5a1fbd84d90c6f052f3c97cb1e54d2660eb22` (2026-10-05). Read-only inspection; nothing was installed, built or run, so
command behaviour is taken from the docs. Everything below cites a path in that clone.

## 1. What Open Mercato is
MIT-licensed TypeScript business platform (CRM, catalog, sales, WMS, integrations, AI agents) as a **Turborepo + Yarn 4
workspaces monorepo** (`turbo.json`; root `package.json`: `packageManager: yarn@4.17.1`, `engines.node: 24.x`, `.nvmrc` = 24).
Stack: **Next.js 16.3.3**, React 19.2.8, **MikroORM 7.1.x** (`@mikro-orm/postgresql`, decorators from
`@mikro-orm/decorators/legacy`), **Awilix 13** DI, Postgres (`pgvector/pgvector:pg17` in `docker-compose.yml`),
**Tailwind 4.3** (`apps/mercato/package.json`), Zod 4, Vercel `ai` SDK 7, Jest 30, Playwright.

Layout: `apps/mercato` (the Next app; app-local modules go in `apps/mercato/src/modules/`), `apps/docs` (Docusaurus),
`packages/*` = `@open-mercato/<name>`: `core` (all business modules), `shared`, `ui`, `cli`, `cache`, `queue`, `events`,
`search`, `ai-assistant`, `webhooks`, `scheduler`, `documents`, `checkout`, `enterprise`, provider packages
(`gateway-stripe`, `channel-*`, `sync-akeneo`, `tillio`, `storage-s3`, `web-research-*`), `create-app` / `starter`.

Run (README "Quick start"): `npx @open-mercato/starter`, or `corepack enable` → `yarn infra:up` (Postgres/Redis/Meilisearch
via `starters/docker/*`) → `cp apps/mercato/.env.example apps/mercato/.env` (`DATABASE_URL`, `JWT_SECRET`, `REDIS_URL`) →
`yarn dev:greenfield`; app at `http://localhost:3000/backend`. Standalone: `npx create-mercato-app my-app && yarn setup`.
Full-stack compose: `docker-compose.fullapp*.yml`, `Dockerfile` (`node:24-alpine`).
Validation set (`AGENTS.md`): `yarn generate`, `build:packages`, `typecheck`, `lint`, `test`, `build:app`.

Versions: all workspace packages **0.8.0** (`CHANGELOG.md` "0.8.0 (2026-09-18)"; latest tag `v0.8.0`). Cadence: 0.7.0
2026-08-26, 0.6.7 2026-08-05, 0.5.0 2026-04-21. Roadmap: `apps/docs/docs/architecture/future-roadmap.mdx` (visual module
scaffolder, GraphQL gateway, plug-in marketplace, multi-region tenancy); `UPGRADE_NOTES.md`; local skill
`om-auto-upgrade-0.7.0-to-0.8.0`.

## 2. Module anatomy (authoritative docs: root `AGENTS.md`, `.ai/docs/module-development.md`, `packages/core/AGENTS.md`, `packages/cli/AGENTS.md`, `apps/docs/docs/framework/modules/reference-example-module.mdx`; reference module `apps/mercato/src/modules/example/`; CRUD reference `packages/core/src/modules/customers/`)
- **Folder** `src/modules/<snake_case_plural>/`: `index.ts` (`metadata: ModuleInfo`), `acl.ts` (`features`), `setup.ts`
  (`ModuleSetupConfig`: `defaultRoleFeatures`, `onTenantCreated`, `seedDefaults`, `seedExamples`), `di.ts` (`register(container)`),
  `events.ts`, `ce.ts` (custom fields), `cli.ts`, `runtime.ts`, `search.ts`, `translations.ts`, `notifications.ts`,
  `ai-tools.ts`, `ai-agents.ts`, `extension-points.ts`, `generators.ts`, `encryption.ts`,
  `data/{entities,validators,extensions,enrichers}.ts`, `api/`, `backend/`, `frontend/`, `subscribers/`, `workers/`,
  `widgets/{injection,dashboard}/`, `widgets/injection-table.ts`, `widgets/components.ts`, `migrations/`
  (+ `.snapshot-open-mercato.json`), `i18n/en.json`, `commands/`.
- **Registration:** `apps/mercato/src/modules.ts` `enabledModules: ModuleEntry[]` with `{ id, from: '@open-mercato/core' | '@app' | '<pkg>', overrides? }`;
  `yarn generate` (`packages/cli`) discovers files and emits registries in `apps/mercato/.mercato/generated/`
  (`modules.generated.ts`, `entities.generated.ts`, `di.generated.ts`, `dashboard-widgets.generated.ts`,
  `injection-widgets.generated.ts`, `ai-tools.generated.ts`, …). After enabling: `yarn mercato configs cache structural --all-tenants`.
- **API routes:** `api/<path>/route.ts` → `/api/<module>/<path>`; export `GET/POST/...`, `metadata`
  (`{ GET: { requireAuth: true, requireFeatures: ['x.view'] } }`, see `example/api/todos/summary/route.ts`; unauthenticated
  webhooks use `POST: { requireAuth: false }`) and a mandatory `openApi` export (`OpenApiRouteDoc`). CRUD: `makeCrudRoute`
  from `@open-mercato/shared/lib/crud/factory` with `indexer: { entityType }`, `list.decorateCustomFields`, optimistic
  locking on by default (`updated_at`); OpenAPI via `createCrudOpenApiFactory` in `api/openapi.ts`
  (`apps/docs/docs/framework/api/crud-factory.mdx`). Spec aggregated by the `api_docs` module.
- **Events:** `events.ts` with `createModuleEvents({ moduleId, events })` `as const`; IDs `module.entity.action`;
  `clientBroadcast: true` → browser SSE, `portalBroadcast` → portal. Subscribers: `subscribers/<name>.ts` exporting
  `metadata = { event, persistent?, id, sync? }` + default handler `(payload, ctx)` (`example/subscribers/invalidate-todo-summary.ts`).
  Workers: `workers/*.ts` with `{ queue, id, concurrency }`.
- **DI:** `di.ts` `register(container: AppContainer)` with Awilix `asFunction(...).scoped()` / `asValue` (`example/di.ts`);
  services resolved via `createRequestContainer()`.
- **Entities/migrations:** `data/entities.ts` (`@Entity({ tableName })`, UUID PK `gen_random_uuid()`, `tenant_id`,
  `organization_id`, `created_at`, `updated_at`, `deleted_at`); `yarn db:generate` writes per-module `migrations/`,
  `yarn db:migrate` applies. No cross-module ORM relations.
- **Custom fields / extensions:** `ce.ts` exporting `CustomEntitySpec[]` (`example/ce.ts`), DSL `defineLink`/`cf.*` from
  `@open-mercato/shared/modules/dsl`, `data/extensions.ts`.
- **Backend pages:** `backend/<path>/page.tsx` → `/backend/<path>` with sibling `page.meta.ts` (`requireAuth`,
  `requireFeatures`, `pageTitle`, `pageGroup`, `pageOrder`, `icon`); `backend/page.tsx` → `/backend/<module>`.
- **Widgets:** injection widgets in `widgets/injection/<id>/widget.ts` (+ `widget.client.tsx`) mapped by spot IDs in
  `injection-table.ts` (`crud-form:<entityId>:fields`, `data-table:<tableId>:columns|row-actions|bulk-actions`,
  `menu:sidebar:main`, `admin.page:<path>:before`). Dashboard widgets: `widgets/dashboard/<id>/widget.ts` exporting
  `DashboardWidgetModule` with `lazyDashboardWidget(() => import('./widget.client'))` (dynamic import required) —
  `example/widgets/dashboard/notes/`.
- **ACL/tenancy/auth:** features `<module>.<action>` in `acl.ts`, granted via `setup.ts` `defaultRoleFeatures` +
  `yarn mercato auth sync-role-acls`; two-layer Role/User ACLs with wildcards; tenancy = `tenants` + `organizations`
  (`packages/core/src/modules/directory/data/entities.ts`), every query scoped by both. Auth: bcrypt + **JWT**
  (`signJwt` from `@open-mercato/shared/lib/auth/jwt`, `JWT_SECRET`) in an `auth_token` httpOnly cookie plus
  `session_token` refresh (`auth/api/login.ts`); API keys (`api_keys` module, `omk_...`) for machine access.
- **CLI:** `yarn mercato <module> <command>` from each module's `cli.ts` (`ModuleCli`), docs `apps/docs/docs/cli/overview.mdx`.
- **`.ai/` + AGENTS.md:** `CLAUDE.md` is `@AGENTS.md`; root `AGENTS.md` routes to `.ai/docs/*`, `.ai/specs/`, per-package
  `AGENTS.md`; local skills in `.ai/skills/<name>/SKILL.md` with `tiers.json`; external skills from `open-mercato/skills`
  installed into `.agents/skills/` via `yarn install-skills`.
- **Skills repo** (41 skills, all pipeline/SDLC): `om-auto-create-pr`, `om-auto-review-pr`, `om-merge-buddy`,
  `om-spec-writing`, `om-create-skill`, `om-brainstorm`, `om-discover`, `om-integration-tests`, `om-qa-buddy`,
  `om-root-cause`, … **No module-creation skill there.** Module-building skills live in the main repo:
  `packages/create-app/agentic/shared/ai/skills/om-module-scaffold/`, `om-data-model-design`, `om-backend-ui-design`,
  `om-system-extension`, `.ai/skills/om-create-ai-agent/`, `.ai/skills/om-integration-builder/`.

## 3. Existing modules (from each `index.ts`)
Core: `auth`, `directory` (tenants/orgs), `customers` (people, companies, deals, activities, calendar), `catalog`
(products/variants/pricing), `sales` (orders/documents), `payment_gateways` (adapter contract, transactions, webhook
routing), `shipping_carriers`, `currencies`, `wms`, `warranty_claims`, `resources` (assets with scheduling policies),
`planner`, `staff`, `notifications`, `push_notifications`, `messages`, `communication_channels`, `phone_calls`,
`integrations` (registry, credentials, logs, marketplace UI), `data_sync`, `sync_excel`, `api_keys`, `api_docs`,
`attachments`, `audit_logs`, `business_rules`, `workflows` (state machines), `dashboards`, `entities` (custom fields),
`feature_toggles`, `configs`, `dictionaries`, `translations`, `query_index`, `progress`, `perspectives`, `devices`,
`inbox_ops` (email-to-ERP LLM agent), `eudr`, `portal`, `customer_accounts`, `design_system`, `seeds`, `widgets`.
Packages: `ai_assistant`, `webhooks`, `checkout` (pay links), `documents`, `scheduler`, `search`, `events`, `content`,
`onboarding`, `gateway_stripe`, `channel_{discord,gmail,imap,resend,ses,apns,fcm,expo}`, `sync_akeneo`, `tillio`,
`storage_s3`. Enterprise: `agent_orchestrator`, `record_locks`, `sso`, `security`, `system_status_overlays`.
"Overlay" = enterprise overlays + per-app `entry.overrides` in `modules.ts` (`apps/docs/docs/framework/modules/overrides.mdx`).
"Marketplace" = integrations marketplace page (`integrations/backend/integrations/page.tsx`); a plugin marketplace is roadmap only.

## 4. Seams the Solana work plugs into (this is the key finding)
- **No Solana, wallet, web3 or Helius code exists** (grep hits only `design_system/gallery/demos/cryptocurrency.tsx`).
- **Payment gateway contract**: `GatewayAdapter` (`createSession/capture/refund/cancel/getStatus/verifyWebhook/mapStatus`) +
  `registerGatewayAdapter`, `registerWebhookHandler(providerKey, handler, { queue })`, `registerPaymentGatewayDescriptor`
  in `packages/shared/src/modules/payment_gateways/types.ts`; hub route `payment_gateways/api/webhook/[provider]/route.ts`
  (unauthenticated, rate-limited, scope derived from a `GatewayTransaction`, then queued). Model provider:
  `packages/gateway-stripe/src/modules/gateway_stripe/{integration.ts,di.ts,lib/webhook-handler.ts,workers/webhook-processor.ts}`;
  guide `apps/docs/docs/framework/modules/building-gateway-provider.mdx`. → **`gateway_solana` package = Solana Pay adapter.**
- **Inbound webhooks**: `@open-mercato/webhooks` — implement a `WebhookEndpointAdapter` (`providerKey`, `verifyWebhook`,
  `processInbound`, optional `allowUnscopedInbound`) and `registerWebhookEndpointAdapter()` in `di.ts`
  (`packages/webhooks/src/modules/webhooks/lib/adapter-registry.ts`); `api/inbound/[endpointId]/route.ts` does rate
  limiting, body limits, timestamp replay checks, dedup and event emission. → **Helius adapter.**
- **Credentials**: `integration.ts` (`IntegrationDefinition` with `credentials.fields` type `secret`) + `integrationCredentialsService`.
- **Checkout / pay links**: `packages/checkout` already models pay links → Solana Pay links hang off it.
- **Portal + customer accounts**: `portal`, `customer_accounts` modules → the token-gated client portal.
- **Audit**: `audit_logs` module; `workflows` (state machines) for approval states; `notifications` for approvals.

## 5. AI / MCP surface
`packages/ai-assistant` (docs `apps/docs/docs/framework/ai-assistant/*.mdx`): two surfaces — in-app typed agents
(`<module>/ai-agents.ts` via `defineAiAgent`, `<AiChat>`, mutation approvals through `prepareMutation`) and an **MCP
server** (`yarn mcp:dev` → `http://localhost:3001/mcp`, auth by API key in `.mcp.json`; `mcp:serve`/stdio modes). Tools are
declared per module in `ai-tools.ts` with `defineAiTool({ name, description, inputSchema: zod, requiredFeatures,
isMutation, handler(input, ctx) })` (`apps/mercato/src/modules/example/ai-tools.ts`, `customers/ai-tools/*-pack.ts`),
aggregated by `yarn generate` into `ai-tools.generated.ts`, ACL-filtered per key/user; agents only see tools on their
`allowedTools`. Code Mode meta-tools (`search`/`execute`) read the OpenAPI spec so any route with `openApi` is callable.
Enterprise `agent_orchestrator` adds propose-only agents. → **Agent bots = `ai-tools.ts` + `ai-agents.ts` in the Solana modules, plus MCP for external agents.**

## 6. Minimal `solana` module recipe (monorepo app module)
1. `mkdir apps/mercato/src/modules/<name>` (snake_case, plural where a noun).
2. `index.ts`: `export const metadata: ModuleInfo = { name, title, version: '0.1.0', … }` (copy `example/index.ts`).
3. `acl.ts`: `features = [{ id: '<name>.view', … }, { id: '<name>.manage', dependsOn: ['<name>.view'] }]`;
   `setup.ts`: `defaultRoleFeatures: { admin: ['<name>.*'], employee: ['<name>.view'] }`.
4. `data/entities.ts`: `@Entity({ tableName })` with `id`, `tenant_id`, `organization_id`, `created_at`, `updated_at`,
   `deleted_at` (template `example/data/entities.ts` `Todo`).
5. `api/openapi.ts` with `createCrudOpenApiFactory({ defaultTag })`; `api/<res>/route.ts` using `makeCrudRoute({ …, indexer: { entityType } })`
   and `export const openApi` (pattern `example/api/todos/route.ts`, `customers/api/people/route.ts`).
6. `events.ts`: `createModuleEvents({ moduleId, events: [{ id, label, entity, category }] as const })`;
   `subscribers/<x>.ts`: `metadata = { event, persistent: true, id }` + default handler.
7. `di.ts`: `register(container) { container.register({ xService: asFunction(createXService).scoped() }) }`.
8. `backend/page.tsx` (`"use client"`, `Page/PageHeader/PageBody` from `@open-mercato/ui/backend/Page`) +
   `backend/page.meta.ts` `{ requireAuth: true, requireFeatures: ['<name>.view'], pageTitle, pageGroup, icon }`.
9. `widgets/dashboard/<id>/widget.ts` (`DashboardWidgetModule`, `features: ['dashboards.view','<name>.view']`,
   `lazyDashboardWidget(() => import('./widget.client'))`) + `widget.client.tsx` + `config.ts`.
10. `i18n/en.json`; add `{ id: '<name>', from: '@app' }` to `apps/mercato/src/modules.ts`; add the `om-ds/*` error block
    for the module in `eslint.ds.config.mjs` (`.ai/docs/module-development.md`).
11. `yarn generate` → `yarn db:generate` (review migration + snapshot) → `yarn db:migrate` → `yarn mercato auth sync-role-acls`
    → `yarn mercato configs cache structural --all-tenants` → `yarn typecheck && yarn test`. Playwright specs in `__integration__/`.

## 7. Not verified / caveats
- Nothing was installed or executed; generated-file behaviour comes from docs.
- `apps/docs/docs/cli/overview.mdx` lists `mercato scaffold module <name>` / `scaffold crud`, but `packages/cli/src/mercato.ts`
  has no `scaffold` branch at this commit (only `init`, `module`, `eject`, `generate`, `db`, `queue`, `deploy`, …): the
  recipe above is manual.
- README tells contributors to `git checkout develop`; the clone's branch name was not recorded.
- `external/official-modules` submodule is absent (`official-modules.json` empty), so official modules were not inspected.
- **Node 24** is required; the TL's machine has Node 22.6 (observed) → upgrade in WP-01.
