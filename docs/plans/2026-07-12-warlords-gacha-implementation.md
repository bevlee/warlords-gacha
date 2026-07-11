# warlordsGacha Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build warlordsGacha per `docs/plans/2026-07-12-warlords-gacha-design.md` — warlords' gauntlet battler gated by a gacha collection, with endless mode, ally summons, leaderboards, and PocketBase.

**Architecture:** Copy of the warlords codebase (fresh history), campaign mode stripped. Engine gains a base+modifier unit model via a pure `resolve()`. Gacha screens ported from `~/projects/gacha` re-keyed to unit-name slugs. PocketBase (separate binary, JS hooks) owns auth/collection/coins/allies/leaderboards; runs stay local in IndexedDB.

**Tech Stack:** SvelteKit 2, Svelte 5 runes, Tailwind 4, Vitest, PocketBase (+ JS SDK), idb, Playwright (verification only).

**Read the design doc first.** Both source repos are local: `~/projects/warlords` (base, being copied), `~/projects/gacha` (reference for ported code).

**Conventions:**
- Svelte 5 runes everywhere. Commit after every task with the given message.
- Warlords' engine tests (195) are load-bearing: they must stay green through every task.
- Tasks that modify warlords code start with "read the file" steps — do them; the plan intentionally does not fabricate code for files it hasn't shown you.

---

### Task 1: Import warlords codebase

**Step 1:** Copy warlords into the repo root (which currently contains only `docs/` and `.git`):
```bash
cd /Users/bevan/projects/warlordsGacha
rsync -a --exclude .git --exclude node_modules --exclude .svelte-kit --exclude build ~/projects/warlords/ .
npm install
```
**Step 2:** Verify health: `npm run check` (expect 0 errors) and `npx vitest run` (expect 18 files / 195 tests green).
**Step 3:** Update `package.json` name to `warlordsgacha`. Append to `.gitignore`: `pb_data/`.
**Step 4:** Commit: `git add -A && git commit -m "chore: import warlords codebase"`

### Task 2: Strip campaign mode

**Step 1:** Read `src/routes/+page.svelte` (the `setup|campaign|battle` screen machine), and find campaign-only modules: `src/lib/ui/CampaignMap.svelte`, `src/lib/ui/ArmySetup.svelte`, and whatever in `src/lib/` only they import (check with grep before deleting anything).
**Step 2:** Replace `src/routes/+page.svelte` with a minimal placeholder hub (heading "warlordsGacha", link to `/gauntlet`) — Task 10 builds the real hub. Delete `CampaignMap.svelte`, `ArmySetup.svelte`, and campaign-only helpers. **Do not delete** `src/lib/engine/recruit.ts` — `UNIT_COSTS` powers combat score later; delete only unused budget-flow functions in it (verify by grep who imports what).
**Step 3:** `npm run check` clean; `npx vitest run` — engine tests must still pass (if a test file tested deleted campaign UI helpers, delete that test file too and say so in the commit body; engine tests must not be touched).
**Step 4:** Commit: `chore: strip campaign mode, gauntlet is the only mode`

### Task 3: Catalog metadata + uniform Stats (TDD)

Add slug/faction/tier identity and the uniform stat schema to the engine content.

**Step 1:** Read `src/lib/engine/types.ts` and one faction file (`src/lib/engine/knight.ts`) to learn the current `UnitDef` shape and how units are declared.
**Step 2:** Write failing test `src/lib/engine/catalog.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { CATALOG, unitBySlug, slugify } from './catalog';

describe('catalog', () => {
	it('exposes all units with slug/faction/tier identity', () => {
		expect(CATALOG.length).toBeGreaterThanOrEqual(42);
		for (const u of CATALOG) {
			expect(u.slug).toBe(slugify(u.name));
			expect(u.tier).toBeGreaterThanOrEqual(1);
			expect(u.tier).toBeLessThanOrEqual(7);
			expect(['barbarian', 'knight', 'wizard', 'necromancer', 'ranger', 'demon']).toContain(u.faction);
		}
	});
	it('slugs are unique and match sprite keys', () => {
		expect(new Set(CATALOG.map((u) => u.slug)).size).toBe(CATALOG.length);
		expect(unitBySlug('wolf-rider')?.name).toBe('Wolf Rider');
		expect(unitBySlug('bone-dragon')?.tier).toBe(7);
	});
	it('every unit carries the full uniform Stats schema', () => {
		for (const u of CATALOG) {
			for (const k of ['hp','attack','defense','speed','initiative','minDamage','maxDamage','shots','range','mana']) {
				expect(u.base[k], `${u.slug}.${k}`).toBeTypeOf('number');
			}
		}
	});
});
```
**Step 3:** Run → FAIL (no `./catalog`).
**Step 4:** Implement `src/lib/engine/catalog.ts`: import `FACTION_UNITS` from `factions.ts`; export `slugify(name)` (kebab-case — must match how `ui/sprites.ts` keys art; read it and reuse its slug function if one exists, do not invent a second), and build `CATALOG: CatalogUnit[]` where `CatalogUnit = UnitDef & {slug, faction, tier, base: Stats}`. Prefer **adapting, not rewriting, the faction files**: derive `base` from existing stat fields, defaulting `mana: 0` (and any other missing uniform field) in the adapter so faction files stay untouched. Keep the existing `UnitDef` export intact for the engine.
**Step 5:** Tests pass; whole suite still green; check clean.
**Step 6:** Commit: `feat: unit catalog with slug identity and uniform stat schema`

