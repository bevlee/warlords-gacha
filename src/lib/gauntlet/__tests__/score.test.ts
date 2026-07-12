import { describe, it, expect } from 'vitest';
import { armyScore } from '../score';
import { UNIT_COSTS } from '../../engine/recruit';
import { FACTION_UNITS } from '../../engine/factions';

describe('armyScore', () => {
  it('sums recruit cost × stack count', () => {
    const [a, b] = FACTION_UNITS.knight;
    const score = armyScore([
      { unit: a, count: 10 },
      { unit: b, count: 3 },
    ]);
    expect(score).toBe(UNIT_COSTS[a.name] * 10 + UNIT_COSTS[b.name] * 3);
  });

  it('empty army scores 0', () => {
    expect(armyScore([])).toBe(0);
  });
});
