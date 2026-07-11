import { describe, it, expect } from 'vitest';
import { gateCandidates } from '../draft';
import { FACTION_UNITS } from '../../engine/factions';
import { slugify } from '../../engine/catalog';

describe('gateCandidates', () => {
  const roster = FACTION_UNITS.barbarian;

  it('passes units the player owns copies of', () => {
    const owned = Object.fromEntries(roster.map((u) => [slugify(u.name), 2]));
    expect(gateCandidates(roster, owned)).toEqual(roster);
  });

  it('filters out unowned units, including explicit zero-copy entries', () => {
    const kept = roster[0];
    const zeroed = roster[1];
    const owned = { [slugify(kept.name)]: 1, [slugify(zeroed.name)]: 0 };

    const gated = gateCandidates(roster, owned);

    expect(gated).toEqual([kept]);
  });

  it('yields empty for an empty collection', () => {
    expect(gateCandidates(roster, {})).toEqual([]);
  });

  it('matches ownership by slug even for multi-word unit names', () => {
    const multiWord = Object.values(FACTION_UNITS)
      .flat()
      .find((u) => u.name.includes(' '))!;
    expect(multiWord).toBeTruthy();
    const gated = gateCandidates([multiWord], { [slugify(multiWord.name)]: 1 });
    expect(gated).toEqual([multiWord]);
  });
});
