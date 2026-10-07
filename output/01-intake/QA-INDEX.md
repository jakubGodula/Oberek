# QA-INDEX.md — round 1 (generated 2026-10-07)

| file | suggested owner | questions | blocking | kind | status |
|---|---|---|---|---|---|
| `qa/solana-q_and_a.md` | Solana lead | 10 | 4 | extra | open |
| `qa/solana-payments-q_and_a.md` | payments owner | 10 | 1 | extra | open |
| `qa/rust-q_and_a.md` | Rust owner | 9 | 1 | core | open |
| `qa/security-q_and_a.md` | security owner | 10 | 1 | core | open |
| `qa/design-q_and_a.md` | TL | 10 | 2 | core | open |
| `qa/api-contract-q_and_a.md` | TL + backend owner | 5 | 0 | extra | open |
| `qa/typescript-q_and_a.md` | backend owner | 8 | 0 | core | open |
| `qa/fe-q_and_a.md` | frontend owner | 7 | 0 | core | open |
| `qa/ai-agents-q_and_a.md` | agents owner | 7 | 1 | extra | open |
| `qa/product-q_and_a.md` | TL / pitch owner | 8 | 3 | extra | open |
| `qa/ai-and-budget-q_and_a.md` | TL | 10 | 2 | core | open |
| `qa/devops-q_and_a.md` | devops owner | 8 | 0 | extra | open |
| `qa/testing-q_and_a.md` | QA owner | 6 | 0 | extra | open |

Total: 108 questions, 15 blocking. Blocking questions must be answered before Step 2 is final; everything else defaults.

## Reading order for the team
1. `solana-q_and_a.md` — decides libraries, credential standard, on-chain design and the Blink demo surface (4 blocking).
2. `design-q_and_a.md` + `api-contract-q_and_a.md` — platform, module split, frozen contracts.
3. `solana-payments-q_and_a.md`, `rust-q_and_a.md`, `security-q_and_a.md`, `ai-agents-q_and_a.md` — one owner each.
4. `product-q_and_a.md`, `ai-and-budget-q_and_a.md` — TL only.
5. `fe-`, `typescript-`, `devops-`, `testing-` — mostly defaults; skim and object where needed.

Core files per the TPW spec: security, design, fe, one per backend language (typescript, rust), ai-and-budget. Extras: solana, solana-payments, api-contract, ai-agents, product, devops, testing.
