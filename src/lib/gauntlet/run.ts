import type { ArmySlot, FactionClass, Hero, UnitDef } from '../engine/types';
import { FACTION_UNITS, FACTION_INFO } from '../engine/factions';
import { UNIT_COSTS } from '../engine/recruit';
import { updateFactionSkills } from '../engine/factionSkills';
import { mulberry32, type Rng } from '../engine/rng';
import { slugify, unitBySlug } from '../engine/catalog';
import { resolve, type UnitInstance } from '../engine/resolve';
import { gachaLevelModifier, levelFor } from '../gacha/config';
import { gateCandidates } from './draft';

export const RUN_LENGTH = 10;
export const BOSS_NODES = new Set([3, 7, 10]);
const MAX_STACKS = 6;

export interface UnitCard {
  unitName: string;
  count: number;
}

/** Army slot plus its run-scoped instance (slug + modifiers). The only
 *  modifier source today is the gacha level, frozen from the collection
 *  snapshot at run start. */
export interface RunSlot extends ArmySlot {
  instance: UnitInstance;
}

export interface RunState {
  version: 2;
  seed: number;
  faction: FactionClass;
  encounterIndex: number; // next battle, 1..10
  hero: Hero;
  army: RunSlot[];
  /** Gacha collection snapshot (slug → copies) taken at run start; gates
   *  drafting and sets each instance's gacha-level modifier. */
  owned: Record<string, number>;
  pendingDraft: UnitCard[] | null;
  status: 'map' | 'draft' | 'won' | 'lost';
  battlesWon: number;
  startedAt: number;
}

export function actOf(n: number): 1 | 2 | 3 {
  return n <= 3 ? 1 : n <= 7 ? 2 : 3;
}

/** Hash-mixes a run seed with a salt into a well-distributed 32-bit seed.
 *  Unlike a linear combination (seed*a + salt*b), this doesn't collide for
 *  seed/salt pairs a fixed offset apart — important since seeds are commonly
 *  Date.now()-derived and close together across runs. */
export function mixSeed(seed: number, salt: number): number {
  let h = (seed | 0) ^ salt;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = h ^ (h >>> 16);
  return h;
}

/** Power budget: 90 × 1.32^(n−1), bosses (3/7/10) pay a 10% premium. */
export function encounterBudget(n: number): number {
  const base = 90 * 1.32 ** (n - 1);
  return Math.round(BOSS_NODES.has(n) ? base * 1.1 : base);
}

/** Run-scoped instance for a unit: gacha-level modifier from the run's
 *  collection snapshot (empty modifier list at bronze/unowned). */
export function makeInstance(unit: UnitDef, owned: Record<string, number>): UnitInstance {
  const slug = slugify(unit.name);
  const mod = gachaLevelModifier(levelFor(owned[slug] ?? 0).level);
  return { slug, modifiers: mod ? [mod] : [] };
}

export function newRun(
  faction: FactionClass,
  owned: Record<string, number>,
  seed = Date.now()
): RunState {
  const roster = FACTION_UNITS[faction];
  // Gacha gate: only owned units may start the run. A collection with no
  // units of this faction still gets the classic T1+T2 loaner start so a
  // run is always startable.
  const gated = gateCandidates(roster, owned);
  const pool = gated.length > 0 ? gated : roster;
  const byTier = [...pool].sort((a, b) => a.tier - b.tier);
  const t1 = pool.find(u => u.tier === 1) ?? byTier[0];
  const t2 = pool.find(u => u.tier === 2) ?? byTier.find(u => u.name !== t1.name) ?? t1;
  const slot = (unit: UnitDef, budget: number): RunSlot => ({
    unit,
    count: Math.max(1, Math.round(budget / UNIT_COSTS[unit.name])),
    instance: makeInstance(unit, owned),
  });
  const army: RunSlot[] =
    t1.name === t2.name ? [slot(t1, 90)] : [slot(t1, 55), slot(t2, 35)];
  const hero: Hero = updateFactionSkills({
    class: faction,
    level: 1,
    xp: 0,
    attack: 2,
    defense: 1,
    statPoints: 0,
    factionSkills: [],
  });
  return {
    version: 2,
    seed,
    faction,
    encounterIndex: 1,
    hero,
    army,
    owned,
    pendingDraft: null,
    status: 'map',
    battlesWon: 0,
    startedAt: Date.now(),
  };
}

const FACTIONS = Object.keys(FACTION_INFO) as FactionClass[];

function buildArmy(roster: typeof FACTION_UNITS.barbarian, budget: number, rng: Rng): ArmySlot[] {
  const slots: ArmySlot[] = [];
  let remaining = budget;
  const picks = 3 + Math.floor(rng() * 3);
  for (let i = 0; i < picks; i++) {
    const affordable = roster.filter(u => UNIT_COSTS[u.name] <= remaining);
    if (affordable.length === 0) break;
    const unit = affordable[Math.floor(rng() * affordable.length)];
    const cost = UNIT_COSTS[unit.name];
    const share = remaining * (i === picks - 1 ? 0.95 : 0.3 + rng() * 0.4);
    const count = Math.max(1, Math.min(Math.floor(remaining / cost), Math.round(share / cost)));
    const existing = slots.find(s => s.unit.name === unit.name);
    if (existing) existing.count += count;
    else slots.push({ unit, count });
    remaining -= count * cost;
  }
  // Top up with the roster's cheapest unit.
  const cheapest = [...roster].sort((a, b) => UNIT_COSTS[a.name] - UNIT_COSTS[b.name])[0];
  const cheapCost = UNIT_COSTS[cheapest.name];
  if (remaining >= cheapCost && (slots.length < MAX_STACKS || slots.some(s => s.unit.name === cheapest.name))) {
    const count = Math.floor(remaining / cheapCost);
    const existing = slots.find(s => s.unit.name === cheapest.name);
    if (existing) existing.count += count;
    else slots.push({ unit: cheapest, count });
  }
  return slots;
}

