// Client gacha state, backed by PocketBase. No passive income — coins come
// from battle rewards (and the dev +100 button). All mutations go through the
// pb_hooks endpoints; this store only reads collections directly.

import { pb } from '$lib/pb';

export interface PullResult {
  unitSlug: string;
  copiesBefore: number;
  copiesAfter: number;
  coins: number;
}

class GachaState {
  coins = $state(0);
  units = $state<Record<string, number>>({});
  loaded = $state(false);
  lastPulled = $state<string | null>(null);
  private userId = pb.authStore.record?.id ?? null;

  constructor() {
    // Account switches without a reload must not leak the previous user's
    // coins/collection into the new session.
    pb.authStore.onChange(() => {
      const id = pb.authStore.record?.id ?? null;
      if (id !== this.userId) {
        this.userId = id;
        this.coins = 0;
        this.units = {};
        this.loaded = false;
        this.lastPulled = null;
      }
    });
  }

  async hydrate() {
    if (!pb.authStore.record) return;
    const userId = pb.authStore.record.id;
    const [wallets, owned] = await Promise.all([
      pb.collection('wallets').getList(1, 1, { filter: `user = "${userId}"` }),
      pb.collection('collection_units').getFullList({ filter: `user = "${userId}"` }),
    ]);
    this.coins = wallets.items[0]?.coins ?? 0;
    this.units = Object.fromEntries(owned.map((r) => [r.unit_slug as string, r.copies as number]));
    this.loaded = true;
  }

  async pull(): Promise<PullResult | null> {
    try {
      const result = await pb.send<PullResult>('/api/gacha/pull', { method: 'POST' });
      this.coins = result.coins;
      this.units[result.unitSlug] = result.copiesAfter;
      return result;
    } catch {
      return null;
    }
  }

  async reward(coins: number) {
    const res = await pb.send<{ coins: number }>('/api/gacha/reward', {
      method: 'POST',
      body: { coins },
    });
    this.coins = res.coins;
  }

  /** Retriggers the just-pulled CSS animation even for repeat pulls of the same unit. */
  markPulled(unitSlug: string) {
    this.lastPulled = null;
    requestAnimationFrame(() => (this.lastPulled = unitSlug));
  }
}

export const gacha = new GachaState();
