import { expect, test } from 'bun:test';
import { stopInOrder, type DemoProcess } from './demo-stop';

const SHORT_GRACE_MS = 20;
const LONG_GRACE_MS = 1_000;

/** A process that exits `exitAfterMs` after SIGTERM (never, when null) and at once after SIGKILL. */
function fakeProcess(name: string, events: string[], exitAfterMs: number | null = 0): DemoProcess {
	let markExited!: () => void;
	const exited = new Promise<void>((resolve) => (markExited = resolve));
	const exit = () => {
		events.push(`${name} exited`);
		markExited();
	};
	return {
		name,
		exited,
		signal(signal) {
			events.push(`${name} ${signal}`);
			if (signal === 'SIGKILL') exit();
			else if (exitAfterMs !== null) setTimeout(exit, exitAfterMs);
		}
	};
}

test('stops the next stage only after the previous one has exited', async () => {
	const events: string[] = [];
	const agent = fakeProcess('sentinel', events, 10);
	const server = fakeProcess('server', events);

	await stopInOrder([
		{ processes: [agent], graceMs: LONG_GRACE_MS },
		{ processes: [server], graceMs: LONG_GRACE_MS }
	]);

	expect(events).toEqual(['sentinel SIGTERM', 'sentinel exited', 'server SIGTERM', 'server exited']);
});

test('kills a process that outlives its grace period', async () => {
	const events: string[] = [];
	const stuck = fakeProcess('tick', events, null);

	await stopInOrder([{ processes: [stuck], graceMs: SHORT_GRACE_MS }]);

	expect(events).toEqual(['tick SIGTERM', 'tick SIGKILL', 'tick exited']);
});

test('signals every process of a stage before waiting for any', async () => {
	const events: string[] = [];
	const sentinel = fakeProcess('sentinel', events, 10);
	const tick = fakeProcess('tick', events, 10);

	await stopInOrder([{ processes: [sentinel, tick], graceMs: LONG_GRACE_MS }]);

	expect(events.slice(0, 2)).toEqual(['sentinel SIGTERM', 'tick SIGTERM']);
});
