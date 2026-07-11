<script lang="ts">
  import type { CatalogUnit } from '$lib/engine/catalog';
  import { levelFor } from './config';
  import Sprite from '$lib/ui/Sprite.svelte';

  let {
    unit,
    copies,
    justPulled = false,
  }: {
    unit: CatalogUnit;
    copies: number;
    justPulled?: boolean;
  } = $props();

  const info = $derived(levelFor(copies));
  const owned = $derived(copies > 0);
  const rarityClass = $derived(owned ? `rarity-${info.level}` : 'rarity-unowned');
</script>

<div
  class="unit-card flex flex-col items-center gap-1.5 p-3 {rarityClass}"
  class:just-pulled={justPulled}
>
  <Sprite name={unit.name} class="h-20" />
  <div class="flex items-center gap-1.5">
    <span class="text-sm font-semibold">{owned ? unit.name : '???'}</span>
    <span class="rounded border border-zinc-600 px-1 text-[10px] text-zinc-300">T{unit.tier}</span>
  </div>
  {#if owned}
    <span class="text-xs text-zinc-400 capitalize">
      {info.level} · {copies}{info.nextThreshold ? `/${info.nextThreshold}` : ''}
    </span>
    <div class="h-1 w-full overflow-hidden rounded bg-zinc-800">
      <div class="h-full bg-amber-400" style="width: {info.progress * 100}%"></div>
    </div>
  {:else}
    <span class="text-xs text-zinc-500">Not collected</span>
  {/if}
</div>
