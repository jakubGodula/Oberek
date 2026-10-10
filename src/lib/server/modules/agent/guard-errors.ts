/** GuardError codes from onchain/programs/onchain_agent_guard/src/error.rs (Anchor numbers custom errors from 6000). */
export const GUARD_ERROR_CODES = {
	AgentKilled: 6000,
	AgentNotKilled: 6001,
	AgentNotActive: 6002,
	InvalidPublicKey: 6003,
	InvalidSignature: 6004,
	InvalidKeyAccount: 6005,
	VerifyFailed: 6006
} as const;

const GUARD_ERROR_NAMES = new Map<number, string>(
	Object.entries(GUARD_ERROR_CODES).map(([name, code]) => [code, name])
);

/** Custom program error code of a transaction error such as `{ InstructionError: [0, { Custom: 6000 }] }`. */
export function customErrorCode(err: unknown): number | null {
	const instructionError = (err as { InstructionError?: [unknown, unknown] } | null)?.InstructionError;
	const custom = (instructionError?.[1] as { Custom?: number | bigint } | undefined)?.Custom;
	return custom === undefined ? null : Number(custom);
}

export function describeTransactionError(err: unknown): string {
	const code = customErrorCode(err);
	const name = code === null ? undefined : GUARD_ERROR_NAMES.get(code);
	return name ?? JSON.stringify(err, (_, value) => (typeof value === 'bigint' ? Number(value) : value));
}
