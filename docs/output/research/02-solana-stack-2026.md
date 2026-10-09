# research/02-solana-stack-2026.md — Solana developer stack as of 2026-10-07

Checked on 2026-10-07 against npm, GitHub and official docs by a research agent; items that could not be confirmed are
marked UNVERIFIED. Audience: a 6-person, 2-week team extending Open Mercato (TypeScript/Next.js) with on-chain events,
NFT/token-gated access, payments, Blinks and AI agents.

## 0. Headline decisions
- **Client lib:** `@solana/web3.js` pinned **exactly** to `1.99.x` + `@solana/wallet-adapter-react@0.15.40` + Metaplex Umi.
  Wallet-adapter, Umi, `@solana/actions` and `@anchor-lang/core` all still peer-depend on web3.js v1. **v3.0.1 (a Kit-based
  rebuild of the class API) is on the `next` tag and is scheduled to become `latest` on 2026-10-19 — mid-hackathon.**
  https://github.com/solana-foundation/solana-web3.js/releases/tag/v3.0.0
- **NFT:** Metaplex Core (`@metaplex-foundation/mpl-core@1.10.0`), `PermanentFreezeDelegate` for a soulbound membership
  asset; verify ownership server-side via Helius DAS (Core assets have no token account). https://metaplex.com/docs/core
- **Indexing:** Helius free tier (5 devnet webhooks, DAS, 1M credits/month, no card). https://www.helius.dev/pricing
- **Payments:** Solana Pay transfer requests with `reference` + `findReference`/`validateTransfer`
  (`@solana/pay@1.0.26`, Kit-based) and/or x402 v2 (`@x402/svm@2.28.0`, Coinbase or PayAI facilitator on devnet).
- **Blinks:** spec frozen (`@solana/actions@1.6.6`, Nov 2024); render through Phantom/Backpack extensions only, never natively on X.
- **Hackathon landscape:** Colosseum **Crypto World's Fair, 2026-09-14 → 2026-10-12** (Solana track 10 × $10k).
  https://colosseum.com/worldsfair — does not match "2 weeks from 2026-10-07"; the team's hackathon is something else (Q-PROD-01).

## 1. Solana Actions & Blinks
- Spec: `@solana/actions-spec@2.4.2` ("spec v2.0"); Dialect guides send `X-Action-Version: 2.4`.
  https://github.com/solana-developers/solana-actions/blob/main/packages/actions-spec/index.d.ts
- `@solana/actions` 1.6.6 (2024-11-05), dormant but not deprecated; depends on web3.js v1. Use `ACTIONS_CORS_HEADERS` /
  `createActionHeaders` / `createPostResponse`. https://www.npmjs.com/package/@solana/actions
- Dialect: client SDK `@dialectlabs/blinks@0.22.5` (repo pushed Aug 2026), hosted Blink API, registry, docs MCP
  (`https://docs.dialect.to/mcp`). Inspector: https://www.blinks.xyz/inspector (responds). `dial.to/?action=solana-action:<url>`
  is still in the SDK, but a dial.to inspector UI is UNVERIFIED. https://docs.dialect.to/blinks/blinks-client
