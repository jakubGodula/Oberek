// The owner's bot on Telegram: pushes the agents' proposals and status changes to the owner's chat, with buttons that
// answer through the server's API, and lists the fleet on /agents. Runs as its own process, like the agents.
import { runLoop, stopOnSignals } from '../../agents/shared/loop';
import { createBot, reasonOf } from './bot';
import { createOberekApi } from './oberek-api';
import { createTelegramApi } from './telegram-api';

const DEFAULT_API_URL = 'http://localhost:5173';
/** As often as the page refreshes its agent list. */
const AGENT_POLL_MS = 3_000;
/** Telegram holds getUpdates open this long when nothing comes; Ctrl+C waits at most this long. */
const LONG_POLL_SEC = 10;
const RETRY_MS = 5_000;
const NO_PAUSE = 0;

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
	console.error('TELEGRAM_BOT_TOKEN is not set: create a bot with @BotFather and put its token in .env');
	process.exit(1);
}
const ownerChatId = chatIdFromEnv();
const apiUrl = process.env.TELEGRAM_API_URL ?? DEFAULT_API_URL;

const telegram = createTelegramApi(token);
const bot = createBot({ telegram, oberek: createOberekApi(apiUrl), ownerChatId });
let offset = 0;

/** A group's id is negative, so any whole number goes. */
function chatIdFromEnv(): number | null {
	const raw = process.env.TELEGRAM_OWNER_CHAT_ID;
	if (!raw) return null;
	const chatId = Number(raw);
	if (!Number.isInteger(chatId)) {
		console.error(`TELEGRAM_OWNER_CHAT_ID must be a whole number, got "${raw}"`);
		process.exit(1);
	}
	return chatId;
}

async function readUpdates(): Promise<void> {
	try {
		for (const update of await telegram.getUpdates(offset, LONG_POLL_SEC)) {
			offset = update.update_id + 1;
			await bot.handleUpdate(update).catch((error) => console.error(`update ${update.update_id} failed: ${reasonOf(error)}`));
		}
	} catch (error) {
		console.error(`reading Telegram failed: ${reasonOf(error)}`);
		await Bun.sleep(RETRY_MS);
	}
}

/** A failed poll (Telegram or the server down) is logged and retried on the next tick, not fatal. */
function pollAgents(): Promise<void> {
	return bot.checkAgents().catch((error) => console.error(`agent poll failed: ${reasonOf(error)}`));
}

console.log(
	ownerChatId === null
		? 'Telegram bot: TELEGRAM_OWNER_CHAT_ID is not set; send /start to the bot to learn your chat id. Ctrl+C stops'
		: `Telegram bot → ${apiUrl}, owner chat ${ownerChatId}; Ctrl+C stops`
);
const stop = stopOnSignals();
await Promise.all([runLoop(readUpdates, NO_PAUSE, stop), runLoop(pollAgents, AGENT_POLL_MS, stop)]);
console.log('Telegram bot stopped');
