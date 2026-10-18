// The daily Bing/Yandex refresh (enginePortfolio.ts, started by syncScheduler.ts), driven for real
// against a stubbed database and a stubbed fetch: no call ever leaves the process.
//
// The database is an in-memory stand-in behind the raw-SQL helper, holding exactly what these
// modules read and write: the owner's settings (engine keys, sync schedule) and the
// EnginePortfolioCache rows. Prisma is stubbed for the one query the rebuild makes (the user's
// sites) and the Google sync is stubbed outright. Everything else — the rebuild, the schedule's
// once-a-day rule, the call context — is the shipped code.
//
// Delays are collapsed rather than waited: the refresh pauses 45 s between rebuilds and retries
// back off for seconds, so `setTimeout` runs everything on the next turn and records what was
// asked for, which is how the pause itself is asserted.

import { test, before } from "node:test";
import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// ── the world the stubs read ─────────────────────────────────────────────────────────────────

type CacheRow = { data: string; updatedAt: string };
type UserRow = { seoSettings: string | null; syncSettings: string | null };
type DbSite = { id: string; url: string; tags: string | null };

const world = {
  users: new Map<string, UserRow>(),
  cache: new Map<string, CacheRow>(),
  writes: 0,
  sites: [] as DbSite[],
  siteQueries: 0,
  /** The n-th site query throws (0: never), with the key in the message the way a URL carries it. */
  failSiteQuery: 0,
  gsc: { runGscSync: async (): Promise<unknown> => undefined, isSyncInProgress: () => false },
};

const raw = {
  rawQuery: async (sql: string, ...p: unknown[]): Promise<unknown[]> => {
    if (sql.includes(`FROM "EnginePortfolioCache"`)) {
      const row = world.cache.get(p.join("|"));
      return row ? [row] : [];
    }
    if (sql.includes(`WHERE syncSettings IS NOT NULL`)) {
      return [...world.users].filter(([, u]) => u.syncSettings).map(([id]) => ({ id }));
    }
    const user = world.users.get(String(p[0]));
    if (sql.startsWith(`SELECT seoSettings FROM "User"`)) return user ? [{ seoSettings: user.seoSettings }] : [];
    if (sql.startsWith(`SELECT syncSettings FROM "User"`)) return user ? [{ syncSettings: user.syncSettings }] : [];
    throw new Error(`unexpected query: ${sql}`);
  },
  rawExec: async (sql: string, ...p: unknown[]): Promise<number> => {
    if (sql.startsWith(`UPDATE "User" SET syncSettings = ?`)) {
      const user = world.users.get(String(p[1]));
      if (user) user.syncSettings = String(p[0]);
      return 1;
    }
    if (sql.startsWith(`INSERT INTO "EnginePortfolioCache"`)) {
      const [, userId, engine, period, data, updatedAt] = p; // id, userId, engine, period, data, updatedAt
      world.cache.set([userId, engine, period].join("|"), { data: String(data), updatedAt: String(updatedAt) });
      world.writes++;
      return 1;
    }
    throw new Error(`unexpected statement: ${sql}`);
  },
  currentDialect: () => "sqlite",
};

const prisma = {
  site: {
    findMany: async (): Promise<DbSite[]> => {
      if (++world.siteQueries === world.failSiteQuery) {
        throw new Error("GET https://ssl.bing.com/webmaster/api.svc/json/GetUserSites?apikey=SECRET-KEY failed");
      }
      return world.sites;
    },
  },
};

const gsc = {
  runGscSync: () => world.gsc.runGscSync(),
  isSyncInProgress: () => world.gsc.isSyncInProgress(),
};

(globalThis as unknown as { __engineTest: unknown }).__engineTest = { raw, prisma, gsc };

const dir = mkdtempSync(join(tmpdir(), "opengsc-engine-"));
const stub = (name: string, src: string) => {
  const p = join(dir, name);
  writeFileSync(p, src);
  return pathToFileURL(p).href;
};
const forward = (ns: string, names: string[]) =>
  names.map(n => `exports.${n} = (...a) => globalThis.__engineTest.${ns}.${n}(...a);`).join("\n");

