// Ally summon: another player's published army fights on your side in endless
// mode, AI-controlled. The ally contributes its strongest stacks up to a cap
// so the board stays readable.

import type { ArmySlot } from '../engine/types';
import { unitBySlug } from '../engine/catalog';
import { UNIT_COSTS } from '../engine/recruit';

export const ALLY_STACK_CAP = 3;

export interface AllyData {
  username: string;
  army: { slug: string; count: number }[];
}

export function pickAllyStacks(
  army: { slug: string; count: number }[],
  cap = ALLY_STACK_CAP
): ArmySlot[] {
  return army
    .map((s) => ({ slot: s, unit: unitBySlug(s.slug) }))
    .filter((x): x is { slot: { slug: string; count: number }; unit: NonNullable<ReturnType<typeof unitBySlug>> } => !!x.unit)
    .map(({ slot, unit }) => ({ unit, count: slot.count }))
    .sort((a, b) => (UNIT_COSTS[b.unit.name] ?? 0) * b.count - (UNIT_COSTS[a.unit.name] ?? 0) * a.count)
    .slice(0, cap);
}
