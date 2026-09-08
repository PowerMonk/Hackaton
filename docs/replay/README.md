# Demo Replay

The replay publishes a small, deterministic three-passenger scenario through the public API. It does not connect to PostgreSQL or insert data directly.

From the repository root, start the backend in demo mode and run:

```bash
bun run backend/scripts/demo-replay.ts --base-url http://localhost:3000 --seed 42 --speed 1
```

Supported speed multipliers are `1`, `5`, and `10`. They change wall-clock pacing while timestamps and route movement remain deterministic. The default scenario uses three passengers, GPS noise, variable speed, waiting pauses, and intentionally discarded samples. Use `--passengers 2` for the smallest run.

Equivalent environment variables are `REPLAY_BASE_URL`, `REPLAY_SEED`, `REPLAY_SPEED_MULTIPLIER`, `REPLAY_PASSENGERS`, `REPLAY_STEPS`, and `REPLAY_INTERVAL_SECONDS`.

The script creates sessions with `POST /boarding-sessions`, sends samples with `POST /locations`, then ends only the sessions it created with `DELETE /boarding-sessions/:id`. Existing data is not deleted.

Run its isolated tests with:

```bash
bun test backend/test/replay.test.ts
```
