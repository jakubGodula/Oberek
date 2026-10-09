# TESTS.md — WP-12

| # | file | proves | command |
|---|------|--------|---------|
| T-12-01 | `apps/mercato/src/modules/solana_attestations/__tests__/x402.middleware.test.ts` | Request without payment header → 402 with x402 v2 `PAYMENT-REQUIRED` JSON (scheme `exact`, devnet CAIP-2 id, USDC-dev asset, amount `10000`); with a header → fake facilitator `/verify` + `/settle` called, handler response returned with `PAYMENT-RESPONSE` header; facilitator rejection → 402 again. | `yarn test apps/mercato/src/modules/solana_attestations` |
| T-12-02 | `scripts/__tests__/agent-buyer.plan.test.ts` | `--dry-run` prints the target URL, asset, amount and facilitator without network. | `yarn test scripts` |
| T-12-03 | manual: `scripts/x402-spike/` on devnet | Go/no-go: a real settlement via the facilitator; recorded in `docs/x402-SPIKE.md`. | run first, ≤ 2 h |
| T-12-04 | manual: MCP session | External client lists the three tools, calls `solana.get_gate_status` and `solana.get_payment_status`, and `solana.create_payment_request` triggers the approval behaviour; transcript saved in `docs/mcp/DEMO-TRANSCRIPT.md`. | `yarn mcp:dev` + Claude Code/Desktop |