### Task 4: Base + modifier model with resolve() (TDD)

**Step 1:** Write failing test `src/lib/engine/resolve.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { resolve, type UnitModifier } from './resolve';
import { unitBySlug } from './catalog';

const goblin = unitBySlug('goblin')!;

describe('resolve', () => {
	it('no modifiers returns base stats and innate abilities', () => {
		const r = resolve(goblin, []);
		expect(r.stats).toEqual(goblin.base);
		expect(r.abilities).toEqual(goblin.abilities);
	});
	it('applies flat then percent, order-independent', () => {
		const flat: UnitModifier = { source: 'a', flat: { attack: 2 } };
		const pct: UnitModifier = { source: 'b', pct: { attack: 0.5 } };
		const r1 = resolve(goblin, [flat, pct]);
		const r2 = resolve(goblin, [pct, flat]);
		expect(r1.stats.attack).toBe(Math.round((goblin.base.attack + 2) * 1.5));
		expect(r2.stats.attack).toBe(r1.stats.attack);
	});
	it('sums multiple percent modifiers additively', () => {
		const r = resolve(goblin, [
			{ source: 'a', pct: { hp: 0.1 } },
			{ source: 'b', pct: { hp: 0.1 } }
		]);
		expect(r.stats.hp).toBe(Math.round(goblin.base.hp * 1.2));
	});
	it('unions granted abilities without duplicates', () => {
		const r = resolve(goblin, [{ source: 'a', grants: ['regeneration', goblin.abilities[0] ?? 'regeneration'] }]);
		expect(new Set(r.abilities).size).toBe(r.abilities.length);
		expect(r.abilities).toContain('regeneration');
	});
});
```
**Step 2:** Run → FAIL. **Step 3:** Implement `src/lib/engine/resolve.ts`:
```ts
import type { CatalogUnit, Stats } from './catalog';

export interface UnitModifier {
	source: string;
	flat?: Partial<Stats>;
	pct?: Partial<Stats>;
	grants?: string[];
}
export interface UnitInstance { slug: string; modifiers: UnitModifier[]; }

export function resolve(def: CatalogUnit, modifiers: UnitModifier[]) {
	const stats = { ...def.base };
	for (const k of Object.keys(stats) as (keyof Stats)[]) {
		const flat = modifiers.reduce((a, m) => a + (m.flat?.[k] ?? 0), 0);
		const pct = modifiers.reduce((a, m) => a + (m.pct?.[k] ?? 0), 0);
		stats[k] = Math.round((def.base[k] + flat) * (1 + pct));
	}
	const abilities = [...new Set([...def.abilities, ...modifiers.flatMap((m) => m.grants ?? [])])];
	return { stats, abilities };
}
```
(Adjust `Stats` import to wherever Task 3 defined it.) **Step 4:** green + check clean. **Step 5:** Commit: `feat: base+modifier unit model with pure resolve`

### Task 5: Gacha config (odds, levels, tier-bucket roll) (TDD)

Port `~/projects/gacha/src/lib/game/config.ts` + tests, re-keyed to slugs. Create `src/lib/gacha/config.ts` + `config.test.ts`:
- Keep: `TIER_PERCENTS = [34,25,18,12,7,3,1]` (whole-percent source of truth), `TIER_ODDS` derived, `LEVELS`, `LEVEL_THRESHOLDS = [1,3,6,12,24,48,96]`, `levelFor`, `rollTier` (integer-percent accumulation — copy it exactly; it fixes a float bug), `PACK_COST = 100`.
- Replace `rollUnit`: `rollTier`, then uniform pick among `CATALOG.filter(u => u.tier === tier)` using a second `rand()` call.
- New: `gachaLevelModifier(level): UnitModifier | null` — `{source: 'gacha:'+level, pct: {hp: p, attack: p, defense: p}}` where `p = 0.02 × levelIndex` (bronze=0 → null, silver=+2%, … diamond=+12%).
- Port the gacha repo's test file, adapting: catalog assertions → CATALOG-based, `rollUnit` determinism → seed two rand values (tier then index), add `gachaLevelModifier` boundary tests (bronze → null, diamond → 0.12).
TDD order, suite green, check clean. Commit: `feat: gacha odds, leveling, and tier-bucket roll`