const STUBS: Record<string, string> = {
  "@/lib/prisma": stub("prisma.cjs", "exports.prisma = new Proxy({}, { get: (_t, k) => globalThis.__engineTest.prisma[k] });"),
  "@/lib/db/raw": stub("raw.cjs", forward("raw", ["rawQuery", "rawExec", "currentDialect"])),
  "@/lib/gscSync": stub("gscSync.cjs", forward("gsc", ["runGscSync", "isSyncInProgress"])),
};

// Same hook as schedulerCallContext.test.ts: `module.registerHooks` is newer than @types/node.
type ResolveHook = (specifier: string, context: unknown, nextResolve: (s: string, c: unknown) => unknown) => unknown;
const { registerHooks } = nodeModule as unknown as { registerHooks: (hooks: { resolve: ResolveHook }) => void };
registerHooks({
  resolve(specifier, context, nextResolve) {
    const url = STUBS[specifier];
    return url ? { url, format: "commonjs", shortCircuit: true } : nextResolve(specifier, context);
  },
});

// Loaded after the hooks, so the real Prisma client never enters the module cache.
let lib!: typeof import("./enginePortfolio");
let context!: typeof import("./providerLog/context");
before(async () => {
  lib = await import("./enginePortfolio");
  context = await import("./providerLog/context");
});

// ── a Bing that answers from memory ──────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** Two verified sites, each with 120 days of traffic up to today: 2 clicks, 20 impressions, rank 4. */
function bing(method: string): Response {
  if (method === "GetUserSites") return json({ d: [{ Url: "https://a.test/" }, { Url: "https://www.b.test/" }] });
  if (method === "GetRankAndTrafficStats") {
    return json({ d: Array.from({ length: 120 }, (_, i) => ({ Date: `/Date(${Date.now() - i * DAY_MS})/`, Clicks: 2, Impressions: 20, AvgImpressionPosition: 4 })) });
  }
  return json({ d: [] });
}

let respond: (method: string) => Response = bing;
/** Every request made, with the call context it was made under. */
const calls: { method: string; host: string; userId: string | null; feature: string | null }[] = [];

globalThis.fetch = (async (input: string | URL | Request) => {
  const url = new URL(String(input));
  const method = url.pathname.split("/").pop() ?? "";
  const { userId, feature } = context.currentCallContext();
  calls.push({ method, host: url.host, userId, feature });
  return respond(method);
}) as typeof fetch;

function reset(opts: { seo?: Record<string, string>; sync?: Record<string, unknown>; sites?: DbSite[] } = {}): void {
  world.users = new Map([["u1", { seoSettings: JSON.stringify(opts.seo ?? {}), syncSettings: opts.sync ? JSON.stringify(opts.sync) : null }]]);
  world.cache = new Map();
  world.writes = 0;
  world.sites = opts.sites ?? [];
  world.siteQueries = 0;
  world.failSiteQuery = 0;
  world.gsc = { runGscSync: async () => undefined, isSyncInProgress: () => false };
  respond = bing;
  calls.length = 0;
}

/** Run with every delay collapsed to the next turn and the console captured. */
async function quick<T>(fn: () => Promise<T>): Promise<{ value: T; lines: string[]; delays: number[] }> {
  const lines: string[] = [];
  const delays: number[] = [];
  const realTimeout = globalThis.setTimeout;
  const { log, warn } = console;
  globalThis.setTimeout = ((cb: (...a: unknown[]) => void, ms?: number, ...args: unknown[]) => {
    delays.push(ms ?? 0);
    return realTimeout(cb, 0, ...args);
  }) as unknown as typeof setTimeout;
  console.log = console.warn = (...a: unknown[]) => { lines.push(a.map(String).join(" ")); };
  try {
    return { value: await fn(), lines, delays };
  } finally {
    globalThis.setTimeout = realTimeout;
    console.log = log;
    console.warn = warn;
  }
}

