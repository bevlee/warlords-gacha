// Gacha-ownership gate for gauntlet drafting: on top of the run's tier/act
// gating, only units the player owns copies of may be offered. Pure — the
// owned snapshot is taken from the gacha store at run start and passed in.

import type { UnitDef } from '../engine/types';
import { slugify } from '../engine/catalog';

export function gateCandidates<T extends UnitDef>(
  candidates: T[],
  owned: Record<string, number>
): T[] {
  return candidates.filter((u) => (owned[slugify(u.name)] ?? 0) > 0);
}
