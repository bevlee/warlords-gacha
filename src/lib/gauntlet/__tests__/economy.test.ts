import { describe, it, expect } from 'vitest';
import { battleReward } from '../economy';

describe('battleReward', () => {
  it('pays 20 + 5·node for nodes 1–9', () => {
    expect(battleReward(1)).toBe(25);
    expect(battleReward(9)).toBe(65);
  });

  it('adds the +100 completion bonus on node 10', () => {
    expect(battleReward(10)).toBe(170);
  });

  it('uses the endless curve 40 + 8·(node − 10) from node 11', () => {
    expect(battleReward(11)).toBe(48);
    expect(battleReward(15)).toBe(80);
  });
});