const BING_ONLY = { seoKey_bing: "BING-KEY" };

// ── the rebuild ──────────────────────────────────────────────────────────────────────────────

test("an engine without a key is never called, and nothing is stored", async () => {
  reset({ seo: BING_ONLY });
  assert.deepEqual(await lib.rebuildEnginePortfolio("u1", "yandex", "28d"), { status: "noKey" });
  assert.equal(calls.length, 0);

  reset({ seo: {} });
  const { value, lines } = await quick(() => lib.refreshEnginePortfolios("u1"));
  assert.deepEqual(value, []);
  assert.equal(calls.length, 0);
  assert.equal(world.writes, 0);
  assert.deepEqual(lines, [], "a user without engine keys is not worth a log line every day");
});

test("a rebuild stores the period's snapshot, DB sites keeping their id and tags", async () => {
  reset({ seo: BING_ONLY, sites: [{ id: "db-a", url: "https://a.test/", tags: "client" }] });
  const { value } = await quick(() => lib.rebuildEnginePortfolio("u1", "bing", "28d"));
  assert.equal(value.status, "ok");

  const stored = JSON.parse(world.cache.get("u1|bing|28d")!.data) as { id: string; tags: string | null; hasData: boolean; data: unknown[]; summary: { clicks: { value: number } } }[];
  assert.deepEqual(stored.map(s => [s.id, s.tags]), [["db-a", "client"], ["bing:b.test", null]]);
  for (const s of stored) {
    assert.equal(s.hasData, true);
    assert.equal(s.data.length, 28);
    assert.equal(s.summary.clicks.value, 56);
  }
  assert.ok(calls.every(c => c.host === "ssl.bing.com"));
});

