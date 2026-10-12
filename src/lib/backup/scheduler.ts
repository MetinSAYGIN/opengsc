// The backup scheduler (issue #32): an hourly tick that asks the cron matcher whether the
// configured schedule fired since the last run we acted on. The due rules live in due.ts
// (pure, pinned by schedule.test.ts); same contract as the geo-grid preset loop — one fire is
// one attempt, no back-fill, and the high-water advances even on a failed run.

import { readBackupConfig, readBackupState, saveBackupState } from "@/lib/backup/configStore";
import { runBackup } from "@/lib/backup/dump";
import { resolveSqliteDb } from "@/lib/backup/artifacts";
import { dueFire } from "@/lib/backup/due";

const TICK_MS = 60 * 60_000;   // hourly
const FIRST_TICK_MS = 120_000; // first pass shortly after boot, like the digest loop

let started = false;
let running = false;
/** Set when the BackupRun table is missing — the tick stops retrying until restart. */
let disabled = false;

export { dueFire };

async function tick(): Promise<void> {
  if (running || disabled) return;
  running = true;
  try {
    const cfg = await readBackupConfig();
    if (!cfg.enabled || !cfg.schedule) return;
    if (!resolveSqliteDb()) return; // MySQL instance — the Settings card says so, the loop stays quiet

    const state = await readBackupState();
    const fire = dueFire(cfg.schedule, state.lastFireAt, new Date());
    if (!fire) return;

    // Advance the high-water BEFORE the run: a crash mid-backup must not turn the next tick
    // into a second concurrent attempt, and one attempt per fire is the contract.
    await saveBackupState({ lastFireAt: fire.toISOString() });
    await runBackup("scheduled");
  } catch (e) {
    const value = e as { code?: string; message?: string };
    if (value?.code === "P2021" || /BackupRun.*(does not exist|no such table)/i.test(String(value?.message ?? ""))) {
      disabled = true;
      console.warn("[backup-cron] BackupRun table missing — scheduler disabled until restart (prisma db push)");
      return;
    }
    console.warn("[backup-cron] tick failed:", e);
  } finally {
    running = false;
  }
}

export function startBackupScheduler(): void {
  if (started) return;
  started = true;
  console.log("[backup-cron] scheduler started");
  setTimeout(() => void tick(), FIRST_TICK_MS);
  setInterval(() => void tick(), TICK_MS);
}
