import { expect, test } from 'bun:test';
import { configLines, redactorFor } from './redact';

const BOT_TOKEN = '123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw';
const CHAT_ID = '987654321';

test('a secret env value becomes its name', () => {
	const redact = redactorFor({ TELEGRAM_BOT_TOKEN: BOT_TOKEN });
	expect(redact(`GET https://api.telegram.org/bot${BOT_TOKEN}/getUpdates failed`)).toBe(
		'GET https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getUpdates failed'
	);
});

test('the owner chat id is hidden too', () => {
	expect(redactorFor({ TELEGRAM_OWNER_CHAT_ID: CHAT_ID })(`sent to ${CHAT_ID}`)).toBe('sent to <TELEGRAM_OWNER_CHAT_ID>');
});

test('a plain RPC URL stays readable', () => {
	const url = 'https://api.devnet.solana.com';
	expect(redactorFor({ SOLANA_RPC_URL: url })(`rpc ${url}`)).toBe(`rpc ${url}`);
});

test('an RPC URL with a key in its path keeps only its host', () => {
	const url = 'https://example.solana-devnet.quiknode.pro/abc123secret/';
	expect(redactorFor({ SOLANA_RPC_URL: url })(`rpc ${url}`)).toBe(
		'rpc https://example.solana-devnet.quiknode.pro/<redacted>'
	);
});

test('a key in any URL query is hidden, even one not from env', () => {
	expect(redactorFor({})('fetch https://devnet.helius-rpc.com/?api-key=abc-123&x=1 failed')).toBe(
		'fetch https://devnet.helius-rpc.com/?api-key=<redacted>&x=1 failed'
	);
});

test('short and non-secret values are left alone', () => {
	const redact = redactorFor({ API_TOKEN: '1', TICK_AGENT_ID: 'tick-01' });
	expect(redact('tick-01 step 1')).toBe('tick-01 step 1');
});

test('config lines list the documented names, secrets masked, unset ones marked', () => {
	const example = 'GUARD_PROGRAM_ID=abc\n# a comment\n# TELEGRAM_BOT_TOKEN=\nBATCHED_AGENT_IDS=\n';
	const env = { GUARD_PROGRAM_ID: 'BL6F', TELEGRAM_BOT_TOKEN: BOT_TOKEN, OTHER_SECRET_THING: 'not listed' };
	expect(configLines(example, env, redactorFor(env))).toEqual([
		'GUARD_PROGRAM_ID=BL6F',
		'TELEGRAM_BOT_TOKEN=<TELEGRAM_BOT_TOKEN>',
		'BATCHED_AGENT_IDS=(unset)'
	]);
});
