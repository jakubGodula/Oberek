import { describe, expect, test } from 'bun:test';
import { createTelegramApi, TelegramError } from './telegram-api';

const TOKEN = '123456:SECRET-token';

function answering(body: unknown, status = 200) {
	const requests: { url: string; init?: RequestInit }[] = [];
	const fetchFn = (async (url: string, init?: RequestInit) => {
		requests.push({ url, init });
		return new Response(JSON.stringify(body), { status });
	}) as unknown as typeof fetch;
	return { fetchFn, requests };
}

const sentBody = (init?: RequestInit) => JSON.parse(init?.body as string);

describe('createTelegramApi', () => {
	test('posts JSON to the method URL of the bot', async () => {
		const { fetchFn, requests } = answering({ ok: true, result: true });
		await createTelegramApi(TOKEN, fetchFn).sendMessage(42, 'hi');
		expect(requests[0].url).toBe(`https://api.telegram.org/bot${TOKEN}/sendMessage`);
		expect(requests[0].init?.method).toBe('POST');
		expect(sentBody(requests[0].init)).toEqual({ chat_id: 42, text: 'hi' });
	});

	test('sends a keyboard as inline_keyboard', async () => {
		const { fetchFn, requests } = answering({ ok: true, result: true });
		const keyboard = [[{ text: '🛑 Kill', callback_data: 'kill:tick-01' }]];
		await createTelegramApi(TOKEN, fetchFn).sendMessage(42, 'hi', keyboard);
		expect(sentBody(requests[0].init).reply_markup).toEqual({ inline_keyboard: keyboard });
	});

	test('getUpdates asks from the offset, with a long-poll timeout, and returns the updates', async () => {
		const updates = [{ update_id: 7, message: { message_id: 1, chat: { id: 42 }, text: '/agents' } }];
		const { fetchFn, requests } = answering({ ok: true, result: updates });
		expect(await createTelegramApi(TOKEN, fetchFn).getUpdates(7, 10)).toEqual(updates);
		expect(sentBody(requests[0].init)).toEqual({
			offset: 7,
			timeout: 10,
			allowed_updates: ['message', 'callback_query']
		});
	});

	test('editMessageText sends no keyboard, which removes the buttons', async () => {
		const { fetchFn, requests } = answering({ ok: true, result: true });
		await createTelegramApi(TOKEN, fetchFn).editMessageText(42, 9, 'done');
		expect(sentBody(requests[0].init)).toEqual({ chat_id: 42, message_id: 9, text: 'done' });
	});

	test('answerCallbackQuery sends the text only when given', async () => {
		const { fetchFn, requests } = answering({ ok: true, result: true });
		const api = createTelegramApi(TOKEN, fetchFn);
		await api.answerCallbackQuery('q1');
		await api.answerCallbackQuery('q2', 'Unknown button');
		expect(sentBody(requests[0].init)).toEqual({ callback_query_id: 'q1' });
		expect(sentBody(requests[1].init)).toEqual({ callback_query_id: 'q2', text: 'Unknown button' });
	});

	test('a refusal from Telegram throws with its description', async () => {
		const { fetchFn } = answering({ ok: false, description: 'Bad Request: chat not found' }, 400);
		const error = await createTelegramApi(TOKEN, fetchFn).sendMessage(1, 'x').catch((caught: unknown) => caught);
		expect(error).toBeInstanceOf(TelegramError);
		expect((error as Error).message).toBe('sendMessage: Bad Request: chat not found');
	});

	test('a network failure throws without the token, which is part of the URL', async () => {
		const fetchFn = (async (url: string) => {
			throw new Error(`Unable to connect. Is the computer able to access the url? ${url}`);
		}) as unknown as typeof fetch;
		const error = (await createTelegramApi(TOKEN, fetchFn).getUpdates(0, 10).catch((caught: unknown) => caught)) as Error;
		expect(error).toBeInstanceOf(TelegramError);
		expect(error.message).not.toContain(TOKEN);
		expect(error.message).toContain('getUpdates: Unable to connect');
	});
});
