<script lang="ts">
  import { onMount } from 'svelte';
  import { pb } from '$lib/pb';

  interface Row {
    username: string;
    depth: number;
    combatScore: number;
    created: string;
  }

  type RunRecord = {
    depth: number;
    combat_score: number;
    created: string;
    expand?: { user?: { username?: string } };
  };

  let mode = $state<'solo' | 'ally'>('solo');
  let rows = $state<Row[]>([]);
  let loading = $state(true);
  let error = $state('');

  async function load(m: 'solo' | 'ally') {
    loading = true;
    error = '';
    try {
      const page = await pb.collection('leaderboard_runs').getList<RunRecord>(1, 50, {
        filter: `mode = "${m}"`,
        sort: '-depth,-combat_score',
        expand: 'user',
      });
      rows = page.items.map((r) => ({
        username: r.expand?.user?.username ?? 'unknown',
        depth: r.depth,
        combatScore: r.combat_score,
        created: r.created,
      }));
    } catch {
      error = 'Could not load the leaderboard.';
      rows = [];
    } finally {
      loading = false;
    }
  }

  function pick(m: 'solo' | 'ally') {
    mode = m;
    void load(m);
  }

  onMount(() => {
    void load(mode);
  });
</script>

<svelte:head><title>warlordsGacha — leaderboards</title></svelte:head>

<main class="mx-auto min-h-screen max-w-2xl bg-zinc-950 px-6 py-8 text-zinc-100">
  <div class="mb-6 flex items-center gap-4">
    <h1 class="text-2xl font-bold">Leaderboards</h1>
    <a href="/" class="text-sm text-zinc-400 hover:text-zinc-200">← collection</a>
  </div>

  <div class="mb-4 flex gap-2">
    <button
      class="rounded px-4 py-1.5 text-sm font-semibold {mode === 'solo'
        ? 'bg-amber-500 text-zinc-950'
        : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'}"
      onclick={() => pick('solo')}
    >
      Endless Solo
    </button>
    <button
      class="rounded px-4 py-1.5 text-sm font-semibold {mode === 'ally'
        ? 'bg-fuchsia-600 text-white'
        : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'}"
      onclick={() => pick('ally')}
    >
      Endless Ally
    </button>
  </div>

  {#if loading}
    <p class="text-zinc-400">Loading…</p>
  {:else if error}
    <p class="text-red-400">{error}</p>
  {:else if rows.length === 0}
    <p class="text-zinc-400">No runs published yet — finish a gauntlet run to appear here.</p>
  {:else}
    <table class="w-full text-sm">
      <thead>
        <tr class="border-b border-zinc-800 text-left text-xs tracking-wide text-zinc-500 uppercase">
          <th class="py-2 pr-2">#</th>
          <th class="py-2 pr-2">Player</th>
          <th class="py-2 pr-2 text-right">Depth</th>
          <th class="py-2 text-right">Army strength</th>
        </tr>
      </thead>
      <tbody>
        {#each rows as row, i (row.username + row.created)}
          <tr class="border-b border-zinc-900">
            <td class="py-2 pr-2 font-mono text-zinc-500">{i + 1}</td>
            <td class="py-2 pr-2 font-semibold {i === 0 ? 'text-amber-300' : ''}">{row.username}</td>
            <td class="py-2 pr-2 text-right font-mono">{row.depth}</td>
            <td class="py-2 text-right font-mono text-zinc-400">{row.combatScore}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</main>
