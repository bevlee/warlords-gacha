<script lang="ts">
  import { goto } from '$app/navigation';
  import { auth } from '$lib/auth.svelte';

  let mode = $state<'login' | 'register'>('login');
  let email = $state('');
  let password = $state('');
  let username = $state('');
  let error = $state('');
  let busy = $state(false);

  async function submit(ev: SubmitEvent) {
    ev.preventDefault();
    error = '';
    busy = true;
    try {
      if (mode === 'register') {
        await auth.register(email, password, username);
      } else {
        await auth.login(email, password);
      }
      goto('/');
    } catch (e) {
      error = e instanceof Error ? e.message : 'Something went wrong';
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head><title>warlordsGacha — sign in</title></svelte:head>

<main class="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 px-6">
  <h1 class="text-center text-2xl font-black tracking-wide">warlordsGacha</h1>

  <div class="flex justify-center gap-2 text-sm">
    <button
      class="rounded px-3 py-1 {mode === 'login' ? 'bg-zinc-700 font-semibold' : 'text-zinc-400'}"
      onclick={() => (mode = 'login')}>Sign in</button
    >
    <button
      class="rounded px-3 py-1 {mode === 'register' ? 'bg-zinc-700 font-semibold' : 'text-zinc-400'}"
      onclick={() => (mode = 'register')}>Create account</button
    >
  </div>

  <form class="flex flex-col gap-3" onsubmit={submit}>
    {#if mode === 'register'}
      <input
        class="rounded border border-zinc-700 bg-zinc-900 px-3 py-2"
        placeholder="Username (3-20, letters/numbers/_)"
        bind:value={username}
        required
        minlength="3"
        maxlength="20"
        pattern="[a-zA-Z0-9_]+"
      />
    {/if}
    <input
      class="rounded border border-zinc-700 bg-zinc-900 px-3 py-2"
      type="email"
      placeholder="Email"
      bind:value={email}
      required
    />
    <input
      class="rounded border border-zinc-700 bg-zinc-900 px-3 py-2"
      type="password"
      placeholder="Password (min 8)"
      bind:value={password}
      required
      minlength="8"
    />
    <button
      class="rounded bg-amber-500 px-3 py-2 font-semibold text-zinc-950 disabled:opacity-50"
      disabled={busy}
    >
      {mode === 'register' ? 'Create account' : 'Sign in'}
    </button>
    {#if error}
      <p class="text-sm text-red-400">{error}</p>
    {/if}
  </form>
</main>
