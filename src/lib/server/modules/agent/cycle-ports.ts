import type { TransactionSigner } from '@solana/kit';
import type { CyclePorts, DecisionLogEntry } from './agent-loop';
import { fetchAgent, recordStep, signGuardMessage, type AgentFile, type GuardClient } from 'pq-agent-guard';

export function createCyclePorts(input: {
	client: GuardClient;
	feePayer: TransactionSigner;
	agentFile: AgentFile;
	appendLog: (entry: DecisionLogEntry) => Promise<void>;
	log?: (line: string) => void;
}): CyclePorts {
	const { client, feePayer, agentFile } = input;
	return {
		agent: agentFile.agent,
		readAgent: () => fetchAgent(client, agentFile.agent),
		sign: (message) => signGuardMessage(message, agentFile.mldsaSecretKey),
		sendStep: (decisionHash, signature) =>
			recordStep(client, { feePayer, agent: agentFile.agent, agentKey: agentFile.agentKey, decisionHash, signature }),
		appendLog: input.appendLog,
		now: () => new Date(),
		log: input.log ?? ((line) => console.log(`${new Date().toISOString()} ${line}`))
	};
}
