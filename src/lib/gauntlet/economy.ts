// Battle coin rewards, keyed by gauntlet node. Node 10 pays a run-completion
// bonus; nodes 11+ (endless mode) use a steeper curve, clamped to the reward
// endpoint's 1000-coins-per-call cap (the curve would cross it at depth 131).

const COMPLETION_BONUS = 100;
const REWARD_CAP = 1000;

export function battleReward(node: number): number {
  if (node >= 11) return Math.min(REWARD_CAP, 40 + 8 * (node - 10));
  const base = 20 + 5 * node;
  return node === 10 ? base + COMPLETION_BONUS : base;
}
