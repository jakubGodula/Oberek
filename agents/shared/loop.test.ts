import { expect, test } from 'bun:test';
import { runLoop } from './loop';

const LONG_INTERVAL_MS = 60_000;

test('repeats the step until stopped', async () => {
	const stop = new AbortController();
	let steps = 0;
	await runLoop(
		async () => {
			steps += 1;
			if (steps === 3) stop.abort();
		},
		0,
		stop.signal
	);
	expect(steps).toBe(3);
});

test('lets a step in flight finish', async () => {
	const stop = new AbortController();
	let finished = false;
	await runLoop(
		async () => {
			stop.abort();
			await Bun.sleep(10);
			finished = true;
		},
		0,
		stop.signal
	);
	expect(finished).toBe(true);
});

test('cuts the wait between steps short', async () => {
	const stop = new AbortController();
	const started = Date.now();
	const loop = runLoop(async () => {}, LONG_INTERVAL_MS, stop.signal);
	await Bun.sleep(10);
	stop.abort();
	await loop;
	expect(Date.now() - started).toBeLessThan(1_000);
});

test('runs no step when stopped before the start', async () => {
	const stop = new AbortController();
	stop.abort();
	let steps = 0;
	await runLoop(async () => void (steps += 1), 0, stop.signal);
	expect(steps).toBe(0);
});

test('asks for the next pause after each step, so a new pace applies from the next tick', async () => {
	const stop = new AbortController();
	const asked: number[] = [];
	let steps = 0;
	await runLoop(
		async () => {
			steps += 1;
			if (steps === 3) stop.abort();
		},
		async () => {
			asked.push(steps);
			return 0;
		},
		stop.signal
	);
	expect(asked).toEqual([1, 2, 3]);
});
