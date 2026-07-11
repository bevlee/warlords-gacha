<script lang="ts">
  import '../app.css';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { auth } from '$lib/auth.svelte';

  let { children } = $props();

  $effect(() => {
    if (!auth.user && page.url.pathname !== '/login') goto('/login');
  });
</script>

{@render children()}
