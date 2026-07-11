// Battle coin rewards, keyed by gauntlet node. Node 10 pays a run-completion
// bonus; nodes 11+ (endless mode, Task 11) use a steeper curve. Rewards stay
// far below the reward endpoint's 1000-coins-per-call cap, so the route can
// post one reward per battle without batching.

const COMPLETION_BONUS = 100;

export function battleReward(node: number): number {
  if (node >= 11) return 40 + 8 * (node - 10);
  const base = 20 + 5 * node;
  return node === 10 ? base + COMPLETION_BONUS : base;
}
