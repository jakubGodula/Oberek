/** JSON with bigints (e.g. RPC error codes, counters) written as numbers. */
export function stringifyWithBigints(value: unknown): string {
	return JSON.stringify(value, (_, item) => (typeof item === 'bigint' ? Number(item) : item));
}
