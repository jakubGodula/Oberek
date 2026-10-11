import { GuardError, NO_DECISION, type AgentGuard, type GuardAccount } from '../../agent-guard/guard';

/** Stands in for the program in tests: one agent's account in memory, with the step, kill and resume rules. */
export class MemoryGuard implements AgentGuard {
	private account: GuardAccount;

	constructor(
		private readonly agentId: string,
		owner: string
	) {
		this.account = { owner, status: 'Active', counter: 0, lastDecision: NO_DECISION };
	}

	async readAgent(agentId: string): Promise<GuardAccount> {
		if (agentId !== this.agentId) throw new GuardError('AgentNotFound', `no ${agentId}`);
		return this.account;
	}

	async recordStep(agentId: string, counter: number, decisionHash: string): Promise<GuardAccount> {
		const account = await this.readAgent(agentId);
		if (account.status === 'Killed') throw new GuardError('AgentKilled', 'killed');
		if (counter !== account.counter + 1) throw new GuardError('CounterMismatch', 'stale counter');
		return (this.account = { ...account, counter, lastDecision: decisionHash });
	}

	async kill(agentId: string): Promise<GuardAccount> {
		return (this.account = { ...(await this.readAgent(agentId)), status: 'Killed' });
	}

	async resume(agentId: string): Promise<GuardAccount> {
		const account = await this.readAgent(agentId);
		return (this.account = { ...account, status: 'Active', counter: account.counter + 1 });
	}
}
