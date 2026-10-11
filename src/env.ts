import { defineEnvVars } from '@sveltejs/kit/env';

// The server-only variables of the fleet runtime (see .env.example). In dev, SvelteKit reads them from the .env files,
// not from the shell. Declared optional so the app starts without them; the runtime reports what is missing.
const optional = (value: string | undefined) => value;

export const variables = defineEnvVars({
	GUARD_PROGRAM_ID: { schema: optional, description: 'onchain_agent_guard address on devnet' },
	SOLANA_RPC_URL: { schema: optional, description: 'devnet RPC endpoint' },
	SOLANA_WS_URL: { schema: optional, description: 'devnet RPC websocket endpoint' },
	FEE_PAYER_KEYPAIR: { schema: optional, description: 'keypair file that pays the agents\' steps' },
	OWNER_KEYPAIR: { schema: optional, description: 'keypair file the server signs kill and resume with' },
	BATCHED_AGENT_IDS: { schema: optional, description: 'comma-separated agent ids whose decisions go on-chain in batches' },
	BATCH_FLUSH_MS: { schema: optional, description: "how often a batched agent's buffer is flushed, ms" },
	BATCH_MAX_DECISIONS: { schema: optional, description: "a batched agent's buffer flushes at once at this many decisions" }
});
