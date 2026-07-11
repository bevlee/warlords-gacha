import { describe, it, expect } from 'vitest';
import { CATALOG } from '$lib/engine/catalog';
import {
  TIER_ODDS,
  LEVELS,
  LEVEL_THRESHOLDS,
  PACK_COST,
  levelFor,
  rollTier,
  rollUnit,
  gachaLevelModifier,
} from './config';

describe('odds', () => {
  it('sum to 1', () => {
    expect(TIER_ODDS.reduce((a, b) => a + b, 0)).toBeCloseTo(1);
  });

  it('levels and thresholds are index-aligned', () => {
    expect(LEVEL_THRESHOLDS).toHaveLength(LEVELS.length);
  });
});

describe('levelFor', () => {
  it('0 copies = unowned', () => {
    const l = levelFor(0);
    expect(l.level).toBeNull();
    expect(l.nextThreshold).toBe(1);
    expect(l.progress).toBe(0);
  });

  it('threshold boundaries', () => {
    expect(levelFor(1).level).toBe('bronze');
    expect(levelFor(2).level).toBe('bronze');
    expect(levelFor(3).level).toBe('silver');
    expect(levelFor(6).level).toBe('gold');
    expect(levelFor(12).level).toBe('emerald');
    expect(levelFor(24).level).toBe('ruby');
    expect(levelFor(48).level).toBe('platinum');
    expect(levelFor(96).level).toBe('diamond');
    expect(levelFor(500).level).toBe('diamond');
  });

  it('progress toward next level', () => {
    expect(levelFor(2).progress).toBeCloseTo(0.5);
    expect(levelFor(2).nextThreshold).toBe(3);
    expect(levelFor(96).nextThreshold).toBeNull();
    expect(levelFor(96).progress).toBe(1);
  });
});

describe('rollTier', () => {
  it('maps random value to tier via cumulative whole-percent odds', () => {
    expect(rollTier(() => 0.0)).toBe(1);
    expect(rollTier(() => 0.33)).toBe(1);
    expect(rollTier(() => 0.34)).toBe(2);
    expect(rollTier(() => 0.58)).toBe(2);
    expect(rollTier(() => 0.59)).toBe(3);
    expect(rollTier(() => 0.98)).toBe(6);
    expect(rollTier(() => 0.995)).toBe(7);
    expect(rollTier(() => 0.999999)).toBe(7);
  });
});

describe('rollUnit', () => {
  it('picks uniformly within the rolled tier bucket', () => {
    // first rand → tier, second rand → index within tier bucket
    const seq = [0.999, 0.0][Symbol.iterator]();
    const unit = rollUnit(() => seq.next().value!);
    const t7 = CATALOG.filter((u) => u.tier === 7);
    expect(unit.slug).toBe(t7[0].slug);
    expect(unit.tier).toBe(7);
  });

  it('last index of the bucket is reachable', () => {
    const seq = [0.999, 0.999999][Symbol.iterator]();
    const unit = rollUnit(() => seq.next().value!);
    const t7 = CATALOG.filter((u) => u.tier === 7);
    expect(unit.slug).toBe(t7[t7.length - 1].slug);
  });
});

describe('gachaLevelModifier', () => {
  it('bronze and unowned grant nothing', () => {
    expect(gachaLevelModifier('bronze')).toBeNull();
    expect(gachaLevelModifier(null)).toBeNull();
  });

  it('scales +2% per level above bronze on hp/attack/defense', () => {
    const silver = gachaLevelModifier('silver')!;
    expect(silver.source).toBe('gacha:silver');
    expect(silver.pct).toEqual({ hp: 0.02, attack: 0.02, defense: 0.02 });
    const diamond = gachaLevelModifier('diamond')!;
    expect(diamond.pct?.hp).toBeCloseTo(0.12);
  });
});
