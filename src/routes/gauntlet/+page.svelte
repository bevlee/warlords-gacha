<script lang="ts">
  import { onMount } from 'svelte';
  import Battle from '$lib/ui/Battle.svelte';
  import Sprite from '$lib/ui/Sprite.svelte';
  import { FACTION_INFO, FACTION_UNITS } from '$lib/engine/factions';
  import { armyCost } from '$lib/engine/recruit';
  import {
    newRun,
    recordBattle,
    continueEndless,
    endRun,
    applyPick,
    generateGauntletEnemy,
    toBattleArmy,
    encounterBudget,
    actOf,
    BOSS_NODES,
    RUN_LENGTH,
    type RunState,
    type UnitCard,
    type GauntletEncounter,
  } from '$lib/gauntlet/run';
  import { battleReward } from '$lib/gauntlet/economy';
  import { armyScore } from '$lib/gauntlet/score';
  import { publishRun } from '$lib/gacha/publish';
  import { pickAllyStacks, type AllyData } from '$lib/gauntlet/ally';
  import { fetchRandomAlly, fetchTopByScore, fetchTopByDepth, type AllyOption } from '$lib/gacha/allies';
  import { gacha } from '$lib/gacha/state.svelte';
  import { loadRun, saveRun, clearRun } from '$lib/storage';
  import { TIER_STYLE } from '$lib/ui/tierStyle';
  import type { FactionClass } from '$lib/engine/types';

  const ACT_NAMES: Record<1 | 2 | 3, string> = {
    1: 'Act I — The Borderlands',
    2: 'Act II — The Deep Wilds',
    3: 'Act III — The Black Citadel',
  };

  let run: RunState | null = $state(null);
  let inBattle = $state(false);
  let encounter: GauntletEncounter | null = $state(null);
  let battleKey = $state(0);
  let loaded = $state(false);

  onMount(async () => {
    // Await the collection snapshot so begin() gates the draft against the real
    // collection; on failure the empty snapshot just falls back to the loaner army.
    if (!gacha.loaded) await gacha.hydrate().catch(() => {});
    const saved = await loadRun<RunState>();
    // v1 saves predate the owned snapshot and per-slot UnitInstances (Task 10);
    // discard them rather than migrate.
    // (pre-endless v2 saves lack `mode`)
    if (saved?.version === 2) run = { ...saved, mode: saved.mode ?? 'solo', ally: saved.ally ?? null };
    else if (saved) void clearRun();
    loaded = true;
  });

  function begin(faction: FactionClass) {
    run = newRun(faction, { ...gacha.units });
    void saveRun(run);
  }

  function fight() {
    if (!run) return;
    encounter = generateGauntletEnemy(run);
    battleKey += 1;
    inBattle = true;
  }

  function handleResult(result: 'player_wins' | 'enemy_wins') {
    if (!run) return;
    const won = result === 'player_wins';
    // Coins land server-side even if the run UI moves on; a network failure
    // only costs this battle's payout, never the run itself.
    if (won) gacha.reward(battleReward(run.encounterIndex)).catch(() => {});
    run = recordBattle(run, won);
    if (run.status === 'lost' && run.battlesWon > 0) publish(run);
    void saveRun(run);
  }

  /** One publication per run, at its terminal point (loss, or ending by choice). */
  function publish(r: RunState) {
    publishRun({
      mode: r.mode,
      depth: r.battlesWon,
      combatScore: armyScore(r.army),
      army: r.army.map(s => ({ slug: s.instance.slug, count: s.count })),
    }).catch(() => {});
  }

  function chooseEndless(mode: 'solo' | 'ally', ally: AllyData | null = null) {
    if (!run) return;
    run = continueEndless(run, mode, ally);
    allyPicking = false;
    allyChoice = null;
    void saveRun(run);
  }

  let allyPicking = $state(false);
  let allyChoice = $state<AllyOption | null>(null);
  let allyBusy = $state(false);
  let allyError = $state('');

  async function findAlly(kind: 'random' | 'score' | 'depth') {
    allyBusy = true;
    allyError = '';
    try {
      const fetcher =
        kind === 'random' ? fetchRandomAlly : kind === 'score' ? fetchTopByScore : fetchTopByDepth;
      allyChoice = await fetcher();
      if (!allyChoice) allyError = 'No allies published yet — complete runs create them.';
    } catch {
      allyError = 'Could not reach the ally roster.';
    } finally {
      allyBusy = false;
    }
  }

  function finishRun() {
    if (!run) return;
    run = endRun(run);
    publish(run);
    void saveRun(run);
  }

  function pick(card: UnitCard) {
    if (!run) return;
    run = applyPick(run, card);
    void saveRun(run);
  }

  async function abandon() {
    run = null;
    inBattle = false;
    await clearRun();
  }

  const unitFor = (name: string) =>
    run ? FACTION_UNITS[run.faction].find(u => u.name === name)! : null;
