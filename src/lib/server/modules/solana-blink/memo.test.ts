import { expect, test } from 'bun:test';
import { memoText } from './memo';

const ROOT = 'ab'.repeat(32);

test('memoText names the agent, the decision and the root prefix', () => {
	expect(memoText('tick-01', 'pause', ROOT)).toBe(`AEGIS_PQC_DMS:tick-01:PAUSE:${ROOT.slice(0, 16)}`);
});
