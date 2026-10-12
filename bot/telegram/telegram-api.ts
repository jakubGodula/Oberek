// The bot's link to Telegram: the four Bot API methods it uses, over fetch. The token is part of every URL, so no
// error leaves this file with it.

export interface InlineButton {
	text: string;
	callback_data: string;
}

export type Keyboard = InlineButton[][];

export interface Chat {
	id: number;
}

export interface Message {
	message_id: number;
	chat: Chat;
	text?: string;
}

export interface CallbackQuery {
	id: string;
	data?: string;
	message?: Message;
}

export interface Update {
	update_id: number;
	message?: Message;
	callback_query?: CallbackQuery;
}

export interface TelegramApi {
	/** Waits up to `timeoutSec` for updates from `offset` on. */
	getUpdates(offset: number, timeoutSec: number): Promise<Update[]>;
	sendMessage(chatId: number, text: string, keyboard?: Keyboard): Promise<void>;
	/** Replaces the text; the message keeps no buttons. */
	editMessageText(chatId: number, messageId: number, text: string): Promise<void>;
	/** Stops the button's spinner, optionally with a short popup text. */
	answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void>;
}

/** Telegram refused the call or could not be reached. */
export class TelegramError extends Error {}

const TOKEN_MASK = '<token>';

interface BotApiAnswer<T> {
	ok?: boolean;
	result?: T;
	description?: string;
}

export function createTelegramApi(token: string, fetchFn: typeof fetch = fetch): TelegramApi {
	const baseUrl = `https://api.telegram.org/bot${token}`;
	const redact = (text: string) => text.replaceAll(token, TOKEN_MASK);

	async function call<T>(method: string, params: Record<string, unknown>): Promise<T> {
		let response: Response;
		try {
			response = await fetchFn(`${baseUrl}/${method}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(params)
			});
		} catch (error) {
			throw new TelegramError(redact(`${method}: ${error instanceof Error ? error.message : String(error)}`));
		}
		const answer = (await response.json().catch(() => null)) as BotApiAnswer<T> | null;
		if (!answer?.ok) throw new TelegramError(redact(`${method}: ${answer?.description ?? `HTTP ${response.status}`}`));
		return answer.result as T;
	}

	return {
		getUpdates: (offset, timeoutSec) =>
			call<Update[]>('getUpdates', { offset, timeout: timeoutSec, allowed_updates: ['message', 'callback_query'] }),
		async sendMessage(chatId, text, keyboard) {
			await call('sendMessage', { chat_id: chatId, text, ...(keyboard && { reply_markup: { inline_keyboard: keyboard } }) });
		},
		async editMessageText(chatId, messageId, text) {
			await call('editMessageText', { chat_id: chatId, message_id: messageId, text });
		},
		async answerCallbackQuery(callbackQueryId, text) {
			await call('answerCallbackQuery', { callback_query_id: callbackQueryId, ...(text === undefined ? {} : { text }) });
		}
	};
}
