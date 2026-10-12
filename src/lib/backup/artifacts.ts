// Pure on-disk vocabulary of the backup module (issue #32): which files are ours, where they
// live, and what retention deletes. No database, no native imports — dump.ts (the runner) and
// the unit tests share these rules, so the listing the Settings card shows and the files the
// runner prunes can never disagree.

import fs from "node:fs";
import path from "node:path";

/**
 * Files this module owns — the run history's on-disk counterparts and the retention targets.
 * The pre-update copies are `opengsc-before-update-*.db` and are deliberately NOT matched.
 *
 *   opengsc-scheduled-<stamp>.db[.gz][.enc] / opengsc-manual-<stamp>.db[.gz][.enc]
 *   opengsc-env-<stamp>.env[.enc]
 */
export const BACKUP_FILE_RE = /^opengsc-(scheduled|manual)-\S+\.db(\.gz)?(\.enc)?$|^opengsc-env-\S+\.env(\.enc)?$/;

/** The SQLite file this instance runs on, or null on MySQL/MariaDB (backups are SQLite-only).
 *  Mirrors the resolution prisma.ts does for the adapter, including the cwd fallback. */
export function resolveSqliteDb(): { dbPath: string; backupsDir: string } | null {
  const raw = process.env.DATABASE_URL || "";
  if (!raw.startsWith("file:")) return null;
  const value = raw.slice("file:".length).split("?")[0];
  if (!value || value.includes(":memory:")) return null;
  const dbPath = path.isAbsolute(value) ? value : path.resolve(process.cwd(), value);
  return { dbPath, backupsDir: path.join(path.dirname(dbPath), "backups") };
}

/** Same stamp shape the update script uses, so ls reads as one family. */
export function backupStamp(at = new Date()): string {
  return at.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export interface LocalBackupFile { name: string; sizeBytes: number; mtimeMs: number }

export function listLocalBackups(backupsDir: string): LocalBackupFile[] {
  try {
    return fs.readdirSync(backupsDir)
      .filter(name => BACKUP_FILE_RE.test(name))
      .map(name => {
        const full = path.join(backupsDir, name);
        const st = fs.statSync(full);
        return { name, sizeBytes: st.size, mtimeMs: st.mtimeMs };
      })
      .sort((a, b) => b.mtimeMs - a.mtimeMs);
  } catch {
    return [];
  }
}

export interface PrunableFile { name: string; mtimeMs: number }

/**
 * Which files retention deletes: everything older than the cutoff, except that the newest
 * database artifact of each kind prefix always survives — an instance that was down for a
 * month must still find its last backup in the directory when it comes back.
 */
export function pickPrunable(files: PrunableFile[], nowMs: number, retentionDays: number): string[] {
  const cutoff = nowMs - retentionDays * 24 * 60 * 60_000;
  const doomed = files.filter(f => f.mtimeMs < cutoff);
  for (const prefix of ["opengsc-scheduled-", "opengsc-manual-"]) {
    const newest = files.filter(f => f.name.startsWith(prefix)).sort((a, b) => b.mtimeMs - a.mtimeMs)[0];
    if (newest) {
      const i = doomed.findIndex(f => f.name === newest.name);
      if (i >= 0) doomed.splice(i, 1);
    }
  }
  return doomed.map(f => f.name);
}