test("a period that fails keeps its previous snapshot, and the periods after it still run", async () => {
  reset({ seo: BING_ONLY });
  const OLD: CacheRow = {
    data: JSON.stringify([{ id: "old", url: "https://old.test/", tags: null, data: [], summary: null, hasData: true }]),
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
  for (const p of lib.ENGINE_CRON_PERIODS) world.cache.set(`u1|bing|${p}`, { ...OLD });

  // 7d: Bing throttles the site listing through every retry. 28d: the rebuild itself crashes.
  // 3m: all is well.
  let listings = 0;
  respond = method => (method === "GetUserSites" && ++listings <= 3 ? new Response("busy", { status: 503 }) : bing(method));
  world.failSiteQuery = 2;
  const { value, lines, delays } = await quick(() => lib.refreshEnginePortfolios("u1"));

  assert.deepEqual(value.map(o => [o.engine, o.period, o.ok]), [["bing", "7d", false], ["bing", "28d", false], ["bing", "3m", true]]);
  assert.deepEqual(world.cache.get("u1|bing|7d"), OLD);
  assert.deepEqual(world.cache.get("u1|bing|28d"), OLD);
  assert.equal(JSON.parse(world.cache.get("u1|bing|3m")!.data).length, 2);
  assert.equal(world.writes, 1);

  const log = lines.join("\n");
  assert.ok(lines.includes("[engine-cron] bing 7d : échec (aucun site listé par Bing : pas de réponse exploitable (réseau, 429 ou 5xx)), cache précédent conservé"), log);
  assert.ok(lines.some(l => l.startsWith("[engine-cron] bing 28d : échec (")), log);
  assert.ok(lines.includes("[engine-cron] bing 3m : 2 sites, OK"), log);
  assert.ok(!log.includes("SECRET-KEY"), "the key must never reach the log");
  assert.equal(delays.filter(d => d === 45_000).length, 2, "one pause between each two rebuilds");
});

test("an empty site list never replaces a snapshot that had sites", async () => {
  reset({ seo: BING_ONLY });
  respond = method => (method === "GetUserSites" ? json({ d: [] }) : bing(method));
  assert.equal((await quick(() => lib.rebuildEnginePortfolio("u1", "bing", "7d"))).value.status, "ok", "nothing stored yet: an empty portfolio is the answer");

  const OLD: CacheRow = { data: JSON.stringify([{ id: "old", url: "https://old.test/", tags: null, data: [], summary: null, hasData: true }]), updatedAt: "2026-01-01T00:00:00.000Z" };
  world.cache.set("u1|bing|7d", { ...OLD });
  const { value } = await quick(() => lib.rebuildEnginePortfolio("u1", "bing", "7d"));
  assert.deepEqual(value, { status: "failed", reason: "Bing n'a renvoyé aucun site" });
  assert.deepEqual(world.cache.get("u1|bing|7d"), OLD);
});

// ── the schedule ─────────────────────────────────────────────────────────────────────────────

/**
 * The tick startSyncScheduler() hands to its timers — the exact reference production calls, the
 * same way schedulerCallContext.test.ts reaches it — and what the scheduler logged when it started.
 */
async function syncTick(): Promise<{ tick: () => Promise<void>; lines: string[] }> {
  const { startSyncScheduler } = await import("./syncScheduler");
  const realTimeout = globalThis.setTimeout;
  const realInterval = globalThis.setInterval;
  const { log } = console;
  const lines: string[] = [];
  let captured: (() => Promise<void>) | undefined;
  const capture = ((fn: () => Promise<void>) => { captured ??= fn; return 0; }) as unknown as typeof setTimeout;
  globalThis.setTimeout = capture;
  globalThis.setInterval = capture as unknown as typeof setInterval;
  console.log = (...a: unknown[]) => { lines.push(a.map(String).join(" ")); };
  try {
    startSyncScheduler();
  } finally {
    globalThis.setTimeout = realTimeout;
    globalThis.setInterval = realInterval;
    console.log = log;
  }
  assert.ok(captured, "startSyncScheduler() must register its tick on a timer");
  return { tick: captured!, lines };
}

test("the scheduled run refreshes the engines once a day, after Google, even when Google fails", async () => {
  reset({ seo: BING_ONLY, sync: { enabled: true, hour: 0, timeZone: "UTC", lastRunAt: null } });
  const order: string[] = [];
  let googleRuns = 0;
  world.gsc = {
    isSyncInProgress: () => false,
    runGscSync: async () => { googleRuns++; order.push("google"); if (googleRuns === 1) throw new Error("Google is down"); },
  };
  respond = method => { order.push(method); return bing(method); };
  const schedule = () => JSON.parse(world.users.get("u1")!.syncSettings!) as { lastRunAt: string | null; enginesRunAt?: string | null };

  const { tick, lines } = await syncTick();
  assert.ok(lines.includes("[engine-cron] rafraîchissement Bing/Yandex prévu après chaque sync planifiée (7d, 28d, 3m)"), lines.join("\n"));

  // First tick of the day: Google fails, the engines run anyway — after it, under the key owner's name.
  await quick(tick);
  assert.equal(order[0], "google");
  assert.equal(calls.length, 9, "3 periods × (1 listing + 2 sites)");
  assert.deepEqual([...world.cache.keys()], ["u1|bing|7d", "u1|bing|28d", "u1|bing|3m"]);
  assert.deepEqual([...new Set(calls.map(c => `${c.userId}/${c.feature}`))], ["u1/engine-cron"]);
  assert.equal(schedule().lastRunAt, null, "a failed Google run is retried on the next tick");
  assert.ok(schedule().enginesRunAt);

  // The rest of the day: Google is retried and succeeds, Bing is left alone.
  await quick(tick);
  await quick(tick);
  assert.equal(googleRuns, 2);
  assert.equal(calls.length, 9);
  assert.ok(schedule().lastRunAt);

  // A stamp from yesterday is a new day for the engines; Google, done today, is not run again.
  const s = schedule();
  world.users.get("u1")!.syncSettings = JSON.stringify({ ...s, enginesRunAt: new Date(Date.now() - DAY_MS).toISOString() });
  await quick(tick);
  assert.equal(googleRuns, 2);
  assert.equal(calls.length, 18);
});
