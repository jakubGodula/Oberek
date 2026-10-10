import { expect, test } from 'bun:test';
import { RateLimitedError, StepThrottle } from './step-throttle';

const MIN_INTERVAL_MS = 10_000;

test('lets the first step through and refuses another one inside the interval', () => {
	const throttle = new StepThrottle(MIN_INTERVAL_MS);
	throttle.claim('agent-a', 0);
	expect(() => throttle.claim('agent-a', 9_999)).toThrow(RateLimitedError);
});

test('says how long to wait', () => {
	const throttle = new StepThrottle(MIN_INTERVAL_MS);
	throttle.claim('agent-a', 0);
	try {
		throttle.claim('agent-a', 4_000);
	} catch (error) {
		expect((error as RateLimitedError).retryAfterMs).toBe(6_000);
	}
});

test('lets a step through once the interval has passed', () => {
	const throttle = new StepThrottle(MIN_INTERVAL_MS);
	throttle.claim('agent-a', 0);
	expect(() => throttle.claim('agent-a', MIN_INTERVAL_MS)).not.toThrow();
});

test('limits each agent separately', () => {
	const throttle = new StepThrottle(MIN_INTERVAL_MS);
	throttle.claim('agent-a', 0);
	expect(() => throttle.claim('agent-b', 1)).not.toThrow();
});

test('never refuses with a zero interval', () => {
	const throttle = new StepThrottle(0);
	throttle.claim('agent-a', 0);
	expect(() => throttle.claim('agent-a', 0)).not.toThrow();
});
