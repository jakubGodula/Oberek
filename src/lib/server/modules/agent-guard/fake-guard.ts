import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { assertAgentId, GuardError, NO_DECISION, type AgentGuard, type GuardAccount } from './guard';

/**
 * Stands in for the onchain_agent_guard program: one JSON file per agent account (instead of the account on Solana)
 * and the program's rules on top. Outside the server's memory, so a kill survives a server restart.
 */
export class FakeGuard implements AgentGuard {
	constructor(private readonly chainDir: string) {}

	/** The fake `register_agent`. */
	async register(agentId: string, owner: string): Promise<GuardAccount> {
		if (existsSync(this.accountPath(agentId))) throw new Error(`agent ${agentId} is already registered`);
		return this.save(agentId, { owner, status: 'Active', counter: 0, lastDecision: NO_DECISION });
	}

	async readAgent(agentId: string): Promise<GuardAccount> {
		const path = this.accountPath(agentId);
		if (!existsSync(path)) throw new GuardError('AgentNotFound', `agent ${agentId} has no guard account`);
		return JSON.parse(readFileSync(path, 'utf8'));
	}

	async recordStep(agentId: string, decisionHash: string): Promise<GuardAccount> {
		const account = await this.readAgent(agentId);
		if (account.status === 'Killed') throw new GuardError('AgentKilled', `agent ${agentId} is killed`);
		return this.save(agentId, { ...account, counter: account.counter + 1, lastDecision: decisionHash });
	}

	async kill(agentId: string, owner: string): Promise<GuardAccount> {
		const account = await this.readOwnedAgent(agentId, owner);
		if (account.status === 'Killed') throw new GuardError('AgentNotActive', `agent ${agentId} is already killed`);
		return this.save(agentId, { ...account, status: 'Killed' });
	}

	async resume(agentId: string, owner: string): Promise<GuardAccount> {
		const account = await this.readOwnedAgent(agentId, owner);
		if (account.status === 'Active') throw new GuardError('AgentNotKilled', `agent ${agentId} is not killed`);
		return this.save(agentId, { ...account, status: 'Active', counter: account.counter + 1 });
	}

	private async readOwnedAgent(agentId: string, owner: string): Promise<GuardAccount> {
		const account = await this.readAgent(agentId);
		if (account.owner !== owner) throw new GuardError('NotOwner', `${owner} does not own agent ${agentId}`);
		return account;
	}

	private accountPath(agentId: string): string {
		assertAgentId(agentId);
		return join(this.chainDir, `${agentId}.json`);
	}

	private save(agentId: string, account: GuardAccount): GuardAccount {
		mkdirSync(this.chainDir, { recursive: true });
		writeFileSync(this.accountPath(agentId), JSON.stringify(account, null, 2) + '\n');
		return account;
	}
}
