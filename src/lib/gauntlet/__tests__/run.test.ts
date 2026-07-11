import { describe, it, expect } from 'vitest';
import {
  newRun,
  encounterBudget,
  actOf,
  generateGauntletEnemy,
  draftOptions,
  applyPick,
  recordBattle,
  makeInstance,
  toBattleArmy,
  mixSeed,
} from '../run';
import { armyCost, UNIT_COSTS } from '../../engine/recruit';
import { FACTION_UNITS } from '../../engine/factions';
import { CATALOG, slugify, unitBySlug } from '../../engine/catalog';

/** One copy of everything = bronze across the board = no stat modifiers. */
const ALL_OWNED: Record<string, number> = Object.fromEntries(CATALOG.map(u => [u.slug, 1]));

describe('gauntlet run', () => {
  it('newRun starts a level-1 faction hero with a ~90-power T1/T2 army', () => {
    const run = newRun('barbarian', ALL_OWNED, 42);

    expect(run.status).toBe('map');
    expect(run.encounterIndex).toBe(1);
    expect(run.hero.level).toBe(1);
    expect(run.hero.class).toBe('barbarian');
    for (const slot of run.army) expect(slot.unit.tier).toBeLessThanOrEqual(2);
    const power = armyCost(run.army);
    expect(power).toBeGreaterThanOrEqual(70);
    expect(power).toBeLessThanOrEqual(110);
  });

  it('newRun gates the starting army by gacha ownership', () => {
    const roster = FACTION_UNITS.barbarian;
    const onlyUnit = roster.find(u => u.tier === 3)!;
    const run = newRun('barbarian', { [slugify(onlyUnit.name)]: 1 }, 42);

    expect(run.army).toHaveLength(1);
    expect(run.army[0].unit.name).toBe(onlyUnit.name);
  });

  it('newRun falls back to the loaner T1/T2 start for an empty collection', () => {
    const run = newRun('barbarian', {}, 42);

    expect(run.army.length).toBeGreaterThan(0);
    for (const slot of run.army) expect(slot.unit.tier).toBeLessThanOrEqual(2);
  });

  it('newRun snapshots ownership and stamps each slot with a UnitInstance', () => {
    const run = newRun('knight', ALL_OWNED, 11);

    expect(run.owned).toBe(ALL_OWNED);
    for (const slot of run.army) {
      expect(slot.instance.slug).toBe(slugify(slot.unit.name));
      expect(slot.instance.modifiers).toEqual([]); // 1 copy = bronze = no buff
    }
  });

  it('encounter budgets follow the design curve with a boss premium on 3/7/10', () => {
    // The design table's exact numbers drift from its own formula by rounding;
    // hold the curve to within 2% of the published values.
    expect(encounterBudget(1)).toBe(90);
    expect(encounterBudget(2)).toBe(119);
    for (const [n, v] of [[3, 172], [7, 518], [10, 1195]] as const) {
      expect(Math.abs(encounterBudget(n) - v) / v).toBeLessThanOrEqual(0.02);
    }
  });

  it('acts split 1–3 / 4–7 / 8–10', () => {
    expect(actOf(1)).toBe(1);
    expect(actOf(3)).toBe(1);
    expect(actOf(4)).toBe(2);
    expect(actOf(7)).toBe(2);
    expect(actOf(8)).toBe(3);
  });

  it('mixSeed does not collide for seed/node pairs a linear seed*31+n*977 mix would collapse', () => {
    // The old formula seed*31 + n*977 maps (seed, n) and (seed+977, n-31) to
    // the same combined value, so nearby run seeds could draw identical
    // enemies at different nodes. A hash-based mix must not repeat this.
    const seedA = 1_753_000_000_000;
    const nA = 5;
    const seedB = seedA + 977;
    const nB = nA - 31; // deliberately out of the normal 1..10 range, but the
    // mixing function itself must still not collide for any integer inputs.

    expect(mixSeed(seedA, nA)).not.toBe(mixSeed(seedB, nB));
  });

  it('enemy armies are deterministic per seed and spend most of the budget', () => {
    const run = newRun('barbarian', ALL_OWNED, 7);
    const a = generateGauntletEnemy(run);
    const b = generateGauntletEnemy(run);

    expect(a.army.map(s => `${s.unit.name}x${s.count}`)).toEqual(
      b.army.map(s => `${s.unit.name}x${s.count}`)
    );
    const cost = armyCost(a.army);
    expect(cost).toBeLessThanOrEqual(encounterBudget(1));
    expect(cost).toBeGreaterThanOrEqual(encounterBudget(1) * 0.6);
    expect(a.army.length).toBeGreaterThan(0);
  });

  it('draftOptions offers 3 distinct own-faction unit cards, tier-gated by act', () => {
    const run = { ...newRun('knight', ALL_OWNED, 5), encounterIndex: 2 }; // act I
    const cards = draftOptions(run);

    expect(cards).toHaveLength(3);
    const names = cards.map(c => c.unitName);
    expect(new Set(names).size).toBe(3);
    for (const c of cards) {
      const unit = FACTION_UNITS.knight.find(u => u.name === c.unitName)!;
      expect(unit).toBeTruthy();
      expect(unit.tier).toBeLessThanOrEqual(3); // act I: T1–T3
      expect(c.count).toBe(Math.max(1, Math.round(60 / UNIT_COSTS[c.unitName])));
    }
  });

  it('draftOptions only offers gacha-owned units and yields none for empty collections', () => {
    const t2 = FACTION_UNITS.knight.find(u => u.tier === 2)!;
    const owned = { [slugify(t2.name)]: 1 };
    const run = { ...newRun('knight', ALL_OWNED, 5), owned, encounterIndex: 2 };

    const cards = draftOptions(run);
    expect(cards).toHaveLength(1);
    expect(cards[0].unitName).toBe(t2.name);

    expect(draftOptions({ ...run, owned: {} })).toHaveLength(0);
  });

  it('applyPick stacks duplicate unit types', () => {
    let run = newRun('barbarian', ALL_OWNED, 3);
    const existing = run.army[0];
    run = { ...run, pendingDraft: [{ unitName: existing.unit.name, count: 10 }], status: 'draft' };

    const next = applyPick(run, run.pendingDraft![0]);

    expect(next.status).toBe('map');
    expect(next.pendingDraft).toBeNull();
    const stack = next.army.find(s => s.unit.name === existing.unit.name)!;
    expect(stack.count).toBe(existing.count + 10);
  });

  it('applyPick stamps newly drafted stacks with a UnitInstance', () => {
    const run = { ...newRun('barbarian', ALL_OWNED, 3), encounterIndex: 2 };
    const card = draftOptions(run).find(
      c => !run.army.some(s => s.unit.name === c.unitName)
    )!;

    const next = applyPick(run, card);
    const stack = next.army.find(s => s.unit.name === card.unitName)!;

    expect(stack.instance.slug).toBe(slugify(card.unitName));
  });

  it('recordBattle: win levels the hero, restores the pre-battle army, and queues a draft', () => {
    const run = newRun('barbarian', ALL_OWNED, 9);
    const preBattleArmy = structuredClone(run.army);

    const next = recordBattle(run, true);

    expect(next.battlesWon).toBe(1);
    expect(next.hero.level).toBe(2);
    expect(next.encounterIndex).toBe(2);
    expect(next.army).toEqual(preBattleArmy); // no permanent losses on victory
    expect(next.status).toBe('draft');
    expect(next.pendingDraft).toHaveLength(3);
  });

  it('recordBattle: winning encounter 10 ends the run; losing ends it anywhere', () => {
    const run = { ...newRun('barbarian', ALL_OWNED, 9), encounterIndex: 10 };
    expect(recordBattle(run, true).status).toBe('won');
    expect(recordBattle(newRun('barbarian', ALL_OWNED, 9), false).status).toBe('lost');
  });

  it('recordBattle: skips the draft when the gated pool is empty', () => {
    // Owns only a T7 unit: the node-2 draft (act I, tiers 1–3) gates to nothing.
    const t7 = FACTION_UNITS.barbarian.find(u => u.tier === 7)!;
    const run = newRun('barbarian', { [slugify(t7.name)]: 1 }, 9);

    const next = recordBattle(run, true);

    expect(next.status).toBe('map');
    expect(next.pendingDraft).toBeNull();
  });

  it('makeInstance applies the gacha-level modifier from the owned snapshot', () => {
    const unit = FACTION_UNITS.barbarian[0];
    const slug = slugify(unit.name);

    expect(makeInstance(unit, { [slug]: 1 }).modifiers).toEqual([]); // bronze
    const silver = makeInstance(unit, { [slug]: 3 });
    expect(silver.modifiers).toHaveLength(1);
    expect(silver.modifiers[0].source).toBe('gacha:silver');
    expect(silver.modifiers[0].pct).toEqual({ hp: 0.02, attack: 0.02, defense: 0.02 });
  });

  it('toBattleArmy is the identity for modifier-free instances', () => {
    const run = newRun('barbarian', ALL_OWNED, 13);
    const battleArmy = toBattleArmy(run.army);

    expect(battleArmy).toEqual(run.army.map(({ unit, count }) => ({ unit, count })));
  });

  it('toBattleArmy resolves gacha-level buffs into the battle stats', () => {
    const unit = FACTION_UNITS.barbarian.find(u => u.tier === 1)!;
    const slug = slugify(unit.name);
    const base = unitBySlug(slug)!.base;
    const army = [{ unit, count: 5, instance: makeInstance(unit, { [slug]: 3 }) }]; // silver: +2%

    const [slot] = toBattleArmy(army);

    expect(slot.count).toBe(5);
    expect(slot.unit.hp).toBe(Math.round(base.hp * 1.02));
    expect(slot.unit.attack).toBe(Math.round(base.attack * 1.02));
    expect(slot.unit.defense).toBe(Math.round(base.defense * 1.02));
    expect(slot.unit.speed).toBe(base.speed); // untouched stats stay base
    expect(slot.unit.minDamage).toBe(base.minDamage);
  });
});
