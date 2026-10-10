export type Env = Record<string, string | undefined>;

/** A positive number from the environment, or the fallback when unset; anything else throws, naming the variable. */
export function positiveNumber(env: Env, name: string, fallback: number, { integer = false } = {}): number {
	const raw = env[name];
	if (raw === undefined) return fallback;
	const value = Number(raw);
	const valid = raw !== '' && Number.isFinite(value) && value > 0 && (!integer || Number.isInteger(value));
	if (!valid) throw new Error(`${name} must be a positive ${integer ? 'whole number' : 'number'}, got "${raw}"`);
	return value;
}
