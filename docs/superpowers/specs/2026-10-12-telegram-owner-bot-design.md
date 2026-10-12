# Design: Telegram owner bot instead of Blinks

Date: 2026-10-12. Branch: `telegram_bot` (off `tick_speed`, PR #20). Status: approved in brainstorming, awaiting spec
review.

## Goal

The owner answers an agent from Telegram: accept or reject its proposal, kill it, resume it. This replaces the Solana
Actions (Blinks) path, which nothing renders while dial.to is paused. A bot on long polling works from localhost, with no
public URL.

## Scope

In:

- `POST /api/agents/<id>/control` with `{ "action": "kill" | "resume" }`: the owner's kill switch as a plain endpoint.
- The page's Kill and Resume buttons call it.
- A bot process `bun bot/telegram`: pushes proposals and status changes to the owner's chat, with buttons, and answers
  `/agents` with every fleet agent and the buttons that fit its state.
- Removal of the Blink path: `/api/actions/agent-action`, the Memo transaction, `solana-blink/memo.ts`, the Solana
  Actions card, the footer credit and the `@solana/actions` dependency.

Out (later, if wanted): typed commands (`/kill <id>`), `demo.ts` starting the bot, renaming `BlinkService` and
the `solana-blink` module (a pure move, its own PR).

## Server

`BlinkService` loses `getActionMetadata` and `createDecisionTransaction` and gains:

```ts
controlAgent(agentId: string, action: 'kill' | 'resume'): Promise<{ counter: number }>
```

- Fleet agent: reads the guard account and calls `guard.kill` / `guard.resume` with `account.owner`; the server signs
  with `OWNER_KEYPAIR`, as the Blink POST does today.
- Mock agent (Arbiter, Guardian): flips its in-memory card, as `applyMockDecision` does today.
- Unknown agent or wrong state: the guard's `GuardError`, answered by `fleetErrorResponse` (404, 409 …).

Route `src/routes/api/agents/[id]/control/+server.ts` parses the body (`parseControlAction`, `400` on anything else) and
answers `{ counter }`.

## Page

- `simulateAction` goes away; Kill and Resume call `postAndReport('/api/agents/<id>/control', { action })` like the
  verdict buttons.
- The Solana Actions card becomes a static **Telegram** card: what the bot does and how to start it
  (`bun bot/telegram`). The server cannot tell whether the bot runs, so the card claims nothing about it, and the server
  never reads the bot's variables.

## Bot

A separate process in `bot/telegram/`, talking to the server only over HTTP like the agents. No library: `fetch` against
the Bot API.

| File | Job |
| --- | --- |
| `index.ts` | Reads env, runs two loops: Telegram updates (long poll) and agent polling. |
| `telegram-api.ts` | `getUpdates`, `sendMessage`, `editMessageText`, `answerCallbackQuery`. |
| `notices.ts` | Pure: previous and current agent lists → messages with buttons; one agent → its `/agents` message. |
| `buttons.ts` | Pure: button ↔ callback data (`accept:sentinel-01`), button → server request. |
| `oberek-api.ts` | The server over HTTP: `GET /api/agents`, `POST` of a button's request. |
| `bot.ts` | Handles one Telegram update and one agent poll, given the two APIs; tested with fakes. |

### Notices

Every 3 s the bot reads `GET /api/agents` and keeps fleet agents only (`fleet` present). Against the previous read:

| Change | Message | Buttons |
| --- | --- | --- |
| becomes `AWAITING_APPROVAL` | the proposal message below | Accept · Reject · Kill |
| becomes `PAUSED` | "<name> is killed" | Resume |
| `PAUSED` → `ACTIVE` | "<name> is running again" | Kill |

The proposal message says what the owner accepts, with the same facts as the page's approval panel:

```
⚠️ Oberek Sentinel Alpha waits for your verdict · step #41
PROPOSE (drift, needs approval): sell 1.234 SOL @ $152.10 (SOL 62.0% → 50.0%) [simulated shock -3%]

Accept: the verdict goes on-chain and the agent executes the trade in its next cycle.
Reject: the verdict goes on-chain and the treasury stays unchanged.
```

The second line is the proposal's `summary`, written by the agent; the bot does not interpret the decision, so any
agent that proposes gets a readable message.

The first read after start only sets the baseline, except proposals already waiting, which are sent, so a restarted bot
does not lose one. A failed read is logged and skipped; the next read compares with the last good one.

### `/agents`

The owner sends `/agents`; the bot reads `GET /api/agents` and answers with one message per fleet agent, so each has
its own buttons:

| State | Message | Buttons |
| --- | --- | --- |
| `ACTIVE` | "▶ <name> · running · step N" and its latest summary | Kill |
| `PAUSED` | "⏸ <name> · killed · step N" | Resume |
| `AWAITING_APPROVAL` | the proposal message above | Accept · Reject · Kill |
| `UNAVAILABLE` | "<name> · unavailable: <reason>" | none |

No fleet agents, or the server not answering, gets one message saying so.

### Buttons

- Callback data `<action>:<agentId>`, action ∈ `accept`, `reject`, `kill`, `resume`. Telegram allows 64 bytes; an
  agent whose data would be longer gets the message without buttons and a note to use the page. Data that does not
  parse is answered "unknown button".
- `accept` / `reject` → `POST /api/agents/<id>/approval`; `kill` / `resume` → `POST /api/agents/<id>/control`.
- After the call the bot edits the message: the original text plus the result ("✅ Approved, step 42" or "Refused (409):
  no proposal waiting"), with no buttons left, so a second press cannot fire.

### Who may press

- `TELEGRAM_BOT_TOKEN` and `TELEGRAM_OWNER_CHAT_ID` in `.env`; `TELEGRAM_API_URL`, the Oberek server (default `http://localhost:5173`, like `TICK_API_URL`).
- Updates from any other chat are ignored, except `/start`, which replies with the sender's chat id so setup is one
  copy-paste.
- Without `TELEGRAM_OWNER_CHAT_ID` the bot only answers `/start`.

## Limits

- The server signs kill and resume with its own keypair before any wallet signature (the known hole, left open). The
  owner-chat check is the only gate on the bot path; the page itself has none.
- The bot sees a status only if it lasts past one poll (3 s); a proposal accepted on the page within that window gets no
  message.

## Testing (TDD)

- `parseControlAction`; the control route against the memory guard (kill, resume, wrong state → 409, unknown agent).
- `notices.ts`: each row of both tables, the proposal message text, the baseline rule, mock agents ignored.
- `buttons.ts`: round trip of callback data, bad data, request per action.
- `telegram-api.ts`: requests and error handling with a fetch stub.
- End to end on devnet with a real bot: a Sentinel proposal arrives in the chat, Accept records the verdict on chain,
  Kill and Resume flip the card on the page.

## Docs

- README: how to create the bot and run `bun bot/telegram`; `.env.example` entries.
- `spec/decisions/008-wlasciciel-przez-telegram.md`: the owner acts through Telegram, not Blinks.
- `spec/ARCHITECTURE.md`: Blinks and dial.to replaced by the Telegram bot.
