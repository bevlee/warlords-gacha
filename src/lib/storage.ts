import { openDB, type IDBPDatabase } from 'idb';

const DB_NAME = 'warlords';
const STORE = 'kv';

function db(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, 1, {
    upgrade(d) {
      d.createObjectStore(STORE);
    },
  });
}

// Runs are scoped per account so switching users on one device never resumes
// (or publishes) someone else's run.
const runKey = (userId: string) => `gauntletRun:${userId}`;

export async function loadRun<T>(userId: string): Promise<T | null> {
  return (await (await db()).get(STORE, runKey(userId))) ?? null;
}

export async function saveRun<T>(userId: string, run: T): Promise<void> {
  // JSON round-trip: deep-plain copy, state proxies aren't structured-cloneable.
  await (await db()).put(STORE, JSON.parse(JSON.stringify(run)), runKey(userId));
}

export async function clearRun(userId: string): Promise<void> {
  await (await db()).delete(STORE, runKey(userId));
}
