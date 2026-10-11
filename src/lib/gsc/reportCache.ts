// A small in-process cache for per-site report results computed from synced GSC rows.
//
// Those rows only change when a sync writes them, so gscSync bumps the version after it does and
// every key built before that stops matching. That makes a 1 000-site portfolio report a cache
// read on its second open instead of a re-scan of millions of rows — and never a stale one after
// a sync, because the version is part of every key. Lives on globalThis so dev-mode module reloads
// share one instance with the sync scheduler.

type Store = { version: number; map: Map<string, unknown> };
const g = globalThis as unknown as { __opengscReportCache?: Store };
const store: Store = (g.__opengscReportCache ??= { version: 0, map: new Map() });

const MAX_ENTRIES = 5000;

/** Call after any write to the synced query/page rows. */
export function bumpReportCacheVersion(): void {
  store.version++;
  store.map.clear();
}

/** The cached value for `key`, or undefined. */
export function peekReportCache<T>(key: string): T | undefined {
  const k = `${store.version}\n${key}`;
  if (!store.map.has(k)) return undefined;
  const v = store.map.get(k) as T;
  store.map.delete(k); store.map.set(k, v);
  return v;
}

/** Store `value` under `key` — unless a sync bumped the version since `versionAtStart`. */
export function putReportCache<T>(key: string, value: T, versionAtStart: number): void {
  if (versionAtStart !== store.version) return;
  store.map.set(`${store.version}\n${key}`, value);
  while (store.map.size > MAX_ENTRIES) store.map.delete(store.map.keys().next().value as string);
}

export function reportCacheVersion(): number {
  return store.version;
}
