import { expect, test } from 'bun:test';
import { loadSentinelConfig } from './config';

test('defaults to sentinel-01 on the local server, every 30 s, a 0.02 pp band and a 15-minute schedule', () => {
	expect(loadSentinelConfig({})).toEqual({
		apiUrl: 'http://localhost:5173',
		agentId: 'sentinel-01',
		intervalMs: 30_000,
		policy: { targetSolShare: 0.5, driftThreshold: 0.0002, scheduleMinutes: 15 }
	});
});

test('reads the band in percentage points and the schedule in minutes', () => {
	const config = loadSentinelConfig({ SENTINEL_DRIFT_PP: '0.05', SENTINEL_SCHEDULE_MIN: '5' });
	expect(config.policy).toEqual({ targetSolShare: 0.5, driftThreshold: 0.0005, scheduleMinutes: 5 });
});

test('reads the server, the agent id and the interval', () => {
	const config = loadSentinelConfig({
		SENTINEL_API_URL: 'http://other:5174',
		SENTINEL_AGENT_ID: 'sentinel-02',
		SENTINEL_INTERVAL_MS: '60000'
	});
	expect(config).toMatchObject({ apiUrl: 'http://other:5174', agentId: 'sentinel-02', intervalMs: 60_000 });
});

test.each([
	['SENTINEL_DRIFT_PP', '0.02pp'],
	['SENTINEL_DRIFT_PP', ''],
	['SENTINEL_SCHEDULE_MIN', '0'],
	['SENTINEL_INTERVAL_MS', '1.5']
])('refuses %s=%p, naming the variable', (name, raw) => {
	expect(() => loadSentinelConfig({ [name]: raw })).toThrow(name);
});
