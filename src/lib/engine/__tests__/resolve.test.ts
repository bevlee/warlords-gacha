import { describe, it, expect } from 'vitest';
import { resolve, type UnitModifier } from '../resolve';
import { unitBySlug } from '../catalog';

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
      { source: 'b', pct: { hp: 0.1 } },
    ]);
    expect(r.stats.hp).toBe(Math.round(goblin.base.hp * 1.2));
  });

  it('leaves untouched stats at base values', () => {
    const r = resolve(goblin, [{ source: 'a', flat: { attack: 3 } }]);
    expect(r.stats.hp).toBe(goblin.base.hp);
    expect(r.stats.mana).toBe(goblin.base.mana);
  });

  it('unions granted abilities without duplicates', () => {
    const innate = goblin.abilities[0] ?? 'regeneration';
    const r = resolve(goblin, [{ source: 'a', grants: ['regeneration', innate] }]);
    expect(new Set(r.abilities).size).toBe(r.abilities.length);
    expect(r.abilities).toContain('regeneration');
  });
});