### Task 6: PocketBase setup (binary, schema, hooks)

**Step 1:** Install PocketBase locally: `brew install pocketbase` if available, else download the latest darwin-arm64 release zip from github.com/pocketbase/pocketbase into `pb/` (gitignore the binary, commit a `pb/README.md` with the download command). Verify `pocketbase --version` (or `./pb/pocketbase --version`) runs. **Consult the installed version's docs for hook/migration API names — do not guess from memory.**
**Step 2:** Create migrations in `pb_migrations/` (JS) defining: `collection_units` (`user` relation→users, `unit_slug` text, `copies` number; unique index on user+unit_slug), `wallets` (`user` relation unique, `coins` number), `ally_armies` (`user` relation unique, `army` json, `combat_score` number), `leaderboard_runs` (`user` relation, `mode` select solo|ally, `depth` number, `combat_score` number). Users: ensure a required unique `username` field exists (built-in or added per current PB version). API rules: authenticated users read all `ally_armies`/`leaderboard_runs`; users read/write only their own `collection_units`/`wallets` records **via hooks only** (lock direct writes: create/update rules `null` where hooks own the mutation).
**Step 3:** Create `pb_hooks/gacha.pb.js`:
- `POST /api/gacha/pull` (auth required): read wallet, reject if `coins < 100`, deduct, roll (reimplement `rollTier` + uniform tier pick in the hook — Goja JS, keep it dependency-free; duplicate the integer-percent table with a comment pointing at `src/lib/gacha/config.ts`), upsert collection_units copies+1, return `{unitSlug, copiesBefore, copiesAfter, coins}` — all inside a transaction per current PB hook API.
- `POST /api/gacha/reward` (auth): body `{coins}` int 1..1000, credits wallet (used by battle rewards; dev +100 uses this too).
- `POST /api/gacha/publish-run` (auth): body `{mode, depth, combatScore, army}`; creates `leaderboard_runs` row; if `depth >= 10` upserts `ally_armies`.
- On user create: bootstrap wallet with 0 coins (hook event).
**Step 4:** Smoke test with `pocketbase serve` + curl: create a test user via admin API or CLI, hit pull with no coins (expect 400), reward 100, pull (expect a unit slug), publish-run, verify rows.
**Step 5:** Commit (migrations, hooks, pb/README, gitignore): `feat: pocketbase schema and gacha hooks`

### Task 7: PB client + auth + /login

