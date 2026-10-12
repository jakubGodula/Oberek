import { expect, test } from 'bun:test';
import { loadJitoConfig } from './config';

test('defaults to jito-01 on the local server, every 30 s', () => {
	expect(loadJitoConfig({})).toEqual({
		apiUrl: 'http://localhost:5173',
		agentId: 'jito-01',
		intervalMs: 30_000
	});
});

test('reads the server, the agent id and the interval', () => {
	expect(
		loadJitoConfig({ JITO_API_URL: 'http://other:5174', JITO_AGENT_ID: 'jito-02', JITO_INTERVAL_MS: '60000' })
	).toEqual({ apiUrl: 'http://other:5174', agentId: 'jito-02', intervalMs: 60_000 });
});

test('refuses an interval that is not a positive whole number', () => {
	expect(() => loadJitoConfig({ JITO_INTERVAL_MS: '1.5' })).toThrow('JITO_INTERVAL_MS');
});
