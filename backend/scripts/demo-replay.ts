// Public entry point for the deterministic HTTP demo replay.
// Run from the project root: bun run backend/scripts/demo-replay.ts --speed 5

import { formatReplayReport, parseReplayConfig, runReplay } from "../src/simulation/replay";

if (import.meta.main) {
  try {
    const config = parseReplayConfig();
    console.log(`Starting HTTP demo replay at ${config.baseUrl} (${config.speedMultiplier}x, seed ${config.seed})`);
    const stats = await runReplay(config, { log: (message) => console.log(`[replay] ${message}`) });
    console.log(formatReplayReport(stats));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Replay failed: ${message}`);
    process.exitCode = 1;
  }
}