- X/Twitter: **X never unfurled Blinks natively**; rendering is injected by Phantom ("Experimental Settings → Enable Solana
  Actions on X.com", off by default, registry-trusted URLs only) or Backpack. The Dialect Chrome extension was reportedly
  removed from the Web Store 2026-04-09 (UNVERIFIED). **Demo plan: Phantom extension + our own hosted Blink page, not a tweet.**
  https://phantom.com/learn/crypto-101/solana-actions-blinks
- `actions.json` at the domain root with `rules:[{pathPattern, apiPath}]`; OPTIONS/GET/POST with
  `Access-Control-Allow-Origin: *`, methods `GET,POST,PUT,OPTIONS`, allow headers
  `Content-Type, Authorization, Content-Encoding, Accept-Encoding, X-Accept-Action-Version, X-Accept-Blockchain-Ids`,
  expose `X-Action-Version, X-Blockchain-Ids` (CAIP-2 devnet = `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1`).
  https://solana.com/docs/advanced/actions
- Chaining/signing: POST `type` is `"transaction" | "post" | "external-link" | "message"` (there is no `"sign-message"`;
  it is `"message"` with mandatory `links.next`); the next POST carries `signature` + `account`.
  https://docs.dialect.to/blinks/blinks-provider/advanced/action-chaining
- Registry: statuses trusted/none/blocked; registration by email to hello@dialect.to; `https://registry.dial.to/v1/list`
  newest entry 2025-05-08 (looks frozen). Unregistered blinks render only if the user opts in.

## 2. Solana Pay
- Spec moved to `solana-foundation/pay` (monorepo; `typescript/packages/solana-pay/spec/SPEC1.1.md`; headline product now
  "pay.sh" for agentic payments). Docs: https://solana.com/docs/tools/solana-pay/specification/version1-1.
  Transfer request = `solana:<recipient>?amount&spl-token&reference&label&message&memo`; transaction request =
  `solana:<https-link>` (GET/POST, server builds the tx). Message-signing spec is alpha.
- `@solana/pay` 1.0.26 (2026-07-31), **built on `@solana/kit ^6.9`** (no web3.js v1). Last v1-line is 0.2.6. Keep it
  isolated (URL building + verification only). https://www.npmjs.com/package/@solana/pay
- Verification: `findReference(rpc, reference, {commitment:'confirmed'})` then
  `validateTransfer(rpc, sig, {recipient, amount, splToken, reference, memo})`: checks `meta.err`, last instruction must be a
  System transfer or Token `Transfer/TransferChecked` to the recipient **ATA**, references in order, memo second-to-last,
  `post − pre ≥ amount`. Gotchas: recipient ATA must exist; always validate against your expected amount; reject
  over-precise decimals. https://github.com/solana-foundation/pay/blob/main/typescript/packages/solana-pay/core/src/validateTransfer.ts
- USDC devnet mint `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` (classic Token program, 6 decimals); mainnet
  `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`. https://developers.circle.com/stablecoins/usdc-contract-addresses
- Token-2022: `validateTransfer` only parses `Transfer/TransferChecked`; fee-bearing mints break the delta check. Stick to classic USDC.

## 3. Web3 client libs
- `@solana/web3.js` 1.99.0 = "critical fixes only"; `@solana/kit` 8.4.0 (active, anza-xyz/kit). Official guidance: migrate
  to Kit or the web3.js v3 bridge. https://solana.com/docs/frontend/web3-compat
- gill 0.14.0 pins Kit ^5 — stale, skip.
- Wallets: `@solana/wallet-adapter-react` 0.15.40 (Sept 2026, still the reference for v1 stacks); Kit-native `@solana/react@8.4.0`,
  `@wallet-ui/react@4.3.0` (peer Kit ^6/^7, not yet Kit 8). Wallet Standard `@wallet-standard/core@1.1.2`. Devnet: Phantom
  Settings → Developer Settings → Testnet Mode; Backpack Developer Mode; Solflare Settings → Network.

## 4. Programs & tooling
- **Anchor moved to OtterSec stewardship:** repo `otter-sec/anchor`, latest **v1.2.1 (2026-10-06)**; TS package
  `@coral-xyz/anchor` frozen at 0.32.1 → **`@anchor-lang/core@1.2.1`** (web3.js v1). 1.x: `anchor test` defaults to
  **Surfpool** (`--validator legacy` for solana-test-validator), IDL via the Program Metadata Program, test template
  defaults to LiteSVM; MSRV Rust 1.89. https://github.com/otter-sec/anchor/releases/tag/v1.2.1
- **Agave CLI** v4.3.0 (2026-09-18). https://github.com/anza-xyz/agave/releases/tag/v4.3.0
- Tests: Surfpool 1.6.0 (mainnet-forking local validator), `litesvm` npm 1.5.0 / crate 0.17.0, `mollusk-svm` 0.16.0;
  `solana-bankrun` deprecated. Pinocchio 0.11.2 (skip for a hackathon).
- Codama 1.11.0 + `@codama/renderers-js@2.5.0` generate **Kit** clients from Anchor IDLs (only useful if Kit).
- Devnet SOL: faucet.solana.com = 2 requests / 8 h, GitHub login raises the cap (amount UNVERIFIED); QuickNode faucet
  1 claim / 12 h. Fund one team wallet early; use Surfpool locally.

## 5. Indexing & webhooks
- Helius webhooks: Enhanced (parsed, filter by `transactionTypes`), Raw, Discord; devnet via `webhookType: enhancedDevnet|rawDevnet`.
  Free tier: 5 webhooks, 1M credits/month, 10 RPS RPC, 2 RPS DAS. Auth: you set `authHeader`, Helius echoes it as
  `Authorization` (shared secret, no HMAC — constant-time compare). Retries 3 × 1 s, duplicates possible — dedupe on signature.
  **Enhanced types do not parse MPL Core transfers → raw webhook on the collection address.** https://www.helius.dev/docs/webhooks
- DAS: `getAssetsByOwner` (limit ≤ 1000, `showFungible`, `showZeroBalance`), `searchAssets` (`tokenType`, `interface: MplCoreAsset`,
  `grouping: ["collection", addr]`); indexes NFTs, cNFTs, Core, Token-2022. Devnet endpoint `https://devnet.helius-rpc.com/?api-key=…`.
- Alternatives: Shyft free (no webhooks), QuickNode trial, Triton no free tier, Yellowstone gRPC needs Helius $49 plan. Verdict: Helius free.

## 6. NFTs
- Metaplex **Core**: single account per asset, ~0.003 SOL mint, plugins (Attributes KV indexed by DAS, Royalties,
  Freeze/Transfer/Burn delegates, Oracle/AppData). Token Metadata is legacy, ~7× costlier; Bubblegum v1 "not recommended
  for new projects". https://metaplex.com/docs/core/plugins
- Soulbound: `PermanentFreezeDelegate { frozen: true, authority: { type: 'None' } }` at creation.
- Packages (Umi 1.6.0 line, peer web3.js ^1.99): `@metaplex-foundation/umi`, `umi-bundle-defaults`, `umi-uploader-irys`,
  `mpl-core@1.10.0`, `mpl-token-metadata@3.4.0`, `mpl-bubblegum@6.0.0`. `umi-kit-adapters` peers Kit 2.x — unusable with Kit 8.
- Quick devnet path: `createUmi(devnet).use(mplCore()).use(keypairIdentity(kp)).use(irysUploader({address:'https://devnet.irys.xyz'}))`
  → `createCollection` → `create({asset, collection, plugins})`. CLI: `npm i -g @metaplex-foundation/cli` → `mplx core collection create`.
- Server-side ownership: `getTokenAccountsByOwner` returns **nothing** for Core. Use DAS `getAsset(id)` → `ownership.owner`,
  `ownership.frozen`, `grouping[collection]`, or `searchAssets({ownerAddress, grouping:['collection',C], interface:'MplCoreAsset'})`;
  or on-chain `fetchAssetsByOwner` from mpl-core (no indexer lag). Collection membership is intrinsically verified.

## 7. AI agents, x402, hackathons
- Solana Agent Kit `solana-agent-kit@2.0.10` (2025-09-24), repo last push 2026-05-14 — alive but slow. v2 = core + plugins
  (`@solana-agent-kit/plugin-token|nft|defi|misc|blinks`), adapters for LangChain / Vercel AI / OpenAI, MCP. https://docs.sendai.fun/docs/v2/introduction
- MCP servers: `https://mcp.solana.com/mcp` (docs), `helius-mcp@2.2.0` (60+ tools, Aug 2026), QuickNode hosted MCP, Dialect docs MCP.
- x402: canonical repo `x402-foundation/x402` (v2 spec, `svm` mechanism); npm `@x402/core|svm|fetch@2.28.0` (2026-09-29).
  Solana guide: https://solana.com/docs/payments/agentic-payments/intro-to-x402. Facilitators with Solana devnet: Coinbase CDP
  (1,000 free tx/month), PayAI `https://facilitator.payai.network`, Corbits/Faremeter self-hosted. x402 Foundation (Linux
  Foundation, July 2026) includes Solana Foundation, Coinbase, Cloudflare, Circle, Visa, Mastercard, Stripe, Google.
  Foundation's **pay.sh** CLI/proxy speaks x402 + MPP challenges. https://github.com/solana-foundation/pay
- Agentic-commerce standards: Google AP2 (donated to FIDO, Apr 2026; crypto via x402 extension), Mastercard Agent Pay for
  Machines (June 2026, Solana Foundation launch partner), Stripe/Tempo MPP (Mar 2026), Visa TAP. OpenAI ACP / Skyfire on Solana: UNVERIFIED.
- Hackathons autumn 2026: Colosseum Crypto World's Fair (2026-09-14 → 10-12; judging = founder-market fit, insight,
  execution, market size, communication, viability, traction; code must be from the window, prior code disclosed);
  Colosseum Eternal (rolling 4-week sprints); hackathons.solana.com lists "Agentic Payments" ($50k, no dates); Solana
  Mobile CLOCK IN ends Oct 8; Korea Agentic Commerce hackathon (x402/pay.sh, dates unpublished); Breakpoint London Nov 15–17.

