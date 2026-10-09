# WP-12 — Stretch: x402-paid attestation verify route + external agent demo via MCP

| field | value |
|---|---|
| Package id | WP-12 |
| Branch | `feature/om-solana-wp-12-<model>-<harness>-<stamp>` |
| Worktree | `<repo>-for-ai/<model>-<stamp>` (from the integration branch, see MERGE-PLAN.md) |
| Minimum model tier | mid |
| Placement | either |
| Estimated tokens | 0.4 M (spike ≤ 0.1 M) |
| Estimated effort | 2 person-days (days 11–13); the first 2 hours are a go/no-go spike |
| Depends on | WP-07 (verify route, `ai-tools.ts` tools `solana.get_gate_status` from WP-04, `solana.get_payment_status` + `solana.create_payment_request` from WP-05), WP-08 (actions for the Blink part of the transcript, optional) |
| Dual review | no (part of the day-11 security session if landed) |

## 1. Objective (2–4 sentences)
Show machine-to-machine commerce on top of the product (solana-q_and_a.md Q-SOL-10, solana-payments-q_and_a.md
Q-PAY-10 default A): one paid API route — attestation verification — protected by an x402 v2 challenge on Solana
devnet, a buyer script that pays 0.01 USDC-dev with `@x402/fetch`, and an external agent session (Claude Code or
Claude Desktop) using the Open Mercato MCP server to check a gate, create a payment request and read its status.
Facilitator availability on devnet is UNVERIFIED (research/02-solana-stack-2026.md §7): a 2-hour spike decides.

## 2. Acceptance criteria covered (AC-n from 01-intake/PROBLEM.md, restated concretely)
- Extends AC-8: `GET /api/solana_attestations/attestations/[id]/verify` returns HTTP 402 with a valid x402 v2
  `PAYMENT-REQUIRED` payload (scheme `exact`, network Solana devnet CAIP-2 `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1`,
  asset USDC-dev `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`, amount `10000` base units) when unpaid, and the
  normal `{ valid, ... }` body after the facilitator settles the payment.
- Extends FR-9: the three tools are callable from an external MCP client with an API key; a saved transcript shows
  gate check → payment request → status.

## 3. Read first (exact files in the repo; nothing else)
1. `packages/ai-assistant/AGENTS.md` and `apps/docs/docs/framework/ai-assistant/*.mdx` — MCP server (`yarn mcp:dev` → `http://localhost:3001/mcp`), `.mcp.json`, API-key auth, `allowedTools`.
2. `apps/mercato/src/modules/solana_attestations/api/attestations/[id]/verify/route.ts` (WP-07) — the route to wrap.
3. `apps/mercato/src/modules/solana_gates/ai-tools.ts` (WP-04), `packages/gateway-solana/src/modules/gateway_solana/ai-tools.ts` (WP-05) — tool names and schemas.
4. `packages/core/src/modules/api_keys/` — creating an `omk_...` key with limited features.
5. https://solana.com/docs/payments/agentic-payments/intro-to-x402 and the `@x402/svm@2.28.0`, `@x402/core`, `@x402/fetch` READMEs (npm) — middleware and client usage; facilitator URLs: PayAI `https://facilitator.payai.network`, Coinbase CDP (needs an account).
6. `docs/CONTRACTS.md` (WP-01).

## 4. Files owned (create/modify only these)
- `apps/mercato/src/modules/solana_attestations/lib/x402.ts` (middleware factory wrapping a route handler; reads `X402_FACILITATOR_URL`, `X402_PAY_TO` from env — both must already exist in `.env.example`; if not, request them and use `TREASURY_WALLET` for `payTo`)
- `apps/mercato/src/modules/solana_attestations/api/attestations/[id]/verify-paid/route.ts` (a **new** route; the WP-07 verify route stays free so the dashboard keeps working) + OpenAPI doc
- `scripts/agent-buyer.ts` (uses `@x402/fetch` with a devnet keypair holding USDC-dev; prints the 402 payload, the payment, the final body)
- `docs/x402-SPIKE.md` (go/no-go record), `docs/mcp/DEMO-TRANSCRIPT.md`, `docs/mcp/mcp.json.example`
- Tests: `apps/mercato/src/modules/solana_attestations/__tests__/x402.middleware.test.ts`, `scripts/__tests__/agent-buyer.plan.test.ts`

## 5. Files NOT to touch (and what to write in REPORT.md instead)
- WP-07's existing verify route and services; WP-04/WP-05 `ai-tools.ts` (consume only). A tool missing `requiredFeatures`
  or an API-key-incompatible handler → "Contract gap" in REPORT.md.
