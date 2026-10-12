import { positiveNumber, type Env } from '../shared/env';

export interface JitoConfig {
	apiUrl: string;
	agentId: string;
	intervalMs: number;
}

const DEFAULT_API_URL = 'http://localhost:5173';
const DEFAULT_AGENT_ID = 'jito-01';
/** A quiet cycle sends nothing. A vote is a paid devnet step (~15,000 lamports). */
const DEFAULT_INTERVAL_MS = 30_000;

export function loadJitoConfig(env: Env): JitoConfig {
	return {
		apiUrl: env.JITO_API_URL ?? DEFAULT_API_URL,
		agentId: env.JITO_AGENT_ID ?? DEFAULT_AGENT_ID,
		intervalMs: positiveNumber(env, 'JITO_INTERVAL_MS', DEFAULT_INTERVAL_MS, { integer: true })
	};
}
