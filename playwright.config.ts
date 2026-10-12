// The e2e tests (e2e/*.e2e.ts) against devnet, with the test fleet served by a Vite server of their own on port 5174,
// so a demo on 5173 can run alongside. Set up the fleet once: bun scripts/setup.ts --e2e. Run: bun run e2e [--headed].
import { defineConfig } from '@playwright/test';
import { E2E_FLEET_DIR } from './src/lib/server/modules/fleet/fleet-dir';

const PORT = 5174;
const BASE_URL = `http://localhost:${PORT}`;
const SERVER_START_TIMEOUT_MS = 120_000;
/** The page refreshes every 5 s and a devnet transaction takes seconds to land. */
const EXPECT_TIMEOUT_MS = 60_000;
/** A Sentinel proposal needs a cycle or two, then the verdict lands: minutes, not seconds. */
const TEST_TIMEOUT_MS = 240_000;

export default defineConfig({
	testDir: 'e2e',
	testMatch: '*.e2e.ts',
	workers: 1,
	timeout: TEST_TIMEOUT_MS,
	expect: { timeout: EXPECT_TIMEOUT_MS },
	reporter: [['list'], ['html', { open: 'never' }]],
	use: {
		baseURL: BASE_URL,
		// Playwright ships no Chromium for this Ubuntu (20.04), so the tests drive the installed Google Chrome.
		channel: 'chrome',
		headless: true,
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure'
	},
	webServer: {
		command: `node_modules/.bin/vite dev --port ${PORT} --strictPort`,
		url: BASE_URL,
		reuseExistingServer: false,
		timeout: SERVER_START_TIMEOUT_MS,
		env: { FLEET_DIR: E2E_FLEET_DIR }
	}
});