export interface GauntletEncounter {
  faction: FactionClass;
  budget: number;
  army: ArmySlot[];
  isBoss: boolean;
}

/** Deterministic enemy for the run's current node. */
export function generateGauntletEnemy(run: RunState): GauntletEncounter {
  const n = run.encounterIndex;
  const rng = mulberry32(mixSeed(run.seed, n * 977));
  const faction = FACTIONS[Math.floor(rng() * FACTIONS.length)];
  const act = actOf(n);
  const maxTier = act === 1 ? 3 : act === 2 ? 5 : 7;
  const roster = FACTION_UNITS[faction].filter(u => u.tier <= maxTier);
  const budget = encounterBudget(n);
  return { faction, budget, army: buildArmy(roster, budget, rng), isBoss: BOSS_NODES.has(n) };
}

const ACT_CARD_POWER: Record<1 | 2 | 3, number> = { 1: 60, 2: 110, 3: 170 };
const ACT_TIERS: Record<1 | 2 | 3, [number, number]> = { 1: [1, 3], 2: [2, 5], 3: [4, 7] };

/** Up to three distinct own-faction unit cards, tier-gated by act and
 *  double-gated by gacha ownership. May be empty for thin collections. */
export function draftOptions(run: RunState): UnitCard[] {
  const act = actOf(run.encounterIndex);
  const [lo, hi] = ACT_TIERS[act];
  const power = ACT_CARD_POWER[act];
  const atCap = run.army.length >= MAX_STACKS;
  const ownNames = new Set(run.army.map(s => s.unit.name));

  let pool = gateCandidates(
    FACTION_UNITS[run.faction].filter(u => u.tier >= lo && u.tier <= hi),
    run.owned
  );
  if (atCap) {
    const owned = pool.filter(u => ownNames.has(u.name));
    if (owned.length >= 1) pool = owned;
  }

  const rng = mulberry32(mixSeed(run.seed, run.encounterIndex * 449 + run.battlesWon));
  const cards: UnitCard[] = [];
  const used = new Set<string>();
  for (let guard = 0; cards.length < Math.min(3, pool.length) && guard < 50; guard++) {
    const unit = pool[Math.floor(rng() * pool.length)];
    if (used.has(unit.name)) continue;
    used.add(unit.name);
    cards.push({ unitName: unit.name, count: Math.max(1, Math.round(power / UNIT_COSTS[unit.name])) });
  }
  return cards;
}

export function applyPick(run: RunState, card: UnitCard): RunState {
  const unit = FACTION_UNITS[run.faction].find(u => u.name === card.unitName)!;
  const existing = run.army.find(s => s.unit.name === card.unitName);
  const army = existing
    ? run.army.map(s => (s.unit.name === card.unitName ? { ...s, count: s.count + card.count } : s))
    : [...run.army, { unit, count: card.count, instance: makeInstance(unit, run.owned) }];
  return { ...run, army, pendingDraft: null, status: 'map' };
}

/** Resolve each slot's instance into the concrete UnitDef the battle engine
 *  consumes. With an empty modifier list this is the identity — resolved
 *  stats equal the base definition. Enemy armies never pass through here. */
export function toBattleArmy(army: RunSlot[]): ArmySlot[] {
  return army.map(({ unit, count, instance }) => {
    const def = unitBySlug(instance.slug);
    if (!def || instance.modifiers.length === 0) return { unit, count };
    const { stats, abilities } = resolve(def, instance.modifiers);
    const { hp, attack, defense, speed, initiative, minDamage, maxDamage, shots, range } = stats;
    return {
      unit: { ...unit, hp, attack, defense, speed, initiative, minDamage, maxDamage, shots, range, abilities },
      count,
    };
  });
}

/** Apply a battle result. Victories are lossless: the army keeps its exact
 *  pre-battle stacks (`run` is untouched during the fight, so `run.army` IS
 *  the pre-battle snapshot). A defeat ends the run. */
export function recordBattle(run: RunState, won: boolean): RunState {
  if (!won) return { ...run, status: 'lost' };

  const hero = updateFactionSkills({
    ...run.hero,
    level: run.hero.level + 1,
    attack: run.hero.attack + 1,
    defense: run.hero.defense + 1,
  });
  const next: RunState = {
    ...run,
    hero,
    battlesWon: run.battlesWon + 1,
    encounterIndex: run.encounterIndex + 1,
    pendingDraft: null,
    status: 'map',
  };
  if (run.encounterIndex >= RUN_LENGTH) return { ...next, status: 'won' };
  const cards = draftOptions(next);
  // Thin collections can gate the draft pool down to nothing — skip the draft.
  return cards.length > 0 ? { ...next, status: 'draft', pendingDraft: cards } : next;
}