</script>

<main class="min-h-screen bg-slate-900 p-4 text-slate-100 sm:p-6">
  <div class="mb-4 flex items-center gap-4">
    <h1 class="text-2xl font-bold">Warlords — Gauntlet</h1>
    <a href="/" class="text-sm text-slate-400 hover:text-slate-200">← main game</a>
  </div>

  {#if !loaded}
    <p class="text-slate-400">Loading…</p>
  {:else if !run}
    <!-- Run setup: pick a faction -->
    <div class="mx-auto max-w-3xl">
      <p class="mb-4 text-slate-300">
        Fight 10 escalating battles. Victories restore your ranks, pay coins, and let you draft
        reinforcements from units you own. Choose your faction:
      </p>
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {#each Object.entries(FACTION_INFO) as [id, info] (id)}
          {@const t7 = FACTION_UNITS[id as FactionClass].find(u => u.tier === 7)!}
          <button
            type="button"
            class="flex flex-col items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 p-4
              text-center hover:border-amber-400 hover:bg-slate-700"
            onclick={() => begin(id as FactionClass)}
          >
            <Sprite name={t7.name} class="h-16 w-14" />
            <span class="font-semibold text-amber-200">{info.name}</span>
            <span class="text-xs text-slate-400">{info.description}</span>
          </button>
        {/each}
      </div>
    </div>
  {:else if inBattle}
    {#key battleKey}
      <Battle
        playerArmy={toBattleArmy(run.army)}
        allyArmy={run.ally ? pickAllyStacks(run.ally.army) : []}
        enemyArmy={encounter?.army ?? []}
        hero={run.hero}
        allowRestart={false}
        exitLabel="Continue"
        onexit={() => (inBattle = false)}
        onresult={handleResult}
      />
    {/key}
  {:else if run.status === 'draft'}
    <!-- Draft: pick 1 of 3 -->
    <div class="mx-auto max-w-2xl">
      <h2 class="mb-1 text-lg font-semibold text-amber-200">Victory! Choose your reinforcements</h2>
      <p class="mb-4 text-sm text-slate-400">
        {#if run.encounterIndex > RUN_LENGTH}
          Endless depth {run.encounterIndex - 1} cleared — the gauntlet deepens.
        {:else}
          Battle {run.encounterIndex - 1} won — {RUN_LENGTH - run.encounterIndex + 1} to go.
        {/if}
      </p>
      <div class="grid grid-cols-3 gap-3">
        {#each run.pendingDraft ?? [] as card (card.unitName)}
          {@const unit = unitFor(card.unitName)}
          {@const ts = unit ? TIER_STYLE[unit.tier] : TIER_STYLE[1]}
          <button
            type="button"
            class="flex flex-col items-center gap-2 rounded-lg border-2 bg-slate-800 p-4
              hover:bg-slate-700 hover:brightness-110 {ts.border} {ts.glow}"
            onclick={() => pick(card)}
          >
            <Sprite name={card.unitName} class="h-16 w-14" />
            <span class="font-bold {ts.text}">{card.count} × {card.unitName}</span>
            {#if unit}
              <span class="text-[10px] font-semibold uppercase tracking-wider {ts.text}">
                Tier {unit.tier} · {ts.label}
              </span>
              <span class="font-mono text-[10px] text-slate-400">
                HP {unit.hp} · Atk {unit.attack} · Def {unit.defense} · Spd {unit.speed}
              </span>
            {/if}
          </button>
        {/each}
      </div>
      <div class="mt-4 rounded border border-slate-700 bg-slate-800 p-2 text-sm text-slate-300">
        Your army: {run.army.map(s => `${s.count}× ${s.unit.name}`).join(' · ')}
      </div>
    </div>
  {:else if run.status === 'gate'}
    <!-- Endless gate: one-time choice after conquering node 10 -->
    <div class="mx-auto max-w-md rounded-lg border border-amber-500/40 bg-slate-800 p-6 text-center">
      <p class="mb-2 text-4xl font-bold text-amber-300">🏆 Gauntlet conquered!</p>
      <p class="mb-4 text-slate-300">
        Depth 10 reached. Venture into the endless beyond, or bank your result now.
      </p>
      <div class="flex flex-col gap-2">
        <button
          type="button"
          class="rounded bg-amber-600 px-5 py-2 font-semibold text-white hover:bg-amber-500"
          onclick={() => chooseEndless('solo')}
        >
          Continue — Endless Solo
        </button>
        {#if !allyPicking}
          <button
            type="button"
            class="rounded bg-fuchsia-700 px-5 py-2 font-semibold text-white hover:bg-fuchsia-600"
            onclick={() => (allyPicking = true)}
          >
            Continue with an Ally
          </button>
        {:else}
          <div class="rounded border border-fuchsia-700/50 bg-slate-900 p-3 text-left">
            <p class="mb-2 text-sm font-semibold text-fuchsia-300">Summon an ally</p>
            <div class="mb-2 flex gap-2">
              <button type="button" class="flex-1 rounded bg-slate-700 px-2 py-1 text-xs hover:bg-slate-600"
                disabled={allyBusy} onclick={() => findAlly('random')}>Random</button>
              <button type="button" class="flex-1 rounded bg-slate-700 px-2 py-1 text-xs hover:bg-slate-600"
                disabled={allyBusy} onclick={() => findAlly('score')}>Top army</button>
              <button type="button" class="flex-1 rounded bg-slate-700 px-2 py-1 text-xs hover:bg-slate-600"
                disabled={allyBusy} onclick={() => findAlly('depth')}>Deepest run</button>
            </div>
            {#if allyBusy}
              <p class="text-xs text-slate-400">Searching…</p>
            {:else if allyError}
              <p class="text-xs text-red-400">{allyError}</p>
            {:else if allyChoice}
              <div class="mb-2 rounded bg-slate-800 p-2">
                <p class="text-sm font-semibold text-amber-200">{allyChoice.username}</p>
                <p class="text-xs text-slate-400">
                  strength {allyChoice.combatScore} ·
                  {allyChoice.army.map(a => `${a.count}× ${a.slug}`).join(' · ')}
                </p>
                <p class="mt-1 text-[10px] text-slate-500">
                  Their {Math.min(3, allyChoice.army.length)} strongest stacks fight beside you, AI-controlled.
                </p>
              </div>
              <button
                type="button"
                class="w-full rounded bg-fuchsia-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-fuchsia-600"
                onclick={() =>
                  chooseEndless('ally', { username: allyChoice!.username, army: allyChoice!.army })}
              >
                Summon {allyChoice.username}
              </button>
            {/if}
          </div>
        {/if}
        <button
          type="button"
          class="rounded border border-slate-600 px-5 py-2 font-semibold text-slate-300 hover:bg-slate-700"
          onclick={finishRun}
        >
          End Run — bank depth {run.battlesWon}
        </button>
      </div>
    </div>
  {:else if run.status === 'won' || run.status === 'lost'}
    <!-- Run summary -->
    <div class="mx-auto max-w-md rounded-lg border border-slate-700 bg-slate-800 p-6 text-center">
      <p class="mb-2 text-4xl font-bold {run.status === 'won' ? 'text-amber-300' : 'text-red-400'}">
        {run.status === 'won' ? '🏆 Gauntlet conquered!' : 'Run over'}
      </p>
      <p class="mb-1 text-slate-300">
        {FACTION_INFO[run.faction].name} ·
        {#if run.battlesWon > RUN_LENGTH}endless depth {run.battlesWon} ({run.mode}){:else}{run.battlesWon} / {RUN_LENGTH} battles won{/if}
      </p>
      <p class="mb-4 text-sm text-slate-400">Hero reached level {run.hero.level}</p>
      <button
        type="button"
        class="rounded bg-amber-600 px-5 py-2 font-semibold text-white hover:bg-amber-500"
        onclick={abandon}
      >
        New run
      </button>
    </div>
  {:else}
    <!-- Run map -->
    <div class="mx-auto flex max-w-3xl gap-6">
      <div class="flex-1">
        {#if run.encounterIndex > RUN_LENGTH}
          {@const enc = generateGauntletEnemy(run)}
          <div class="rounded-lg border border-fuchsia-700/50 bg-slate-800 p-4">
            <p class="mb-1 text-xs font-semibold uppercase tracking-wide text-fuchsia-300">
              Endless {run.mode === 'ally' ? '— with ally' : '— solo'}
            </p>
            <p class="mb-3 text-2xl font-bold text-slate-100">Depth {run.encounterIndex}</p>
            <div class="mb-3 flex items-center gap-3 rounded border border-amber-400 bg-slate-700 px-3 py-2">
              <span class="flex-1 text-sm text-slate-200">
                {FACTION_INFO[enc.faction].name} warband — strength ~{encounterBudget(run.encounterIndex)}
              </span>
              <button
                type="button"
                class="rounded bg-amber-600 px-4 py-1 text-sm font-semibold text-white hover:bg-amber-500"
                onclick={fight}
              >
                Fight ⚔️
              </button>
            </div>
            <button
              type="button"
              class="w-full rounded border border-slate-600 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-700"
              onclick={finishRun}
            >
              Retire — bank depth {run.battlesWon}
            </button>
          </div>
        {:else}
        {#each [3, 2, 1] as act (act)}
          <p class="mb-1 mt-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
            {ACT_NAMES[act as 1 | 2 | 3]}
          </p>
          {#each Array.from({ length: RUN_LENGTH }, (_, i) => RUN_LENGTH - i).filter(n => actOf(n) === act) as n (n)}
            {@const current = n === run.encounterIndex}
            <div
              class="mb-1 flex items-center gap-3 rounded border px-3 py-1.5
                {current ? 'border-amber-400 bg-slate-700' : n < run.encounterIndex ? 'border-emerald-700 bg-emerald-950/40' : 'border-slate-700 bg-slate-800/60'}"
              aria-label="node {n}{current ? ' — current' : n < run.encounterIndex ? ' — cleared' : ''}"
            >
              <span class="w-6 text-center font-mono text-sm {BOSS_NODES.has(n) ? 'text-red-400' : 'text-slate-400'}">
                {BOSS_NODES.has(n) ? '💀' : n}
              </span>
              {#if current}
                {@const enc = generateGauntletEnemy(run)}
                <span class="flex-1 text-sm text-slate-200">
                  {FACTION_INFO[enc.faction].name} warband — strength ~{encounterBudget(n)}
                  {#if enc.isBoss}<span class="ml-1 font-semibold text-red-400">BOSS</span>{/if}
                </span>
                <button
                  type="button"
                  class="rounded bg-amber-600 px-4 py-1 text-sm font-semibold text-white hover:bg-amber-500"
                  onclick={fight}
                >
                  Fight ⚔️
                </button>
              {:else}
                <span class="flex-1 text-sm text-slate-500">{n < run.encounterIndex ? 'cleared' : '???'}</span>
              {/if}
            </div>
          {/each}
        {/each}
        {/if}
      </div>

      <div class="w-56 shrink-0">
        <div class="rounded-lg border border-slate-700 bg-slate-800 p-3">
          <p class="mb-1 text-sm font-semibold text-amber-200">
            {FACTION_INFO[run.faction].name} — level {run.hero.level}
          </p>
          <p class="mb-2 font-mono text-xs text-slate-400">⚔{run.hero.attack} 🛡{run.hero.defense}</p>
          <p class="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Army ({armyCost(run.army)} power)</p>
          {#each run.army as slot (slot.unit.name)}
            {@const ts = TIER_STYLE[slot.unit.tier]}
            <div class="flex items-center gap-2 py-0.5">
              <span class="rounded ring-1 {ts.ring}"><Sprite name={slot.unit.name} class="h-7 w-6" /></span>
              <span class="text-xs {ts.text}">{slot.count} × {slot.unit.name}</span>
            </div>
          {/each}
          {#if run.ally}
            <p class="mb-1 mt-3 text-xs font-semibold uppercase tracking-wide text-fuchsia-300">
              Ally — {run.ally.username}
            </p>
            {#each pickAllyStacks(run.ally.army) as slot (slot.unit.name)}
              <div class="flex items-center gap-2 py-0.5">
                <span class="rounded ring-1 ring-fuchsia-700"><Sprite name={slot.unit.name} class="h-7 w-6" /></span>
                <span class="text-xs text-fuchsia-200">{slot.count} × {slot.unit.name}</span>
              </div>
            {/each}
          {/if}
        </div>
        <button
          type="button"
          class="mt-3 w-full rounded px-2 py-1 text-xs text-slate-500 hover:bg-slate-800 hover:text-slate-300"
          onclick={abandon}
        >
          Abandon run
        </button>
      </div>
    </div>
  {/if}
</main>
