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

const RUN_KEY = 'gauntletRun';

export async function loadRun<T>(): Promise<T | null> {
  return (await (await db()).get(STORE, RUN_KEY)) ?? null;
}

export async function saveRun<T>(run: T): Promise<void> {
  // JSON round-trip: deep-plain copy, state proxies aren't structured-cloneable.
  await (await db()).put(STORE, JSON.parse(JSON.stringify(run)), RUN_KEY);
}

export async function clearRun(): Promise<void> {
  await (await db()).delete(STORE, RUN_KEY);
}
