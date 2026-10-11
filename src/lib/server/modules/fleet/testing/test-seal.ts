import type { LogSeal } from '../log-seal';

/** A fixed seal for tests: Fleet only uses its data key; the capsule is never opened. */
export const TEST_SEAL: LogSeal = { kemCiphertext: new Uint8Array(1088), dataKey: new Uint8Array(32).fill(7) };
