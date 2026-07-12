import { describe, it, expect } from 'vitest';
import { pickAllyStacks, ALLY_STACK_CAP } from '../ally';
import { UNIT_COSTS } from '../../engine/recruit';

describe('pickAllyStacks', () => {
  it('takes the strongest stacks by cost × count, capped', () => {
    const army = [
      { slug: 'goblin', count: 100 },
      { slug: 'behemoth', count: 2 },
      { slug: 'orc', count: 5 },
      { slug: 'cyclops', count: 4 },
      { slug: 'ogre', count: 1 },
    ];
    const picked = pickAllyStacks(army);
    expect(picked).toHaveLength(ALLY_STACK_CAP);
    const values = picked.map((s) => (UNIT_COSTS[s.unit.name] ?? 0) * s.count);
    expect([...values].sort((a, b) => b - a)).toEqual(values);
    const all = army.map((s) => ({ slug: s.slug, v: 0 }));
    expect(all.length).toBeGreaterThan(picked.length);
  });

  it('skips unknown slugs and handles short armies', () => {
    const picked = pickAllyStacks([
      { slug: 'not-a-unit', count: 99 },
      { slug: 'wolf-rider', count: 3 },
    ]);
    expect(picked).toHaveLength(1);
    expect(picked[0].unit.name).toBe('Wolf Rider');
  });

  it('empty army yields empty', () => {
    expect(pickAllyStacks([])).toEqual([]);
  });
});
