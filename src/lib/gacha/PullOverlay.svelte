<script lang="ts">
  import { onMount } from 'svelte';
  import { unitBySlug, type CatalogUnit } from '$lib/engine/catalog';
  import { rollUnit, levelFor } from './config';
  import { gacha, type PullResult } from './state.svelte';
  import Sprite from '$lib/ui/Sprite.svelte';

  let { result, onclose }: { result: PullResult; onclose: () => void } = $props();

  // The parent remounts this component per pull ({#if pullResult}), so an
  // init-time snapshot of the prop is intentional.
  // svelte-ignore state_referenced_locally
  const res = result;

  const CARD = 136; // 128px card + 8px gap
  const REEL_LEN = 40;
  const WINNER_INDEX = 34;
  const SPIN_MS = 4000;

  const winner = unitBySlug(res.unitSlug)!;
  const reel: CatalogUnit[] = Array.from({ length: REEL_LEN }, () => rollUnit());
  reel[WINNER_INDEX] = winner;

  // ownership as of before this pull: the winner's copies were already applied
  // to gacha.units, so a newly unlocked unit stays a silhouette during the spin
  const ownedBefore = (u: CatalogUnit) =>
    u.slug === res.unitSlug ? res.copiesBefore > 0 : (gacha.units[u.slug] ?? 0) > 0;

  const before = levelFor(res.copiesBefore);
  const after = levelFor(res.copiesAfter);
  const leveledUp = before.level !== after.level;
  const isNew = res.copiesBefore === 0;

  let phase = $state<'spin' | 'reveal'>('spin');
  let offset = $state(0);
  let viewport: HTMLDivElement | undefined = $state();

  onMount(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      phase = 'reveal';
      return;
    }
    const jitter = (Math.random() - 0.5) * CARD * 0.5;
    const target = WINNER_INDEX * CARD + CARD / 2 - (viewport?.clientWidth ?? 0) / 2 + jitter;
    // double rAF so the initial offset:0 paints before the transition starts
    requestAnimationFrame(() => requestAnimationFrame(() => (offset = target)));
    const t = setTimeout(() => (phase = 'reveal'), SPIN_MS + 300);
    return () => clearTimeout(t);
  });
</script>

<div class="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/95">
  {#if phase === 'spin'}
    <div bind:this={viewport} class="relative w-full max-w-4xl overflow-hidden py-8">
      <div class="absolute inset-y-4 left-1/2 z-10 w-0.5 -translate-x-1/2 bg-amber-400"></div>
      <div
        class="flex gap-2 will-change-transform"
        style="transform: translateX({-offset}px); transition: transform {SPIN_MS}ms cubic-bezier(0.12, 0.75, 0.15, 1);"
      >
        {#each reel as u, i (i)}
          <div
            class="unit-card flex w-32 shrink-0 flex-col items-center gap-1 p-3"
            class:rarity-unowned={!ownedBefore(u)}
          >
            <Sprite name={u.name} class="h-20" />
            <span class="text-xs font-semibold">{ownedBefore(u) ? u.name : '???'}</span>
            <span class="text-[10px] text-zinc-400">T{u.tier}</span>
          </div>
        {/each}
      </div>
    </div>
  {:else}
    <div class="flex flex-col items-center gap-4">
      <div class="unit-card flex w-56 flex-col items-center gap-2 p-6 rarity-{after.level}">
        <Sprite name={winner.name} class="h-32" animate />
        <span class="text-xl font-bold">{winner.name}</span>
        <span class="text-sm text-zinc-400">Tier {winner.tier}</span>
        <span class="text-sm capitalize">{after.level} · {res.copiesAfter} collected</span>
      </div>
      {#if isNew}
        <span class="text-2xl font-black tracking-wide text-amber-400">NEW!</span>
      {:else if leveledUp}
        <span class="text-2xl font-black tracking-wide text-emerald-400 capitalize">
          Level up! {before.level} → {after.level}
        </span>
      {/if}
      <button
        class="rounded bg-amber-500 px-6 py-2 text-lg font-semibold text-zinc-950"
        onclick={onclose}>Collect</button
      >
    </div>
  {/if}
</div>
