// Graceful shutdown for the demo: stage by stage (agents first, then the server), so nothing the agents started is cut
// off by the server going away. Each process gets SIGTERM, and SIGKILL only when it outlives its grace period.

export interface DemoProcess {
	readonly name: string;
	/** Settles when the process has exited. */
	readonly exited: Promise<unknown>;
	signal(signal: 'SIGTERM' | 'SIGKILL'): void;
}

export interface StopStage {
	readonly processes: readonly DemoProcess[];
	readonly graceMs: number;
}

/** Stops each stage in turn; the next starts only when every process of the previous one has exited. */
export async function stopInOrder(stages: readonly StopStage[]): Promise<void> {
	for (const stage of stages) await stopStage(stage);
}

async function stopStage({ processes, graceMs }: StopStage): Promise<void> {
	for (const process of processes) process.signal('SIGTERM');
	await Promise.all(processes.map((process) => stopWithin(process, graceMs)));
}

async function stopWithin(process: DemoProcess, graceMs: number): Promise<void> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const graceOver = new Promise<false>((resolve) => (timer = setTimeout(() => resolve(false), graceMs)));
	const exitedInTime = await Promise.race([process.exited.then(() => true), graceOver]);
	clearTimeout(timer);
	if (exitedInTime) return;
	process.signal('SIGKILL');
	await process.exited;
}
