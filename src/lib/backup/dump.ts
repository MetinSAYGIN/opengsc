// The backup runner (issue #32): one consistent copy of the SQLite database, verified, then
// optionally gzip'd and encrypted, an optional .env companion, local retention, and an
// optional SFTP upload. Shares the backups/ directory with the pre-update copies
// scripts/backup-sqlite.mjs writes, but under disjoint name prefixes (artifacts.ts) so
// neither's retention ever touches the other's files.
//
// The consistent-copy mechanics are the same ones the update script documents at length:
// better-sqlite3's .backup() restarts whenever the source is written to, which on a live
// instance (rank/AEO/Clarity schedulers writing constantly) can loop forever — VACUUM INTO
// takes one read snapshot instead. better-sqlite3 is opened through createRequire like
// prisma.ts does, keeping the native module out of the bundler's graph.

import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { createReadStream, createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";
import type { Readable, Transform } from "node:stream";

import { prisma } from "@/lib/prisma";
import { readBackupConfig } from "@/lib/backup/configStore";
import { opensslEncrypt, openEncryptStream } from "@/lib/backup/crypto";
import { sftpUpload, sftpPrune } from "@/lib/backup/sftp";
import { resolveSqliteDb, backupStamp, listLocalBackups, pickPrunable } from "@/lib/backup/artifacts";
import { NOTIFY_L, normalizeLang } from "@/lib/notifyI18n";
import { getAlertSettings } from "@/lib/alertScheduler";
import { workspaceOwner } from "@/lib/team/owner";
import { notifyUserDetailed } from "@/lib/notify";

const KEEP_RUN_ROWS = 100;

type SqliteDatabase = {
  exec: (sql: string) => void;
  pragma: (source: string, options?: { simple?: boolean }) => unknown;
  close: () => void;
};

function openSqlite(file: string, readonly: boolean): SqliteDatabase {
  const Database = createRequire(import.meta.url)("better-sqlite3");
  return new Database(file, readonly
    ? { readonly: true, fileMustExist: true, timeout: 15_000 }
    : { fileMustExist: true, timeout: 15_000 }) as SqliteDatabase;
}

// ─── The runner ───────────────────────────────────────────────────────────────

export interface RunBackupResult {
  status: "success" | "failed" | "skipped";
  skipped?: "not_sqlite" | "no_database" | "already_running";
  runId?: string;
  fileName?: string;
  sizeBytes?: number;
  uploaded?: boolean;
  uploadError?: string;
  error?: string;
}

let inFlight: Promise<RunBackupResult> | null = null;
export function isBackupRunning(): boolean { return inFlight !== null; }

/**
 * Streamed gzip/encryption pipeline. Everything before it (VACUUM INTO) already wrote a raw
 * .db next to the final artifact; this walks it through the suffix chain and removes the
 * intermediate, so a crash mid-transform leaves the previous backup plus a partial that the
 * next run's own naming (fresh stamp) never collides with.
 */
async function transformArtifact(rawPath: string, finalPath: string, compress: boolean, passphrase: string): Promise<void> {
  const stages: (Readable | Transform)[] = [createReadStream(rawPath)];
  if (compress) stages.push(createGzip({ level: 6 }));
  const sink = createWriteStream(finalPath, { mode: 0o600 });
  if (passphrase) {
    const { header, cipher } = openEncryptStream(passphrase);
    // The salt header is written before the pipeline starts; streams preserve write order, so
    // the ciphertext lands strictly after it.
    sink.write(header);
    stages.push(cipher as unknown as Transform);
  }
  // pipeline's array overload wants Duplex pairs; what is built here is a Readable source,
  // zero-or-more Transforms, one sink — sound by construction. The cast states exactly that.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (pipeline as any)(...stages, sink);
}

async function writeEnvArtifact(dir: string, stamp: string, passphrase: string): Promise<string | null> {
  const envPath = path.join(process.cwd(), ".env");
  let content: Buffer;
  try {
    content = fs.readFileSync(envPath);
  } catch {
    return null; // no .env next to the app — nothing to copy, not an error
  }
  const name = `opengsc-env-${stamp}.env${passphrase ? ".enc" : ""}`;
  const data = passphrase ? opensslEncrypt(content, passphrase) : content;
  fs.writeFileSync(path.join(dir, name), data, { mode: 0o600 });
  return name;
}

async function pruneRunRows(): Promise<void> {
  try {
    const keep = await prisma.backupRun.findMany({
      orderBy: { startedAt: "desc" },
      take: KEEP_RUN_ROWS,
      select: { startedAt: true },
    });
    if (keep.length === KEEP_RUN_ROWS) {
      await prisma.backupRun.deleteMany({ where: { startedAt: { lt: keep[KEEP_RUN_ROWS - 1]!.startedAt } } });
    }
  } catch { /* the row table is housekeeping, not the backup */ }
}

/**
 * Scheduled-run failures go to the owner's notification channels under the "backup" event,
 * in the language the owner picked for alerts (the testChannel convention). A failed
 * notification must never fail the backup run, hence the blanket catch.
 */
async function notifyOwner(kind: "failed" | "upload_failed", error: string, file?: string): Promise<void> {
  try {
    const owner = await workspaceOwner();
    if (!owner) return;
    const lang = normalizeLang((await getAlertSettings(owner.id)).lang);
    const L = NOTIFY_L[lang];
    const when = new Date().toISOString().slice(0, 19).replace("T", " ");
    const title = kind === "failed" ? L.backupFailedTitle : L.backupUploadFailedTitle;
    const text = kind === "failed"
      ? L.backupFailedMsg(when, error)
      : L.backupUploadFailedMsg(when, file ?? "", error);
    await notifyUserDetailed(owner.id, text, { event: "backup", title });
  } catch { /* see above */ }
}

/**
 * Run one backup now. Single-flight: the scheduled tick and the manual button share this entry
 * point, and two concurrent VACUUM INTO copies of the same database are twice the disk for
 * nothing. Throws nothing — every failure is in the result and on the BackupRun row.
 */
export function runBackup(kind: "scheduled" | "manual"): Promise<RunBackupResult> {
  if (inFlight) return Promise.resolve({ status: "skipped", skipped: "already_running" });

  const run = (async (): Promise<RunBackupResult> => {
    const location = resolveSqliteDb();
    if (!location) return { status: "skipped", skipped: "not_sqlite" };
    const { dbPath, backupsDir } = location;
    if (!fs.existsSync(dbPath)) return { status: "skipped", skipped: "no_database" };

    const cfg = await readBackupConfig();
    const stamp = backupStamp();
    const rawName = `opengsc-${kind}-${stamp}.db`;
    const rawPath = path.join(backupsDir, rawName);
    const startedAt = Date.now();

    // The row is bookkeeping: a table that predates `db push` (or a prisma hiccup) must not
    // stop the actual backup. Written best-effort throughout.
    let runId: string | undefined;
    try {
      const row = await prisma.backupRun.create({ data: { kind, status: "running" } });
      runId = row.id;
    } catch { /* see above */ }

    const finishRow = async (patch: Record<string, unknown>) => {
      if (!runId) return;
      try {
        await prisma.backupRun.update({ where: { id: runId }, data: { finishedAt: new Date(), durationMs: Date.now() - startedAt, ...patch } });
      } catch { /* see above */ }
    };

    try {
      fs.mkdirSync(backupsDir, { recursive: true, mode: 0o700 });

      // 1 — consistent copy of the live database (see the module comment for why VACUUM INTO).
      //    If it cannot run, the fallback is the update script's last resort: copy the file
      //    together with its WAL sidecars, main file first — the pair replays to a consistent
      //    state on open. Slower than useless on a busy base, but VACUUM INTO failing at all
      //    is the exotic case, and no daily backups at all is the alternative.
      let method = "vacuum";
      try {
        const source = openSqlite(dbPath, false);
        try {
          source.exec(`VACUUM INTO '${rawPath.replace(/'/g, "''")}'`);
        } finally {
          source.close();
        }
      } catch (vacuumError) {
        console.warn(`[backup] VACUUM INTO failed (${(vacuumError as Error)?.message ?? vacuumError}) — falling back to a file copy`);
        fs.rmSync(rawPath, { force: true });
        method = "copy";
        fs.copyFileSync(dbPath, rawPath);
        for (const suffix of ["-wal", "-shm"]) {
          if (fs.existsSync(dbPath + suffix)) fs.copyFileSync(dbPath + suffix, rawPath + suffix);
        }
        // Replay the copied WAL into the copy: a checkpoint on this private file turns the
        // main .db into a complete standalone database, so dropping the sidecars below loses
        // nothing and the verification opens a finished file, not a pair.
        const checkpoint = openSqlite(rawPath, false);
        try {
          checkpoint.pragma("wal_checkpoint(TRUNCATE)");
        } finally {
          checkpoint.close();
        }
      }

      // 2 — a copy that cannot be opened is not a backup. On a copy-method artifact the WAL
      //    sidecars replay during this open; integrity_check then sees the same database the
      //    app sees. The sidecars are dropped after the transform (step 3), which produces a
      //    single standalone file.
      const verify = openSqlite(rawPath, true);
      try {
        const result = verify.pragma("integrity_check", { simple: true });
        if (result !== "ok") throw new Error(`integrity_check returned ${String(result)}`);
      } finally {
        verify.close();
      }

      // 3 — compress/encrypt into the final name and drop the raw intermediate (and the copy
      //     method's WAL sidecars — the transformed artifact is one standalone file).
      let finalName = rawName;
      if (cfg.compress || cfg.passphrase) {
        const suffix = `${cfg.compress ? ".gz" : ""}${cfg.passphrase ? ".enc" : ""}`;
        finalName = `opengsc-${kind}-${stamp}.db${suffix}`;
        await transformArtifact(rawPath, path.join(backupsDir, finalName), cfg.compress, cfg.passphrase);
        fs.rmSync(rawPath, { force: true });
      } else {
        fs.chmodSync(rawPath, 0o600);
      }
      for (const suffix of ["-wal", "-shm", "-journal"]) fs.rmSync(rawPath + suffix, { force: true });
      const finalPath = path.join(backupsDir, finalName);
      const sizeBytes = fs.statSync(finalPath).size;

      // 4 — the .env companion. Uploaded only when encrypted: an offsite plaintext .env is
      // every secret in the instance in one file, and transport encryption is not rest encryption.
      let envName: string | null = null;
      if (cfg.includeEnv) envName = await writeEnvArtifact(backupsDir, stamp, cfg.passphrase);

      // 5 — local retention, after the new backup exists (pruning first could end with zero).
      const files = listLocalBackups(backupsDir).map(f => ({ name: f.name, mtimeMs: f.mtimeMs }));
      for (const name of pickPrunable(files, Date.now(), cfg.retentionDays)) {
        fs.rmSync(path.join(backupsDir, name), { force: true });
      }

      // 6 — offsite copy. A local success with a failed upload is a success the operator must
      // hear about, not a failed run — the row records it separately from the status.
      let uploaded = false;
      let uploadError = "";
      if (cfg.sftp && cfg.sftp.host) {
        try {
          await sftpUpload(cfg.sftp, finalPath, finalName);
          if (envName && cfg.passphrase) await sftpUpload(cfg.sftp, path.join(backupsDir, envName), envName);
          uploaded = true;
          const cutoff = Date.now() - cfg.retentionDays * 24 * 60 * 60_000;
          await sftpPrune(cfg.sftp, cutoff, ["opengsc-scheduled-", "opengsc-manual-"]);
        } catch (e) {
          uploadError = String((e as Error)?.message ?? e).slice(0, 500);
        }
      }

      await finishRow({
        status: "success", method, sizeBytes, fileName: finalName, uploaded, uploadError,
      });
      await pruneRunRows();

      if (kind === "scheduled" && uploadError) {
        await notifyOwner("upload_failed", uploadError, finalName);
      }
      return { status: "success", runId, fileName: finalName, sizeBytes, uploaded, uploadError: uploadError || undefined };
    } catch (e) {
      const error = String((e as Error)?.message ?? e).slice(0, 500);
      // A half-written artifact is disk for nothing; the raw .db too if the transform died.
      for (const name of fs.existsSync(backupsDir) ? fs.readdirSync(backupsDir) : []) {
        if (name.includes(stamp)) fs.rmSync(path.join(backupsDir, name), { force: true });
      }
      await finishRow({ status: "failed", error });
      if (kind === "scheduled") {
        await notifyOwner("failed", error);
      }
      return { status: "failed", runId, error };
    }
  })();

  inFlight = run.finally(() => { inFlight = null; });
  return inFlight;
}
