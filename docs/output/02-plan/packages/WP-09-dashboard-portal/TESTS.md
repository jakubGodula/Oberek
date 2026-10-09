# TESTS.md — WP-09

| # | file | proves | command |
|---|------|--------|---------|
| T-09-01 | `packages/gateway-solana/src/modules/gateway_solana/frontend/__tests__/useRealtime.test.tsx` | SSE message triggers `onEvent`; 15 s silence switches to 5 s polling; polling stops when SSE resumes (fake EventSource + fake timers). | `yarn test packages/gateway-solana` |
| T-09-02 | `apps/mercato/src/modules/solana_core/backend/__tests__/settings-page.test.tsx` | Settings page renders every field from a mocked `GET /api/solana_core/status`; copy buttons call clipboard. | `yarn test apps/mercato` |
| T-09-03 | `apps/mercato/src/modules/solana_gates/backend/__tests__/gates-page.test.tsx` | Add-rule dialog posts the exact rule schema; Evaluate renders `granted`/`denied` badges and `checkedAt`. | `yarn test apps/mercato` |
| T-09-04 | `apps/mercato/src/modules/solana_events/backend/__tests__/activity-page.test.tsx` | Feed renders items, explorer links use `?cluster=devnet`, a `gateway_solana.payment.confirmed` event prepends a row. | `yarn test apps/mercato` |
| T-09-05 | `apps/mercato/src/modules/solana_attestations/backend/__tests__/approvals-page.test.tsx` | Approve/Reject call `POST .../decide` with the right body; "Share as Blink" copies raw + inspector URLs. | `yarn test apps/mercato` |
| T-09-06 | `apps/mercato/src/modules/solana_core/frontend/portal/__tests__/link-wallet.test.tsx` | challenge → signIn → verify sequence; signMessage fallback when `signIn` unavailable; error toast on 401. | `yarn test apps/mercato` |
| T-09-07 | `apps/mercato/src/modules/solana_gates/frontend/portal/__tests__/audits-page.test.tsx` | Gated section hidden when no rule granted, visible with attestations when granted. | `yarn test apps/mercato` |
| T-09-08 | `packages/gateway-solana/src/modules/gateway_solana/frontend/__tests__/checkout.test.tsx` | Payment request created on mount; QR payload equals the transaction-request URL; status polling reaches `confirmed` and shows the signature. | `yarn test packages/gateway-solana` |
| T-09-09 | `apps/mercato/__integration__/solana-dashboard.spec.ts` | Playwright: login → Settings → Gates → Activity → Approvals → approve one item; widgets visible on the dashboard. | `yarn playwright test apps/mercato/__integration__/solana-dashboard.spec.ts` |
