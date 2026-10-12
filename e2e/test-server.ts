// The e2e tests' own Vite server (playwright.config.ts), on a port of its own so a demo on 5173 can run alongside.

export const TEST_SERVER_PORT = 5174;
export const TEST_SERVER_URL = `http://localhost:${TEST_SERVER_PORT}`;
