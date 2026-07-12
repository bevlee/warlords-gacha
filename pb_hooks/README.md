# PocketBase backend

Install: `brew install pocketbase` (built against v0.39.x).

Run from the repo root (uses ./pb_data, ./pb_hooks, ./pb_migrations by default):

```bash
npm run pb        # pocketbase serve on :8090; migrations auto-apply
```

Endpoints (all require auth; wallets/collection_units are mutated only here —
their API rules are locked to reads):

- `POST /api/gacha/pull` — deduct 100 coins, roll tier then uniform unit of
  that tier, increment copies. Returns `{unitSlug, copiesBefore, copiesAfter, coins}`.
- `POST /api/gacha/reward` — body `{coins}` int 1..1000, credits the wallet.
- `POST /api/gacha/publish-run` — body `{mode, depth, combatScore, army}`;
  records a leaderboard run; `depth >= 10` also upserts your ally army.

`lib/catalog.js` is GENERATED from the engine by `npm run export-catalog` —
rerun it whenever units are added. The tier odds table in `gacha.pb.js` is
duplicated from `src/lib/gacha/config.ts`; keep them in sync.

## Trust model (explicit)

Pulls are cheat-resistant (server rolls, locked write rules). Battle rewards
and run publishing are **client-asserted** — battles run client-side, so the
server can only sanity-cap them (reward ≤ 1000/call, depth ≤ 1000, score
bounds, ally armies validated against the catalog with 1..10000 stack
counts). Acceptable for the co-op PvE design; revisit before anything
competitive rides on these numbers.
