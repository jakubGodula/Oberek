import type { GuardAccount } from 'pq-agent-guard';
import { assertInFleet } from './record-decision';
import type { FleetRuntime } from './submit-decision';

// The owner's kill switch: kill stops the agent's steps on chain, resume lets them through again. The server signs both
// as the owner (OWNER_KEYPAIR), because the page and the Telegram bot have no wallet.

export type ControlAction = 'kill' | 'resume';

export function parseControlAction(body: unknown): ControlAction | null {
	const action = typeof body === 'object' && body !== null ? (body as Record<string, unknown>).action : undefined;
	return action === 'kill' || action === 'resume' ? action : null;
}

/** The guard refuses a kill of a killed agent and a resume of an active one. */
export async function controlAgent(runtime: FleetRuntime, agentId: string, action: ControlAction): Promise<GuardAccount> {
	assertInFleet(runtime, agentId);
	const { owner } = await runtime.guard.readAgent(agentId);
	return action === 'kill' ? runtime.guard.kill(agentId, owner) : runtime.guard.resume(agentId, owner);
}
