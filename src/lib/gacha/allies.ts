// Ally lookup against PocketBase: who can you summon at the endless gate.

import { pb } from '$lib/pb';

export interface AllyOption {
  userId: string;
  username: string;
  army: { slug: string; count: number }[];
  combatScore: number;
}

type AllyRecord = {
  user: string;
  army: { slug: string; count: number }[];
  combat_score: number;
  expand?: { user?: { username?: string } };
};

function toOption(r: AllyRecord): AllyOption {
  return {
    userId: r.user,
    username: r.expand?.user?.username ?? 'unknown',
    army: r.army ?? [],
    combatScore: r.combat_score ?? 0,
  };
}

const notSelf = () => `user != "${pb.authStore.record?.id ?? ''}"`;

export async function fetchRandomAlly(): Promise<AllyOption | null> {
  const page = await pb.collection('ally_armies').getList<AllyRecord>(1, 200, {
    filter: notSelf(),
    expand: 'user',
  });
  if (page.items.length === 0) return null;
  return toOption(page.items[Math.floor(Math.random() * page.items.length)]);
}

export async function fetchTopByScore(): Promise<AllyOption | null> {
  const page = await pb.collection('ally_armies').getList<AllyRecord>(1, 1, {
    filter: notSelf(),
    sort: '-combat_score',
    expand: 'user',
  });
  return page.items[0] ? toOption(page.items[0]) : null;
}

export async function fetchTopByDepth(): Promise<AllyOption | null> {
  // deepest runs first; take the first runner who has published an ally army
  const runs = await pb.collection('leaderboard_runs').getList<{ user: string }>(1, 20, {
    filter: notSelf(),
    sort: '-depth',
  });
  for (const run of runs.items) {
    try {
      const rec = await pb
        .collection('ally_armies')
        .getFirstListItem<AllyRecord>(`user = "${run.user}"`, { expand: 'user' });
      return toOption(rec);
    } catch {
      continue;
    }
  }
  return null;
}
