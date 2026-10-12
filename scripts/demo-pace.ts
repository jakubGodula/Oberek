// Sentinel's pace in the demo, faster than its defaults: a scheduled rebalance every 2 min, a cycle every 10 s (the
// most the server's step throttle allows). The e2e tests run it at the same pace.

export const DEMO_PACE = { SENTINEL_SCHEDULE_MIN: '2', SENTINEL_INTERVAL_MS: '10000' };