## 8. Security & ops for a server-side integration
- Keys: the official "Signing in Production" page recommends the Foundation's **Keychain** `SolanaSigner` abstraction
  (in-memory for dev, Vault/KMS/Turnkey/Privy by config); treasury = Squads multisig. https://solana.com/docs/core/transactions/signing-in-production
- Blockhash expiry ≈ 150 slots (60–90 s); fetch at `confirmed`, own retry loop against `lastValidBlockHeight`; simulate
  first and set CU limit ≈ `unitsConsumed × 1.1`; Helius `getPriorityFeeEstimate`. https://www.helius.dev/docs/sending-transactions/optimizing-transactions
- Durable nonces only for offline/delayed signing; docs warn they may be deprecated.
- Transaction v1 (mainnet since 2026-09-15): 4096-byte txs (base64 only); `getTransaction` needs `maxSupportedTransactionVersion: 1`.
- RPC `confirmTransaction` removed (Agave 2.0) → `getSignatureStatuses`. Public RPC: 100 req/10 s/IP, "not for production".
- Blinks replay: the client replaces `recentBlockhash` and rejects extra signers; attribute via Action Identity memo +
  `reference` and check first on-chain occurrence. Idempotency keys are your job.
- Webhook payloads: compare `Authorization` with your `authHeader`; no signature scheme exists. SIWS (`solana:signIn`)
  works in Phantom/Solflare/Backpack via wallet-adapter. https://phantom.com/learn/developers/sign-in-with-solana

## 9. Ecosystem context 2026
- Alpenglow (SIMD-0326, Votor): live on testnet (2026-09-24) and devnet; mainnet target slipped, next window ~2026-11-09 (UNVERIFIED).
- Agave 4.3 stable; Firedancer full client on mainnet since Dec 2025.
- 100M CU blocks live (2026-07-29); SIMD-0553 inclusion fee (2,500 lamports) + burned resource fee accepted for Agave 4.3.
- Token-2022 confidential balances re-enabled June 2026.
- **Solana Attestation Service** on mainnet, `@solana/attestation` SDK — a fit for KYC/role attestations gating ERP functions. https://attest.solana.com/
- ZK Compression on mainnet; Helius acquired Light Protocol (June 2026).
- Privacy: Arcium mainnet alpha (Feb 2026). Post-quantum: Winternitz vault opt-in only; Anza "Quantumglow" research.
- Dev-ex: solana.com docs rebuilt with CI-tested samples + MCP; `create-solana-dapp` is the official scaffold.
