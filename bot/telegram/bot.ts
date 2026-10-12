import { parseCallbackData, requestFor, resultLine } from './buttons';
import { agentsAnswer, changeNotices, type Notice } from './notices';
import type { AgentView, OberekApi } from './oberek-api';
import type { CallbackQuery, TelegramApi, Update } from './telegram-api';

// The bot's behaviour, without its loops: one Telegram update at a time and one read of the fleet at a time. Only the
// owner's chat may act; anyone may ask /start for their chat id, which is how the owner learns theirs.

export interface BotDeps {
	telegram: TelegramApi;
	oberek: OberekApi;
	/** null until TELEGRAM_OWNER_CHAT_ID is set: the bot then only answers /start. */
	ownerChatId: number | null;
	log?: (line: string) => void;
}

export interface Bot {
	handleUpdate(update: Update): Promise<void>;
	/** Reads the fleet and sends the owner what changed since the last good read. */
	checkAgents(): Promise<void>;
}

const UNKNOWN_BUTTON = 'Unknown button';

export function reasonOf(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/** "/agents@oberek_owner_bot extra" → "/agents" */
const commandOf = (text: string) => text.trim().split(/[\s@]/)[0];

export function createBot({ telegram, oberek, ownerChatId, log = console.error }: BotDeps): Bot {
	let previous: AgentView[] | null = null;
	const isOwner = (chatId: number) => chatId === ownerChatId;

	async function send(chatId: number, notices: Notice[]): Promise<void> {
		for (const { text, keyboard } of notices) await telegram.sendMessage(chatId, text, keyboard);
	}

	function startReply(chatId: number): string {
		return isOwner(chatId)
			? 'You are the owner. /agents lists the fleet; proposals and kills arrive here.'
			: `Your chat id is ${chatId}. Put TELEGRAM_OWNER_CHAT_ID=${chatId} in .env and restart the bot.`;
	}

	async function agentsReply(): Promise<Notice[]> {
		try {
			return agentsAnswer(await oberek.listAgents());
		} catch (error) {
			return [{ text: `Oberek server unreachable: ${reasonOf(error)}` }];
		}
	}

	async function handleCommand(chatId: number, text: string): Promise<void> {
		const command = commandOf(text);
		if (command === '/start') return telegram.sendMessage(chatId, startReply(chatId));
		if (isOwner(chatId) && command === '/agents') return send(chatId, await agentsReply());
	}

	async function handlePress({ id, data, message }: CallbackQuery): Promise<void> {
		if (!message || !isOwner(message.chat.id)) return;
		const press = parseCallbackData(data ?? '');
		if (!press) return telegram.answerCallbackQuery(id, UNKNOWN_BUTTON);
		await telegram.answerCallbackQuery(id);
		const answer = await oberek.post(requestFor(press));
		const text = `${message.text ?? ''}\n\n${resultLine(press.action, answer)}`;
		await telegram.editMessageText(message.chat.id, message.message_id, text);
	}

	return {
		async handleUpdate({ message, callback_query }) {
			if (message?.text !== undefined) await handleCommand(message.chat.id, message.text);
			if (callback_query) await handlePress(callback_query);
		},
		async checkAgents() {
			if (ownerChatId === null) return;
			let current: AgentView[];
			try {
				current = await oberek.listAgents();
			} catch (error) {
				log(`agent poll failed: ${reasonOf(error)}`);
				return;
			}
			const notices = changeNotices(previous, current);
			previous = current;
			await send(ownerChatId, notices);
		}
	};
}
