// The speed wheel on Tick's card: the pauses between ticks the owner can pick. Shared by the page and the server, which
// accepts only these.

const PACE_STEPS_MS = [500, 1000, 2000, 5000, 10_000, 30_000];
/** Without batching every decision is a paid step, and the server lets through one per 10 s (MIN_STEP_INTERVAL_MS). */
const UNBATCHED_MIN_PACE_MS = 10_000;
const MS_PER_SECOND = 1000;
const TICK_KIND = 'tick';

/** Only Tick asks for its pace; the server cannot tell which program runs an agent, so it goes by the decision kind. */
export function acceptsPace(lastDecisionKind: string | null): boolean {
	return lastDecisionKind === TICK_KIND;
}

export function paceStepsFor(batched: boolean): number[] {
	return batched ? PACE_STEPS_MS : PACE_STEPS_MS.filter((ms) => ms >= UNBATCHED_MIN_PACE_MS);
}

/** A notch of the wheel: the pause in seconds. */
export function paceLabel(intervalMs: number): string {
	return `${intervalMs / MS_PER_SECOND} s`;
}

export function describePace(intervalMs: number): string {
	return `1 tick / ${paceLabel(intervalMs)}`;
}
