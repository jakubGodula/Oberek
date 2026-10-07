---
file: api-contract-q_and_a.md
area: api-contract
task: om-solana
round: 1
owner:
status: open
---
> Contracts between work packages (routes, events, service interfaces). Packages run in parallel, so these must be
> frozen by the end of day 2. Empty answer = default accepted.

## Q-API-01 — Public HTTP routes (Open Mercato convention `/api/<module>/<path>`)
- Why it matters: Blinks and Solana Pay have spec-mandated shapes; the rest must fit Open Mercato's OpenAPI aggregation.
- Options:
  A) Freeze this list:
     - `GET /actions.json` (root rewrite → `solana_actions`), `GET|POST|OPTIONS /api/solana_actions/approve/[approvalId]`, `.../pause/[agentId]`, `.../pay/[paymentRequestId]`
     - `POST /api/solana_core/wallet-link/challenge`, `POST /api/solana_core/wallet-link/verify`, `GET /api/solana_core/status`
     - `GET|POST /api/solana_gates/rules`, `POST /api/solana_gates/evaluate` (`{ walletAddress | customerId }`)
     - `POST /api/webhooks/inbound/[endpointId]` (existing hub; Helius adapter key `helius`)
     - `GET /api/solana_events/activity?since=&type=`
     - `GET|POST /api/solana_attestations/attestations`, `GET /api/solana_attestations/attestations/[id]/verify`
     - `GET /api/solana_attestations/approvals`, `POST /api/solana_attestations/approvals/[id]/decide` (`{ decision: 'approve'|'reject' }`)
     - `POST /api/gateway_solana/payment-requests` (`{ orderId }` → `{ url, reference, amount, mint, expiresAt }`), `GET /api/gateway_solana/payment-requests/[id]/status`, `GET|POST /api/gateway_solana/transaction-request/[reference]` (Solana Pay transaction request)
  B) Let each package define its own routes and reconcile at integration.
- Default (used if unanswered): A
- AI recommendation: A, confidence medium; names may change, shapes should not.
- Impact if wrong: high
- Blocking: no
- Answer:
- Answered by / date:
- Notes:

## Q-API-02 — `solana_core` service interface used by every other package
- Why it matters: it is the one shared dependency; it must be mockable (see `testing-q_and_a.md` Q-TEST-02).
- Options: A)
  ```ts
  interface SolanaCoreService {
    cluster(): 'devnet'|'mainnet-beta'|'localnet'
    connection(): Connection                       // web3.js 1.x
    hotWallet(): { publicKey: PublicKey; sign(tx): Promise<Transaction> }
    sendAndConfirm(tx, opts?): Promise<{ signature: string; slot: number }>
    getTransaction(signature): Promise<ParsedTransactionWithMeta|null>
    getTokenBalance(owner, mint): Promise<bigint>
    getAssetsByOwner(owner, opts?): Promise<DasAsset[]>  // Helius DAS; NFTs incl. compressed
    verifySiws(message, signature, expectedNonce): Promise<{ address: string } | null>
    getLinkedWallets(userId, tenantId, organizationId): Promise<SolanaWalletLink[]>  // used by gates and actions
  }
  ```
  B) Expose raw `Connection` only.
- Default (used if unanswered): A
- AI recommendation: A, confidence high.
- Impact if wrong: high
- Blocking: no
- Answer:
- Answered by / date:
- Notes:

## Q-API-03 — Normalised on-chain event payload
- Why it matters: gateway, attestations and the activity feed all consume it.
- Options: A) `solana_events.tx.observed` payload: `{ signature, slot, blockTime, source: 'helius'|'poll', accounts: string[], programIds: string[], tokenTransfers: [{ mint, from, to, amount, decimals }], nativeTransfers: [{ from, to, lamports }], logs: string[], memo?: string, raw?: unknown }` with dedup on `signature`. B) Pass Helius' enhanced payload through unchanged.
- Default (used if unanswered): A
- AI recommendation: A, confidence high (keeps the polling fallback identical).
- Impact if wrong: medium
- Blocking: no
- Answer:
- Answered by / date:
- Notes:

## Q-API-04 — Agent tool names (AI assistant `defineAiTool`)
- Why it matters: the agent packages and the demo script depend on them.
- Options: A) `solana.propose_quote`, `solana.propose_attestation`, `solana.get_gate_status`, `solana.create_payment_request`, `solana.get_payment_status`, `solana.list_activity`; all mutations are `isMutation: true` and route through `ApprovalRequest`. B) Free naming.
- Default (used if unanswered): A
- AI recommendation: A, confidence medium.
- Impact if wrong: medium
- Blocking: no
- Answer:
- Answered by / date:
- Notes:

## Q-API-05 — Anchor program instruction set (frozen for the TS client)
- Why it matters: the TS client package and the Rust package work in parallel from the IDL.
- Options: A) `register_agent(agent_id: String<=32, operators: Vec<Pubkey><=5, pqc_pubkey_hash: [u8;32])`, `commit_attestation(attestation_id: [u8;32], content_hash: [u8;32], pqc_sig_hash: [u8;32])`, `set_agent_status(is_active: bool)`; events `AgentRegistered`, `AttestationCommitted`, `AgentStatusChanged`; PDAs `["agent", agent_id]` and `["attestation", agent_pda, attestation_id]`. B) The source-doc set (`commit_private_state` with a `zk_proof` blob).
- Default (used if unanswered): A
- AI recommendation: A, confidence medium; see `rust-q_and_a.md`.
- Impact if wrong: high
- Blocking: no
- Answer:
- Answered by / date:
- Notes:
