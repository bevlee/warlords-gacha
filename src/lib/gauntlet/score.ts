// Combat score: army worth in recruit-cost terms. UNIT_COSTS already encodes
// the balance curve, so it doubles as the power formula for leaderboards.

import type { ArmySlot } from '../engine/types';
import { UNIT_COSTS } from '../engine/recruit';

export function armyScore(army: ArmySlot[]): number {
  return army.reduce((sum, s) => sum + (UNIT_COSTS[s.unit.name] ?? 0) * s.count, 0);
}
