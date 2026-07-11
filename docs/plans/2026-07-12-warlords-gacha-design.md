# warlordsGacha — Design

Merge of the warlords tactical battler and the gacha collection game. Your gacha
collection determines the units you can bring into an endless co-op-flavored
gauntlet; completing runs earns coins for more pulls.

## Repo strategy

- Fresh repo, **copy of the warlords codebase** (no git history), then reshaped.
- The gacha repo is a reference: its collection grid, pull ticker overlay, rarity
  CSS, and game-math config get ported in; its better-sqlite3/API layer does not.
- Source repos: `~/projects/warlords`, `~/projects/gacha`.

**Removed from warlords:** campaign mode (`CampaignMap`, `ArmySetup`, the
`setup|campaign|battle` screen machine), gold-budget recruiting (`recruit.ts`
flow — `UNIT_COSTS` survives, see combat score).

**Kept:** battle engine (`src/lib/engine/*`, 195 tests), sprite pipeline + real
per-unit art, gauntlet infrastructure (`src/lib/gauntlet/run.ts`), hero
progression.

**New:** PocketBase backend, endless mode, ally summon, run-reward economy,
base+modifier unit model.

## Backend & identity

- Two processes: `pocketbase serve` + SvelteKit SPA (`ssr = false` everywhere;
  static adapter still fine — PocketBase is a separate binary, not server routes).
- PocketBase email/password auth with required unique `username` (leaderboards).

## Unit catalog

- **Unit id = name slug** (`wolf-rider`, `bone-dragon`) — the same slugs warlords
  already uses for sprite art. No id mapping layer.
- **Faction (class) and tier are attributes**, not identity: `{slug, name,
  faction, tier}`. The current 42 units (6 factions × 7 tiers) are starting
  content — factions can gain extra units per tier, or new tiers, without schema
  or id changes.
- Every unit carries the **full uniform `Stats` schema** — `hp, attack, defense,
  speed, initiative, minDamage, maxDamage, shots, range, mana` — zeroed where
  unused, so future buffs can grant shots/spells to anything.

## Unit model: base + modifiers

```ts
interface UnitDef {          // immutable content, in faction files
  slug; name; faction; tier;
  base: Stats;
  isLarge: boolean;
  abilities: string[];       // innate ability ids
}

interface UnitModifier {     // run-scoped, accumulated during a gauntlet run
  source: string;            // 'gacha:silver', 'gauntlet:node-4-reward', ...
  flat?: Partial<Stats>;
  pct?: Partial<Stats>;
  grants?: string[];         // ability ids
}

interface UnitInstance { slug: string; modifiers: UnitModifier[]; }
```

- `resolve(def, modifiers)`: per stat `(base + Σflat) × (1 + Σpct)`; abilities =
  set union. Pure, order-independent, computed once at battle start; engine
  consumes the resolved shape (minimal engine change).
- Modifiers keep their `source` for UI provenance; **nothing in-run is
  permanent** — run modifiers die with the run. The only cross-run source is the
  gacha level, recomputed from the collection at run start.
- If abilities ever need parameters, `grants` upgrades from `string[]` to
  `{id, params}` — not built now.

## Gacha rules

- Pull odds by tier (T1..T7): **34/25/18/12/7/3/1 percent** (whole-percent
  source of truth). Roll tier, then **uniform among all units of that tier**
  across factions — adding a unit just dilutes its tier bucket.
- Pack cost 100 coins, 1 unit per pack.
- Levels derived from total copies: bronze 1, silver 3, gold 6, emerald 12,
  ruby 24, platinum 48, diamond 96. Rarity outline CSS ports as-is.
- **Option C collection→army rule:** owned units form the recruitment/draft
  pool; gacha level grants a small stat buff (e.g. +2%/level above bronze,
  tunable) applied as a `gacha:<level>` modifier.
- Rolls are **server-side** in a PocketBase JS hook (`pb_hooks/gacha.pb.js`,
  `POST /api/gacha/pull`): check coins, deduct, roll, increment collection,
  return result — same transactional semantics as the old SQLite endpoint.
- Pull ticker overlay ports as-is, including locked-unit silhouettes
  (pre-pull ownership). Card art switches from placeholder SVGs to warlords'
  sprite idle frames.

## Gauntlet & endless

- Nodes 1→10 (bosses 3/7/10) = a complete run; then the **endless gate**.
- **Draft gating (both filters):** end-of-battle unit choices are limited by
  battle tier / hero level (warlords' existing gating) **∩** gacha ownership.
- **No permanent unit loss:** win a battle → army fully restored, casualties
  included. Defeat ends the run.
- **Endless gate (one-time, optional choice):** continue solo, or with an ally —
  **random player / top combat score / top endless depth** (no username pick
  yet). Choice locks for the run and routes the result to the solo or ally
  leaderboard. Endless nodes count 11, 12, … with per-depth enemy scaling.
- **Ally in battle:** ally snapshot fields its strongest stacks (cap ~2-3,
  tunable) on the player's side, AI-controlled, restored each battle.
- **Run completion (node 10):** coin payout, army snapshot + combat score
  upserted to `ally_armies` — completing a run is what publishes you as a
  summonable ally.

## Economy

- **Battle rewards only** (no passive tick): coins per battle won scaling with
  node depth, completion bonus at node 10, better payouts in endless. Numbers
  tunable at implementation. `+100` dev button stays, dev-gated.

## PocketBase collections

- `users` — auth + unique `username`
- `collection_units` — `{user, unit_slug, copies}`
- `wallets` — `{user, coins}`
- `ally_armies` — `{user, army: JSON (slugs+counts, modifier-free),
  combat_score, created}` — upsert on node-10 completion
- `leaderboard_runs` — `{user, mode: 'solo'|'ally', depth, combat_score,
  created}`; leaderboards are queries over this

**Local (IndexedDB, warlords pattern):** in-progress `RunState` (instances +
run modifiers), hero progression. Runs playable offline; PB touched at run
start (collection fetch), pulls, and run end (publish).

**Combat score** = Σ (`UNIT_COSTS[unit]` × stack count) — reuses warlords'
balance-encoding prices instead of a new power formula.

## Routes

- `/` — hub: collection grid, coins header, Open Pack + ticker overlay, nav
- `/gauntlet` — run setup (owned-pool draft), battles, endless gate + ally
  picker, run summary
- `/leaderboards` — tabs: endless solo, endless ally
- `/login` — PocketBase auth + username claim

## Testing

- Engine tests ride along unchanged (base-only instances resolve to today's
  numbers). New unit tests: `resolve` stacking (flat-then-pct, ability union),
  draft double-gating, tier-bucket roll, combat score. Ported gacha config
  tests re-keyed to slugs. PB interactions integration-tested against a local
  throwaway instance. Golden path browser-verified with Playwright.

## Error handling

- Offline mid-run keeps playing (IndexedDB). Publishes/pulls queue or fail
  visibly; a failed network op never corrupts a run.

## Future hooks (shaped for, not built)

- Node choices: multiple battles per node with differing difficulty/rewards
- Adversarial ghost PvP (post-run matches against player armies)
- Friend favorites → full friend system; username ally pick returns with it
- Ability parameters (`grants: {id, params}`)
