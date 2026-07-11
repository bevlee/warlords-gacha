<script lang="ts">
  import { onMount } from 'svelte';
  import { CATALOG, FACTION_INFO } from '$lib/engine';
  import { gacha, type PullResult } from '$lib/gacha/state.svelte';
  import { PACK_COST } from '$lib/gacha/config';
  import { auth } from '$lib/auth.svelte';
  import UnitCard from '$lib/gacha/UnitCard.svelte';
  import PullOverlay from '$lib/gacha/PullOverlay.svelte';

  const FACTIONS = Object.keys(FACTION_INFO) as (keyof typeof FACTION_INFO)[];

  let pullResult = $state<PullResult | null>(null);
  let pulling = $state(false);

  onMount(() => {
    gacha.hydrate();
  });

  async function openPack() {
    // pullResult guard: Enter/Space on the still-focused button while the
    // overlay is open would otherwise replace the prop without remounting
    if (pulling || pullResult) return;
    pulling = true;
    const result = await gacha.pull();
    pulling = false;
    if (result) pullResult = result;
  }

  function collect() {
    if (pullResult) gacha.markPulled(pullResult.unitSlug);
    pullResult = null;
  }

  const canAfford = $derived(gacha.coins >= PACK_COST);
</script>

<svelte:head><title>warlordsGacha</title></svelte:head>

<div class="min-h-screen bg-zinc-950 text-zinc-100">
  <header
    class="sticky top-0 z-40 flex items-center gap-4 border-b border-zinc-800 bg-zinc-950/90 px-6 py-3 backdrop-blur"
  >
    <h1 class="text-lg font-black tracking-wide">warlordsGacha</h1>
    <nav class="flex gap-3 text-sm text-zinc-400">
      <a class="hover:text-zinc-100" href="/gauntlet">Gauntlet</a>
      <a class="hover:text-zinc-100" href="/leaderboards">Leaderboards</a>
    </nav>
    <div class="ml-auto flex items-center gap-3">
      <span class="text-sm text-zinc-400">{auth.user?.username}</span>
      <span class="font-mono text-amber-400" data-testid="coins">🪙 {gacha.coins}</span>
      {#if import.meta.env.DEV}
        <button
          class="rounded border border-zinc-700 px-2 py-1 text-sm"
          onclick={() => gacha.reward(100)}>+100</button
        >
      {/if}
      <button
        class="rounded bg-amber-500 px-3 py-1 text-sm font-semibold text-zinc-950 disabled:opacity-40"
        disabled={!canAfford || pulling}
        onclick={openPack}
      >
        Open Pack ({PACK_COST})
      </button>
      <button class="text-sm text-zinc-500 hover:text-zinc-200" onclick={() => auth.logout()}>
        Sign out
      </button>
    </div>
  </header>

  <main class="mx-auto max-w-6xl px-6 py-8">
    {#if !gacha.loaded}
      <p class="text-zinc-400">Loading…</p>
    {:else}
      {#each FACTIONS as faction (faction)}
        <section class="mb-10">
          <h2 class="mb-3 text-sm font-bold tracking-widest text-zinc-400 uppercase">
            {FACTION_INFO[faction].name}
          </h2>
          <div class="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            {#each CATALOG.filter((u) => u.faction === faction) as unit (unit.slug)}
              <UnitCard
                {unit}
                copies={gacha.units[unit.slug] ?? 0}
                justPulled={gacha.lastPulled === unit.slug}
              />
            {/each}
          </div>
        </section>
      {/each}
    {/if}
  </main>
</div>

{#if pullResult}
  <PullOverlay result={pullResult} onclose={collect} />
{/if}
