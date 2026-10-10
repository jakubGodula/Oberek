import { defineEnvVars } from '@sveltejs/kit/env';

// The server-only variables of the fleet runtime (see .env.example). In dev, SvelteKit reads them from the .env files of
// the Vite mode (.env, .env.<mode>), not from the shell. All are optional: the fake chain needs none of them.
const optional = (value: string | undefined) => value;

export const variables = defineEnvVars({
	CHAIN: { schema: optional, description: 'fake (default: local files) or devnet (the onchain_agent_guard program)' },
	GUARD_PROGRAM_ID: { schema: optional, description: 'onchain_agent_guard address on devnet' },
	SOLANA_RPC_URL: { schema: optional, description: 'devnet RPC endpoint' },
	SOLANA_WS_URL: { schema: optional, description: 'devnet RPC websocket endpoint' },
	FEE_PAYER_KEYPAIR: { schema: optional, description: 'keypair file that pays the agents\' steps' },
	OWNER_KEYPAIR: { schema: optional, description: 'keypair file the server signs kill and resume with' }
});
