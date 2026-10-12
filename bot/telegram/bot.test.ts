import { describe, expect, test } from 'bun:test';
import { createBot } from './bot';
import type { AgentView, Answer, OberekApi, ServerRequest } from './oberek-api';
import type { Keyboard, TelegramApi, Update } from './telegram-api';

const OWNER = 42;
const STRANGER = 7;

const ACTIVE: AgentView = {
	id: 'sentinel-01',
	name: 'Oberek Sentinel Alpha',
	status: 'ACTIVE',
	currentTask: 'HOLD',
	actionsExecuted: 40,
	fleet: { pendingProposal: null }
};
const KILLED: AgentView = { ...ACTIVE, status: 'PAUSED' };

function fakeTelegram() {
	const sent: { chatId: number; text: string; keyboard?: Keyboard }[] = [];
	const edited: { chatId: number; messageId: number; text: string }[] = [];
	const answered: { id: string; text?: string }[] = [];
	const telegram: TelegramApi = {
		getUpdates: async () => [],
		sendMessage: async (chatId, text, keyboard) => void sent.push({ chatId, text, keyboard }),
		editMessageText: async (chatId, messageId, text) => void edited.push({ chatId, messageId, text }),
		answerCallbackQuery: async (id, text) => void answered.push({ id, text })
	};
	return { telegram, sent, edited, answered };
}

function fakeOberek(lists: (AgentView[] | Error)[], answer: Answer = { kind: 'answered', status: 200, body: { counter: 41 } }) {
	const posted: ServerRequest[] = [];
	const oberek: OberekApi = {
		listAgents: async () => {
			const next = lists.shift() ?? [];
			if (next instanceof Error) throw next;
			return next;
		},
		post: async (request) => {
			posted.push(request);
			return answer;
		}
	};
	return { oberek, posted };
}

const command = (chatId: number, text: string): Update => ({
	update_id: 1,
	message: { message_id: 1, chat: { id: chatId }, text }
});
const press = (chatId: number, data: string): Update => ({
	update_id: 2,
	callback_query: { id: 'q1', data, message: { message_id: 9, chat: { id: chatId }, text: 'Oberek Sentinel Alpha' } }
});

describe('commands', () => {
	test('/start tells anyone their chat id', async () => {
		const { telegram, sent } = fakeTelegram();
		await createBot({ telegram, oberek: fakeOberek([]).oberek, ownerChatId: null }).handleUpdate(command(STRANGER, '/start'));
		expect(sent[0].chatId).toBe(STRANGER);
		expect(sent[0].text).toContain('TELEGRAM_OWNER_CHAT_ID=7');
	});

	test('/agents answers the owner with one message per fleet agent', async () => {
		const { telegram, sent } = fakeTelegram();
		const { oberek } = fakeOberek([[ACTIVE, KILLED]]);
		await createBot({ telegram, oberek, ownerChatId: OWNER }).handleUpdate(command(OWNER, '/agents@oberek_owner_bot'));
		expect(sent.map((message) => message.text)).toEqual([
			'▶ Oberek Sentinel Alpha · running · step 40\nHOLD',
			'⏸ Oberek Sentinel Alpha · killed · step 40'
		]);
	});

	test('/agents says so when the server is down', async () => {
		const { telegram, sent } = fakeTelegram();
		const { oberek } = fakeOberek([new Error('connection refused')]);
		await createBot({ telegram, oberek, ownerChatId: OWNER }).handleUpdate(command(OWNER, '/agents'));
		expect(sent.map((message) => message.text)).toEqual(['Oberek server unreachable: connection refused']);
	});

	test('a stranger gets nothing from /agents', async () => {
		const { telegram, sent } = fakeTelegram();
		await createBot({ telegram, oberek: fakeOberek([[ACTIVE]]).oberek, ownerChatId: OWNER }).handleUpdate(
			command(STRANGER, '/agents')
		);
		expect(sent).toEqual([]);
	});
});

describe('buttons', () => {
	test("the owner's press goes to the server and the message shows the result, without buttons", async () => {
		const { telegram, edited, answered } = fakeTelegram();
		const { oberek, posted } = fakeOberek([]);
		await createBot({ telegram, oberek, ownerChatId: OWNER }).handleUpdate(press(OWNER, 'accept:sentinel-01'));
		expect(posted).toEqual([{ path: '/api/agents/sentinel-01/approval', body: { verdict: 'accept' } }]);
		expect(answered).toEqual([{ id: 'q1', text: undefined }]);
		expect(edited).toEqual([{ chatId: OWNER, messageId: 9, text: 'Oberek Sentinel Alpha\n\n✅ Approved · step 41' }]);
	});

	test('a press while the server is down says so in the message', async () => {
		const { telegram, edited } = fakeTelegram();
		const { oberek } = fakeOberek([], { kind: 'unreachable', reason: 'connection refused' });
		await createBot({ telegram, oberek, ownerChatId: OWNER }).handleUpdate(press(OWNER, 'kill:sentinel-01'));
		expect(edited[0].text).toEndWith('Server unreachable: connection refused');
	});

	test("a stranger's press does nothing", async () => {
		const { telegram, edited, answered } = fakeTelegram();
		const { oberek, posted } = fakeOberek([]);
		await createBot({ telegram, oberek, ownerChatId: OWNER }).handleUpdate(press(STRANGER, 'kill:sentinel-01'));
		expect([posted, edited, answered]).toEqual([[], [], []]);
	});

	test('an unknown button is answered and sends nothing to the server', async () => {
		const { telegram, answered } = fakeTelegram();
		const { oberek, posted } = fakeOberek([]);
		await createBot({ telegram, oberek, ownerChatId: OWNER }).handleUpdate(press(OWNER, 'pause:sentinel-01'));
		expect(answered).toEqual([{ id: 'q1', text: 'Unknown button' }]);
		expect(posted).toEqual([]);
	});
});

describe('checkAgents', () => {
	test('sends the change notices to the owner', async () => {
		const { telegram, sent } = fakeTelegram();
		const bot = createBot({ telegram, oberek: fakeOberek([[ACTIVE], [KILLED]]).oberek, ownerChatId: OWNER });
		await bot.checkAgents();
		await bot.checkAgents();
		expect(sent.map((message) => [message.chatId, message.text])).toEqual([[OWNER, '⏸ Oberek Sentinel Alpha is killed · step 40']]);
	});

	test('a failed read keeps the last good list, so nothing is sent twice', async () => {
		const { telegram, sent } = fakeTelegram();
		const lines: string[] = [];
		const lists = [[ACTIVE], [KILLED], new Error('connection refused'), [KILLED]];
		const reads = lists.length; // the fake shift()s the list, so count before the loop
		const bot = createBot({ telegram, oberek: fakeOberek(lists).oberek, ownerChatId: OWNER, log: (line) => lines.push(line) });
		for (let read = 0; read < reads; read++) await bot.checkAgents();
		expect(sent).toHaveLength(1);
		expect(lines).toEqual(['agent poll failed: connection refused']);
	});

	test('without an owner chat it reads nothing', async () => {
		const { telegram, sent } = fakeTelegram();
		const { oberek } = fakeOberek([[KILLED]]);
		await createBot({ telegram, oberek, ownerChatId: null }).checkAgents();
		expect(sent).toEqual([]);
	});
});
