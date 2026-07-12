import { pb } from '$lib/pb';

export interface RunPublication {
  mode: 'solo' | 'ally';
  depth: number;
  combatScore: number;
  army: { slug: string; count: number }[];
}

/** Records the run on the leaderboard; depth >= 10 also upserts the ally army. */
export function publishRun(publication: RunPublication) {
  return pb.send('/api/gacha/publish-run', { method: 'POST', body: publication });
}
