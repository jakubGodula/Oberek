import { GuardError, NO_DECISION, type AgentGuard, type GuardAccount, type GuardStatus } from '../guard';

const MEMORY_AGENT_KEY = 'memory-agent-key';

/** Stands in for the program in tests: one agent's account in memory, with the step, kill and resume rules. */
export class MemoryGuard implements AgentGuard {
	private account: GuardAccount;

	constructor(
		private readonly agentId: string,
		owner: string,
		status: GuardStatus = 'Active'
	) {
		this.account = { owner, agentKey: MEMORY_AGENT_KEY, status, counter: 0, lastDecision: NO_DECISION };
	}

	async readAgent(agentId: string): Promise<GuardAccount> {
		if (agentId !== this.agentId) throw new GuardError('AgentNotFound', `no ${agentId}`);
		return this.account;
	}

	async recordStep(agentId: string, counter: number, decisionHash: string): Promise<GuardAccount> {
		const account = await this.readAgent(agentId);
		if (account.status === 'Pending') throw new GuardError('AgentPending', 'awaits activation');
		if (account.status === 'Killed') throw new GuardError('AgentKilled', 'killed');
		if (counter !== account.counter + 1) throw new GuardError('CounterMismatch', 'stale counter');
		this.account = { ...account, counter, lastDecision: decisionHash };
		return this.account;
	}

	async recordBatch(agentId: string, counter: number, root: string): Promise<GuardAccount> {
		return this.recordStep(agentId, counter, root);
	}

	async kill(agentId: string): Promise<GuardAccount> {
		this.account = { ...(await this.readAgent(agentId)), status: 'Killed' };
		return this.account;
	}

	async resume(agentId: string): Promise<GuardAccount> {
		const account = await this.readAgent(agentId);
		this.account = { ...account, status: 'Active', counter: account.counter + 1 };
		return this.account;
	}
}