**Step 1:** `npm install pocketbase`. Create `src/lib/pb.ts`: exports a singleton `pb = new PocketBase(PUBLIC_PB_URL ?? 'http://localhost:8090')` and a runes auth wrapper `src/lib/auth.svelte.ts` (`user`, `login(email, pass)`, `register(email, pass, username)`, `logout()`, restores session from the SDK's localStorage authStore).
**Step 2:** `/login` route: email/password login + register (with username) forms, redirect to `/` on success. Root `+layout.svelte`: if not authed and route ≠ /login, redirect to /login.
**Step 3:** Verify manually with PB running (register, reload persists session, logout). `npm run check` clean.
**Step 4:** Commit: `feat: pocketbase client, auth store, and login screen`

### Task 8: Gacha state store (PB-backed)

Create `src/lib/gacha/state.svelte.ts` — port the shape of `~/projects/gacha/src/lib/game/state.svelte.ts` minus the passive tick (battle-rewards economy):
- `$state`: `coins`, `units: Record<slug, copies>`, `loaded`, `lastPulled`
- `hydrate()`: wallet + full collection_units list for the user
- `pull()`: POST `/api/gacha/pull` via `pb.send`, update local state, return result shaped like the old `PullResult` (unitSlug field)
- `reward(coins)`: POST `/api/gacha/reward`, update coins (used by gauntlet payouts; also the dev +100 button — gate the button with `import.meta.env.DEV`)
- `markPulled` null-then-rAF retrigger as before
No unit tests (glue); `npm run check` clean. Commit: `feat: PB-backed gacha state store`

### Task 9: Collection UI port (grid, cards, ticker overlay)

Port from `~/projects/gacha`: rarity CSS block (append to this repo's global css — find it; warlords uses Tailwind 4 so there's an entry css importing tailwind), `UnitCard.svelte`, `PullOverlay.svelte` → `src/lib/gacha/` components, adapted:
- Art: warlords sprite idle frames via `ui/sprites.ts` (read it; render the same way the gauntlet UI renders a unit portrait) instead of `<img src=/units/*.svg>`
- Keys: `unit.slug`; catalog from `engine/catalog.ts`; grid groups by faction ordered by tier (variable row lengths)
- Reel: keep locked-unit silhouettes (pre-pull ownership rule) and the `{#if}` remount + `openPack` guard patterns from the gacha repo (they fix real bugs — see gacha commits 25bc36a, 165bba3)
`/` route becomes the real hub: header (username, coins, dev +100, Open Pack, nav to /gauntlet and /leaderboards), collection grid, overlay. `npm run check` clean; visual check deferred to Task 14. Commit: `feat: collection hub with pull ticker`

### Task 10: Gauntlet draft gating + no-loss + battle rewards

**Step 1:** Read `src/lib/gauntlet/run.ts` fully, plus the gauntlet route and battle-end flow.
**Step 2:** Changes, with TDD where logic is pure:
- **Draft double-gate:** wherever draft/starting-army candidates are generated, filter to `game.units[slug] > 0` (gacha ownership) ∩ existing tier/hero gating. Pure candidate-filter function + tests (`src/lib/gauntlet/draft.test.ts`): owned+tier passes, unowned fails, tier-too-high fails.
- **No permanent loss:** on battle victory, restore the army to its pre-battle stacks (full counts). Find where casualties currently persist into `RunState` and snapshot/restore instead. Test if the logic is pure; otherwise verify in Task 14.
- **Battle rewards:** on victory award `coins = 20 + 5 × node` (nodes 1-10), `+100` bonus at node 10, `40 + 8 × depth` in endless — constants in `src/lib/gauntlet/economy.ts` with a small test; call `gacha.reward()` (batch at run end if mid-run calls get chatty — implementer's choice, document it).
- **Run state holds `UnitInstance`s** (slug + modifiers) from here on: at run start, build instances from drafted units with `gachaLevelModifier(levelFor(copies).level)` applied; battle setup calls `resolve()`. Keep the change mechanical — the engine consumes resolved stats identical to before when modifiers are empty.
**Step 3:** Full suite green (engine tests untouched), check clean. Commit: `feat: gacha-gated drafting, no-loss battles, battle rewards`

### Task 11: Endless mode

- Node 10 victory → run marked complete; payout + `publish-run` (mode from ally choice, see Task 12; depth 10; combat score = Σ UNIT_COSTS×count via `src/lib/gauntlet/score.ts` with a test) — then the **endless gate** screen: Continue Solo / Continue with Ally / End Run.
- Endless nodes: depth 11+, enemy army scaling `1 + 0.08 × (depth − 10)` applied to enemy stack counts (constant in economy.ts, tunable, tested).
- Defeat or "End Run" in endless → final `publish-run` with final depth.
Suite green, check clean. Commit: `feat: endless mode with depth scaling and run publishing`

### Task 12: Ally summon

- Endless gate "Continue with Ally": picker with three options — Random / Top combat score / Top endless depth — each queries `ally_armies` (+`leaderboard_runs` for depth ranking), shows the ally's username + army preview, choice locks for the run (`RunState.ally`).
- In battle: ally contributes its strongest stacks (by UNIT_COSTS value) up to `ALLY_STACK_CAP = 3`, fielded on the player's side, AI-controlled, restored each battle. Read how the battle sets up enemy AI stacks to mirror the mechanism for an allied AI group. Pure selection function `pickAllyStacks(army, cap)` with tests.
- Run publishes with `mode: 'ally'`.
Suite green, check clean. Commit: `feat: ally summon in endless mode`

### Task 13: Leaderboards

`/leaderboards` route: tabs Solo / Ally; each lists top `leaderboard_runs` by depth (tiebreak combat score) with username, depth, score. Simple PB queries with expand on user. Check clean. Commit: `feat: endless leaderboards`

### Task 14: Golden-path verification

With PB + dev server running and a fresh `pb_data`: Playwright script (throwaway, not committed) driving: register → hub shows empty collection → dev +100 → pull → ticker → collect → grid updates → start gauntlet → draft only owned units → win battle (may need a seeded weak enemy or debug hook; if a battle can't be auto-won deterministically, verify battle start + army restore via state inspection and play one battle manually) → reach coins increase → simulate node-10 completion (seed RunState if needed) → endless gate shows → ally picker lists a second seeded account → leaderboards render. Screenshot key screens; fix what breaks; commit fixes: `fix: polish from golden-path verification`

---

## Done criteria
- `npx vitest run` — engine's original 195 + all new tests green
- `npm run check` — clean
- Task 14 checklist passes with screenshots
