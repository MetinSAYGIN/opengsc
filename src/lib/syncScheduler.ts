// Automatic GSC sync — the clock half. Settings and the "is it due" rule live in syncSchedule.ts.
//
// Same in-process pattern as the digest and rank schedulers: a tick started from
// instrumentation.ts, no system cron to install. It ticks every fifteen minutes rather than
// hourly because the hour is evaluated in the user's own zone, and not every zone is a whole
// number of hours away from UTC.
//
// One wrinkle worth stating plainly: runGscSync() is instance-wide. It walks every connected
// Google account of every user, so this cannot be a per-user schedule even though the setting is
// stored per user. If two people both switch it on, the earlier of the two hours wins and the
// second one finds the run already done for the day. On a single-operator instance — which is
// what OpenGSC is — that distinction never comes up.
//
// Right after the Google run, the same schedule rebuilds each due user's Bing/Yandex snapshots
// (enginePortfolio.ts), which the dashboard otherwise only rebuilds when Sync is pressed. That half
// is per user, since it spends the user's own engine keys, and it keeps a day stamp of its own
// (`enginesRunAt`): it runs once a day, even on a day the Google run has to be retried.

import { runGscSync, isSyncInProgress } from "@/lib/gscSync";
import { getSyncSchedule, saveSyncSchedule, isDue } from "@/lib/syncSchedule";
import { rawQuery } from "@/lib/db/raw";
import { resolveCaptureBodies } from '@/lib/providerLog/bodies';
import { withCallContext } from "@/lib/providerLog/context";
import { redactText } from "@/lib/providerLog/redact";
import { ENGINE_CRON_PERIODS, refreshEnginePortfolios } from "@/lib/enginePortfolio";

const TICK_MS = 15 * 60 * 1000;

async function tick() {
  let users: { id: string }[] = [];
  try {
    users = await rawQuery(`SELECT id FROM "User" WHERE syncSettings IS NOT NULL`);
  } catch {
    return; // column not there yet — the instance simply has no schedules
  }
  if (!users.length) return;

  const now = new Date();
  const due: string[] = [];
  const enginesDue: string[] = [];
  for (const u of users) {
    const s = await getSyncSchedule(u.id);
    if (isDue(s, now)) due.push(u.id);
    // The same once-a-day rule, counted against the engines' own stamp.
    if (isDue({ ...s, lastRunAt: s.enginesRunAt ?? null }, now)) enginesDue.push(u.id);
  }
  if (!due.length && !enginesDue.length) return;

  if (isSyncInProgress()) {
    console.log("[sync-cron] due, but a sync is already running — leaving it alone");
    return;
  }

  // The engines do not read Google's data, so a Google run that failed does not hold them back.
  if (due.length) await syncGoogle(due).catch(e => console.warn("[sync-cron] scheduled sync failed:", e));
  if (enginesDue.length) await refreshEngines(enginesDue);
}

async function syncGoogle(due: string[]) {
  console.log(`[sync-cron] starting scheduled sync (due for ${due.length} user(s))`);
  // A null user, deliberately. `runGscSync()` is one instance-wide run serving everyone who is
  // due, so there is no single owner to name — and naming one of the due users would bill their
  // account for calls made on everybody's behalf. An admitted gap beats an invented owner; the
  // `feature` still says which run these calls belong to.
  //
  // The same reasoning decides the bodies switch, which is why it is asked with `null` rather
  // than skipped: this run has no owner whose consent could be read, so nothing short of the
  // instance-wide `OPENGSC_LOG_BODIES` override turns capture on here. Reading the first due
  // user's setting would store everybody's payloads on one person's say-so.
  const captureBodies = await resolveCaptureBodies(null);
  await withCallContext({ userId: null, feature: "sync-cron", captureBodies }, () => runGscSync());

  // Written after the run, not before: a run that crashed halfway should be retried on the next
  // tick rather than counted as this day's sync.
  const stamp = new Date().toISOString();
  for (const userId of due) {
    const s = await getSyncSchedule(userId);
    await saveSyncSchedule(userId, { ...s, lastRunAt: stamp }).catch(() => {});
  }
}

// Unlike the Google run, these calls have an owner: the user whose keys they spend.
async function refreshEngines(userIds: string[]) {
  for (const userId of userIds) {
    try {
      const captureBodies = await resolveCaptureBodies(userId);
      await withCallContext({ userId, feature: "engine-cron", captureBodies }, () => refreshEnginePortfolios(userId));
    } catch (e) {
      console.warn(`[engine-cron] interrompu pour l'utilisateur ${userId} : ${redactText(e instanceof Error ? e.message : String(e))}`);
    }
    // Stamped whatever the outcome: a period that failed keeps its previous snapshot and is tried
    // again tomorrow, not every fifteen minutes against an engine that is throttling us.
    const s = await getSyncSchedule(userId);
    await saveSyncSchedule(userId, { ...s, enginesRunAt: new Date().toISOString() }).catch(() => {});
  }
}

let started = false;
let running = false;

export function startSyncScheduler() {
  if (started) return;
  started = true;
  console.log("[sync-cron] scheduler started");
  console.log(`[engine-cron] rafraîchissement Bing/Yandex prévu après chaque sync planifiée (${ENGINE_CRON_PERIODS.join(", ")})`);
  const run = async () => {
    if (running) return;
    running = true;
    try { await tick(); } catch (e) { console.warn("[sync-cron] tick failed:", e); }
    finally { running = false; }
  };
  // Not immediately at boot: a restart during the scheduled hour would otherwise kick off a full
  // sync while the process is still warming up, and a deploy loop would do it repeatedly.
  setTimeout(run, 3 * 60_000);
  setInterval(run, TICK_MS);
}