- `.mcp.json` at repo root (if it exists, WP-01 owns it) — provide `docs/mcp/mcp.json.example` instead.
- `apps/mercato/src/modules.ts`, root `package.json` (new dependencies `@x402/svm`, `@x402/core`, `@x402/fetch` →
  "Requested shared-file change" with exact pinned versions; until added, the spike runs in `scripts/` with a local `package.json` under `scripts/x402-spike/`), `.env.example`, CI.

## 6. Interfaces and contracts (exact TS signatures / routes / events this package provides and consumes)
```ts
// lib/x402.ts
export function withX402(handler: RouteHandler, opts: { price: { asset: string; amount: string; decimals: 6 }; payTo: string; facilitatorUrl: string; network: 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1' }): RouteHandler
// 1st call without `PAYMENT-SIGNATURE` header → 402 + PAYMENT-REQUIRED (x402 v2 JSON); with header → facilitator /verify then /settle → handler → response + PAYMENT-RESPONSE header
```
Route: `GET /api/solana_attestations/attestations/[id]/verify-paid` (`requireAuth: false`, rate-limited per IP).
MCP: tools exposed to the demo key = `solana.get_gate_status`, `solana.get_payment_status`, `solana.create_payment_request`
(the last is `isMutation: true`; in the transcript the human approves it through the assistant's `prepareMutation` flow if
the MCP server enforces it — record what happened). Transport: `yarn mcp:dev` streamable HTTP at `http://localhost:3001/mcp`; `.mcp.json` example with `Authorization: Bearer omk_...`.

## 7. Step-by-step implementation guide (numbered, each step = one commit)
1. **Spike (≤ 2 h, timer on):** in `scripts/x402-spike/`, a 20-line Node server using `@x402/svm` + `@x402/core` middleware
   with the PayAI facilitator on devnet and a 20-line `@x402/fetch` client; fund the buyer with USDC-dev. Record the
   result in `docs/x402-SPIKE.md`: facilitator used, settle latency, errors. **If no facilitator settles on devnet in 2 hours → stop, report, mark WP-12 "x402 part dropped", continue with the MCP part only.**
2. `lib/x402.ts` middleware per §6; unit test with a fake facilitator (`fetch` mocked).
3. `verify-paid` route wrapping WP-07's verify service call (import the service, not the route).
4. `scripts/agent-buyer.ts` + `--dry-run`.
5. MCP: create a demo API key with only the needed features (`solana_gates.view`, `gateway_solana.view/manage`),
   `docs/mcp/mcp.json.example`, run `yarn mcp:dev`, drive the three tools from Claude Code (`claude mcp add ...`) or Claude Desktop; save the transcript (redact the key).
6. Tests, lint, i18n not needed (no UI).

## 8. Exact commands (setup, generate, test, lint)
```bash
corepack enable && yarn install && yarn generate
yarn tsx scripts/x402-spike/server.ts & yarn tsx scripts/x402-spike/client.ts     # spike
yarn tsx scripts/agent-buyer.ts --attestation <id>
yarn mcp:dev                                                                      # MCP server on :3001
yarn typecheck && yarn lint && yarn test apps/mercato/src/modules/solana_attestations scripts
```

## 9. Tests to add (file names + what each proves)
See `TESTS.md` (T-12-01 … T-12-04).

## 10. Definition of done (checklist)
- [ ] `docs/x402-SPIKE.md` records go/no-go with evidence (facilitator URL, signatures or error bodies).
- [ ] If go: `agent-buyer.ts` completes a paid verify on devnet; signature printed; 402 payload validated by the unit test.
- [ ] MCP transcript saved with the three tool calls and the mutation-approval behaviour recorded.
- [ ] Requested dependency pins and env vars listed in REPORT.md.
- [ ] `yarn typecheck && yarn lint && yarn test` green; REPORT.md, STATUS.md; worktree removed.
- [ ] No AI mentions in commits.

## 11. Stop conditions (when to stop and report instead of continuing)
- Spike fails within 2 hours (no settlement on devnet) → drop x402, keep MCP.
- MCP server cannot authenticate an API key for these tools within 2 hours → report "Contract gap" and stop.
- 2× token estimate or 3 failed Gate 0 runs; WP-07 not integrated by day 10 → do not start.

## 12. Report (what REPORT.md must contain)
Spike verdict and evidence; facilitator and versions used; route and middleware summary; MCP transcript path; requested
shared-file changes (deps, env); honesty wording for the pitch ("x402 settled on devnet via <facilitator>" or "x402 not demoed"); tokens used; test results.
