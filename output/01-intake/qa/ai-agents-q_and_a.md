---
file: ai-agents-q_and_a.md
area: ai-agents (product feature, not the team's AI tooling)
task: om-solana
round: 1
owner:
status: open
---
> The AI agent bots that the product sells. Open Mercato 0.8.0 ships `packages/ai-assistant` (Vercel `ai` SDK 7,
> `defineAiTool`, `defineAiAgent`, mutation approvals, MCP server at `yarn mcp:dev`). Empty answer = default accepted.

## Q-AGENT-01 — Where the agents run
- Why it matters: building on the in-app assistant saves a week; building a separate agent runtime (e.g. Solana Agent Kit) is more "Solana-native" for judges but duplicates tooling.
- Options: A) In-app: agents defined in `ai-agents.ts` of the Solana modules, tools in `ai-tools.ts`, chat via `<AiChat>`; external agents reach the same tools through the Open Mercato MCP server. B) Separate service using Solana Agent Kit (SendAI) with its plugins, talking to Open Mercato via API keys. C) Both (A for ops agents, B as a demo of an "external buyer agent").
- Default (used if unanswered): A
- AI recommendation: A, confidence high; C only as a stretch demo in week 2 if `WP-07` finishes early.
- Impact if wrong: high
- Blocking: yes
- Answer:
- Answered by / date:
- Notes:

## Q-AGENT-02 — LLM provider for the product agents
- Why it matters: the assistant package needs an API key at runtime; demo reliability and cost.
- Options: A) Anthropic Claude (Sonnet-class) via the assistant's provider config. B) OpenAI. C) Whatever the assistant package defaults to; configurable per tenant.
- Default (used if unanswered): C
- AI recommendation: C, confidence low — check `apps/docs/docs/framework/ai-assistant/*.mdx` for the supported providers; keep one key in `.env` for the demo.
- Impact if wrong: low
- Blocking: no
- Answer:
- Answered by / date:
- Notes:

## Q-AGENT-03 — The two agent skills (see `product-q_and_a.md` Q-PROD-05)
- Why it matters: defines `WP-07`'s acceptance criteria.
- Options: A) *Intake & Quote*: reads a free-text client request (chat or inbox), picks catalog items, drafts an order/quote, creates an `ApprovalRequest`; after approval, creates the order and a Solana Pay payment request. *Report Attestation*: given an attachment, hashes it, ML-DSA-signs, proposes `commit_attestation`; after approval, sends the on-chain tx and notifies the client. B) Only Intake & Quote. C) Only Report Attestation.
- Default (used if unanswered): A
- AI recommendation: A, confidence medium.
- Impact if wrong: medium
- Blocking: no
- Answer:
- Answered by / date:
- Notes:

## Q-AGENT-04 — Approval channel priority
- Why it matters: approvals via dashboard are certain; via Blink they are impressive but depend on dial.to and wallets.
- Options: A) Dashboard approval is the primary path; Blink approval is implemented and demoed as the "from X on your phone" moment, with the dashboard as live fallback. B) Blink only. C) Dashboard only.
- Default (used if unanswered): A
- AI recommendation: A, confidence high.
- Impact if wrong: medium
- Blocking: no
- Answer:
- Answered by / date:
- Notes:

## Q-AGENT-05 — Agent policy model
- Why it matters: Q-SEC-05 fixes the rules; this fixes where they live.
- Options: A) `AgentPolicy` JSON on the agent registration entity: `{ maxLamportsPerAction, maxUsdcPerDay, allowedTools[], allowedPrograms[], allowedRecipients[] }`, enforced in a single `PolicyGuard` service called by every mutation tool and by the executor worker. B) Hard-coded limits in each tool.
- Default (used if unanswered): A
- AI recommendation: A, confidence high.
- Impact if wrong: high
- Blocking: no
- Answer:
- Answered by / date:
- Notes:

## Q-AGENT-06 — MCP exposure for external agents
- Why it matters: "agents buy agency services" is a strong 2026 story; Open Mercato's MCP server already exposes `ai-tools` by API key.
- Options: A) Expose read tools + `create_payment_request` through MCP with a dedicated API key role; demo with Claude Desktop/Code calling it (optional, last two days). B) Not in scope.
- Default (used if unanswered): A
- AI recommendation: A, confidence medium; near-zero extra code if tools are defined per Q-AGENT-01 A.
- Impact if wrong: low
- Blocking: no
- Answer:
- Answered by / date:
- Notes:

## Q-AGENT-07 — Evidence and audit trail
- Why it matters: for a security-agency buyer, "what did the agent do and why" is the product.
- Options: A) Every tool call writes an `audit_logs` entry with input, output hash, policy decision, approval id, and the on-chain signature when any; the Activity page shows them next to on-chain events. B) Logs only.
- Default (used if unanswered): A
- AI recommendation: A, confidence high.
- Impact if wrong: medium
- Blocking: no
- Answer:
- Answered by / date:
- Notes:
