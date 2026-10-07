# Open Mercato × Solana — hackathon run folder (om-solana / open-mercato-solana-hackathon)

Produced 2026-10-07 with the Two-Phase Work workflow (prompts in `../prompts/`): **Step 1 intake** (problem statement,
research, Q&A files for the team) and a **draft Step 2 plan** (work packages for 6 people over 2 weeks, built on the
Q&A defaults). Sharing mode: folder (this folder). Nothing here is code; it is the brief for the code.

## Read in this order
1. `00-task/TASK.md` — the task as restated from the team lead's brief and the three Aegis Mercato documents.
2. `research/03-source-docs-review.md` — what the source documents got right, where they contradict each other (Open Mercato vs SvelteKit), and what is missing (gating, payments, agents, the customer).
3. `research/01-open-mercato.md` — Open Mercato 0.8.0 facts: module anatomy, the payment-gateway / webhook / AI-assistant seams the Solana work plugs into.
4. `research/02-solana-stack-2026.md` — Solana facts checked on 2026-10-07 (library versions and the 2026-10-19 web3.js v3 flip, Anchor 1.2.1, Metaplex Core, Helius, Solana Pay, Blinks reality, x402, hackathon landscape).
5. `01-intake/PROBLEM.md` — requirements, acceptance criteria AC-1…11, risks, testing level.
6. `01-intake/QA-INDEX.md` → `01-intake/qa/*.md` — **the questions for the team** (108, 15 blocking). Start with `solana-q_and_a.md`. How to answer: `01-intake/HOWTO-ANSWER.md`.
7. `02-plan/PLAN.md` → `02-plan/packages/WP-nn-*/BRIEF.md` — the draft plan and the executable work-package briefs.

## What the team does now
| who | action | where |
|-----|--------|-------|
| everyone | answer your Q&A file (defaults are pre-filled; only blocking ones *must* be answered) | `01-intake/qa/<area>-q_and_a.md` → return to `01-intake/inbox/` |
| TL | answer `ai-and-budget`, `product`, `design`; fill names in `02-plan/ASSIGNMENTS.md` | |
| TL | after answers: regenerate/adjust `02-plan/`, sign `02-plan/SIGNOFF.md`, write `READY` | |
| TL | start WP-01 on day 1 regardless (it is the only package that does not wait for sign-off) | `02-plan/packages/WP-01-foundation/BRIEF.md` |
| each executor | run your package with your own model/harness from its `BRIEF.md`; keep `STATUS.md` current; one branch, no force-push, no merge to main | `02-plan/packages/` |

## Folder map
```
00-task/TASK.md
01-intake/{PROBLEM,DECISIONS-DRAFT,TOKENOMICS-ESTIMATE,QA-INDEX,HOWTO-ANSWER}.md  qa/  share/  inbox/
02-plan/{PLAN,ASSIGNMENTS,MODEL-MATRIX,TOKENOMICS,MERGE-PLAN,TEST-PLAN,MANUAL-TESTS,ANSWERS-RESOLVED,SIGNOFF}.md
02-plan/packages/WP-01…WP-12/{BRIEF,TESTS,STATUS}.md   02-plan/templates/
research/01-open-mercato.md  02-solana-stack-2026.md  03-source-docs-review.md
STATE.json  HANDOFF.md  NOTIFY.md  ASSUMPTIONS.md  BUILD_STATE.md
```

## Naming used everywhere
task `om-solana`, title `open-mercato-solana-hackathon`, stamp of this run `20261007-115212`;
package branch `feature/om-solana-<wp>-<model>-<harness>-<stamp>`; integration branch `feature/om-solana-integration-<stamp>`;
worktree `<repo>-for-ai/<model>-<stamp>`; run folder in git mode would be `ai-output/tpw/om-solana-open-mercato-solana-hackathon/` on branch `ai/tpw-om-solana-open-mercato-solana-hackathon` (never merged to main).
