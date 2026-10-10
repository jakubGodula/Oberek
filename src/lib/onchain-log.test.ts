import { expect, test } from 'bun:test';
import { explorerTxUrl } from './onchain-log';

test('links a transaction to the devnet explorer', () => {
	expect(explorerTxUrl('5Kx3abc')).toBe('https://explorer.solana.com/tx/5Kx3abc?cluster=devnet');
});
