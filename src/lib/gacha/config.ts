// Gacha rules: pull odds, copy-derived levels, and the level→buff bridge.
// Ported from the standalone gacha game, re-keyed to catalog slugs.

import { CATALOG, type CatalogUnit } from '$lib/engine/catalog';
import type { UnitModifier } from '$lib/engine/resolve';

export const PACK_COST = 100;

/** T1..T7 pull odds as whole percents; must sum to 100. */
const TIER_PERCENTS = [34, 25, 18, 12, 7, 3, 1] as const;
export const TIER_ODDS: readonly number[] = TIER_PERCENTS.map((p) => p / 100);

export const LEVELS = [
  'bronze',
  'silver',
  'gold',
  'emerald',
  'ruby',
  'platinum',
  'diamond',
] as const;
export type Level = (typeof LEVELS)[number];

/** Total copies needed to reach each level, index-aligned with LEVELS. */
export const LEVEL_THRESHOLDS = [1, 3, 6, 12, 24, 48, 96];

export interface LevelInfo {
  level: Level | null;
  nextThreshold: number | null;
  progress: number;
}

export function levelFor(copies: number): LevelInfo {
  if (copies <= 0) return { level: null, nextThreshold: LEVEL_THRESHOLDS[0], progress: 0 };
  let idx = -1;
  for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) {
    if (copies >= LEVEL_THRESHOLDS[i]) idx = i;
  }
  if (idx === LEVEL_THRESHOLDS.length - 1) {
    return { level: LEVELS[idx], nextThreshold: null, progress: 1 };
  }
  const cur = LEVEL_THRESHOLDS[idx];
  const next = LEVEL_THRESHOLDS[idx + 1];
  return { level: LEVELS[idx], nextThreshold: next, progress: (copies - cur) / (next - cur) };
}

export function rollTier(rand: () => number = Math.random): number {
  // integer percents avoid float drift at cumulative boundaries (0.34+0.25 > 0.59)
  const r = rand() * 100;
  let cum = 0;
  for (let i = 0; i < TIER_PERCENTS.length; i++) {
    cum += TIER_PERCENTS[i];
    if (r < cum) return i + 1;
  }
  return TIER_PERCENTS.length; // unreachable: percents sum to 100 and rand() < 1
}

/** Roll a tier by the odds table, then pick uniformly among all units of that tier. */
export function rollUnit(rand: () => number = Math.random): CatalogUnit {
  const tier = rollTier(rand);
  const bucket = CATALOG.filter((u) => u.tier === tier);
  return bucket[Math.floor(rand() * bucket.length)];
}

/** Percent buff per level above bronze, applied to hp/attack/defense. */
const PCT_PER_LEVEL = 0.02;

export function gachaLevelModifier(level: Level | null): UnitModifier | null {
  if (!level) return null;
  const steps = LEVELS.indexOf(level);
  if (steps <= 0) return null;
  const p = PCT_PER_LEVEL * steps;
  return { source: `gacha:${level}`, pct: { hp: p, attack: p, defense: p } };
}
