import { describe, it, expect } from 'vitest';
import { CATALOG, unitBySlug, slugify } from '../catalog';

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
      for (const k of [
        'hp', 'attack', 'defense', 'speed', 'initiative',
        'minDamage', 'maxDamage', 'shots', 'range', 'mana',
      ] as const) {
        expect(u.base[k], `${u.slug}.${k}`).toBeTypeOf('number');
      }
    }
  });
});
