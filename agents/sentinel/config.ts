import { positiveNumber, type Env } from '../shared/env';
import type { Policy } from './policy';

export interface SentinelConfig {
	apiUrl: string;
	agentId: string;
	intervalMs: number;
	policy: Policy;
}

const DEFAULT_API_URL = 'http://localhost:5173';
const DEFAULT_AGENT_ID = 'sentinel-01';
/** Each decision is a paid devnet step (~15,000 lamports): 30 s is ~0.043 SOL a day. */
const DEFAULT_INTERVAL_MS = 30_000;
const TARGET_SOL_SHARE = 0.5;
/** Tight on purpose: on a quiet day SOL moves ~0.08% in a few minutes, so the demo shows rebalances. */
const DEFAULT_DRIFT_PP = 0.02;
const DEFAULT_SCHEDULE_MINUTES = 15;
const PERCENTAGE_POINTS_PER_SHARE = 100;
/**
 * A rebalance worth more than 0.25% of the treasury (~$520 today) waits for the owner; quiet-day trades stay ≤ 0.03%.
 */
const DEFAULT_APPROVAL_PCT = 0.25;
const PERCENT = 100;

export function loadSentinelConfig(env: Env): SentinelConfig {
	const driftPp = positiveNumber(env, 'SENTINEL_DRIFT_PP', DEFAULT_DRIFT_PP);
	return {
		apiUrl: env.SENTINEL_API_URL ?? DEFAULT_API_URL,
		agentId: env.SENTINEL_AGENT_ID ?? DEFAULT_AGENT_ID,
		intervalMs: positiveNumber(env, 'SENTINEL_INTERVAL_MS', DEFAULT_INTERVAL_MS, { integer: true }),
		policy: {
			targetSolShare: TARGET_SOL_SHARE,
			driftThreshold: driftPp / PERCENTAGE_POINTS_PER_SHARE,
			scheduleMinutes: positiveNumber(env, 'SENTINEL_SCHEDULE_MIN', DEFAULT_SCHEDULE_MINUTES),
			approvalShare: positiveNumber(env, 'SENTINEL_APPROVAL_PCT', DEFAULT_APPROVAL_PCT) / PERCENT
		}
	};
}
