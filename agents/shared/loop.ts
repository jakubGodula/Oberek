// The agents' main loop: one step, a pause, again — until the stop signal. A step in flight always finishes, so an
// agent never walks away from a submission it has started; only the pause is cut short.

/** Runs `step` every `intervalMs` until `stop` is aborted. */
export async function runLoop(step: () => Promise<void>, intervalMs: number, stop: AbortSignal): Promise<void> {
	while (!stop.aborted) {
		await step();
		await pause(intervalMs, stop);
	}
}

/** Waits `ms`, or less when `stop` is aborted meanwhile. */
function pause(ms: number, stop: AbortSignal): Promise<void> {
	return new Promise((resolve) => {
		if (stop.aborted) return resolve();
		const timer = setTimeout(done, ms);
		stop.addEventListener('abort', done, { once: true });
		function done() {
			clearTimeout(timer);
			stop.removeEventListener('abort', done);
			resolve();
		}
	});
}

/** An abort signal fired by Ctrl+C or SIGTERM, so a running agent stops between steps. */
export function stopOnSignals(): AbortSignal {
	const stop = new AbortController();
	for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => stop.abort());
	return stop.signal;
}
