import PocketBase from 'pocketbase';

// Session persists via the SDK's localStorage auth store.
export const pb = new PocketBase(import.meta.env.VITE_PB_URL ?? 'http://localhost:8090');
