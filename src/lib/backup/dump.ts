// The backup runner (issue #32): one consistent copy of the SQLite database, verified, then
// optionally gzip'd and encrypted, an optional .env companion, local retention, and an
// optional SFTP upload. Shares the backups/ directory with the pre-update copies
// scripts/backup-sqlite.mjs writes, but under disjoint name prefixes (artifacts.ts) so
// neither's retention ever touches the other's files.
//
// Blocking work stays out of the Next server thread: VACUUM INTO and integrity_check are
// synchronous in better-sqlite3, and on a few-hundred-MB production database they freeze the
// web app and every scheduler for their whole runtime — so they run inside a worker thread
// (the update script enjoys the same isolation by being its own process). The gzip/encrypt
// stage was already streamed; the worker finishes the job.
//
// The consistent-copy mechanics are the same ones the update script documents at length:
// better-sqlite3's .backup() restarts whenever the source is written to, which on a live
// instance (rank/AEO/Clarity schedulers writing constantly) can loop forever — VACUUM INTO
// takes one read snapshot instead. better-sqlite3 is resolved through createRequire like
// prisma.ts does, keeping the native module out of the bundler's graph.

import { createRequire } from "node:module";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { createReadStream, createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";
import { Worker } from "node:worker_threads";
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
/** Same hard ceiling the update script gives its backup step. Applies per sqlite operation. */
const SQLITE_OP_TIMEOUT_MS = 600_000;

// ─── SQLite work, off the server thread ──────────────────────────────────────

type SqliteOp = "vacuum" | "verify" | "checkpoint";

/**
 * Eval'd worker source. Runs as CommonJS, so `require` resolves the absolutely-passed
 * better-sqlite3 (resolved by the parent — an eval worker has no meaningful module dir).
 * Three operations, one thread:
 *   vacuum     — VACUUM INTO a fresh rawPath from the live database (read snapshot)
 *   verify     — integrity_check on a finished copy; a copy that cannot be opened is not a backup
 *   checkpoint — replay a copied -wal into a copied .db so it is a standalone file
 */
const WORKER_SOURCE = `
const { parentPort, workerData } = require("node:worker_threads");
const Database = require(workerData.betterSqlitePath);
try {
  if (workerData.op === "vacuum") {
    const src = new Database(workerData.dbPath, { fileMustExist: true, timeout: 15000 });
    try { src.exec(workerData.sql); } finally { src.close(); }
  } else if (workerData.op === "verify") {
    const copy = new Database(workerData.rawPath, { readonly: true, fileMustExist: true, timeout: 15000 });
    try {
      const result = copy.pragma("integrity_check", { simple: true });
      if (result !== "ok") throw new Error("integrity_check returned " + result);
    } finally { copy.close(); }
  } else if (workerData.op === "checkpoint") {
    const db = new Database(workerData.rawPath, { fileMustExist: true, timeout: 15000 });
    try { db.pragma("wal_checkpoint(TRUNCATE)"); } finally { db.close(); }
  } else {
    throw new Error("unknown op " + workerData.op);
  }
  parentPort.postMessage({ ok: true });
} catch (e) {
  parentPort.postMessage({ ok: false, error: String((e && e.message) || e) });
}
`;

function betterSqlitePath(): string {
  return createRequire(import.meta.url).resolve("better-sqlite3");
}

function runSqliteOp(op: SqliteOp, data: { dbPath?: string; rawPath?: string; sql?: string }): Promise<void> {
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(WORKER_SOURCE, {
        eval: true,
        workerData: { op, betterSqlitePath: betterSqlitePath(), ...data },
      });
    } catch (e) {
      reject(e);
      return;
    }
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      void worker.terminate();
      reject(new Error(`${op}: timed out after ${SQLITE_OP_TIMEOUT_MS / 1000}s`));
    }, SQLITE_OP_TIMEOUT_MS);
    worker.on("message", (m: { ok: boolean; error?: string }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      void worker.terminate();
      if (m.ok) resolve();
      else reject(new Error(`${op}: ${m.error}`));
    });
    worker.on("error", e => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(e instanceof Error ? e : new Error(String(e)));
    });
    // A crash exit without a message (OOM-kill of the thread, abort) must not hang us.
    worker.on("exit", code => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error(`${op}: worker exited with code ${code}`));
    });
  });
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

/** Free bytes on the volume holding `dir`, or null where statfs is unavailable. */
function freeBytes(dir: string): number | null {
  try {
    const stats = fs.statfsSync(dir);
    return stats.bavail * stats.bsize;
  } catch {
    return null;
  }
}

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

/** Remove this run's half-written artifacts — and only this run's: the filter is the module's
 *  own prefixes plus this stamp, so a pre-update backup written in the same second survives. */
function cleanupFailedRun(backupsDir: string, stamp: string, rawPath: string): void {
  fs.rmSync(rawPath, { force: true });
  for (const suffix of ["-wal", "-shm", "-journal"]) fs.rmSync(rawPath + suffix, { force: true });
  try {
    for (const name of fs.readdirSync(backupsDir)) {
      if (/^opengsc-(scheduled|manual|env)-/.test(name) && name.includes(stamp)) {
        fs.rmSync(path.join(backupsDir, name), { force: true });
      }
    }
  } catch { /* nothing to sweep */ }
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

      // 0 — room first, learned the hard way (2026-09-22: ~50 kept backups filled a 33 GB
      //     disk and the next update could not back up at all). The raw dump and the
      //     transformed artifact coexist mid-run, so the need is roughly 2× the database.
      //     Not enough → prune everything of ours past the newest per kind and re-check;
      //     still not enough → fail before writing anything, database untouched.
      const dbSize = fs.statSync(dbPath).size;
      const walSize = fs.existsSync(dbPath + "-wal") ? fs.statSync(dbPath + "-wal").size : 0;
      const needed = (dbSize + walSize) * 2;
      let free = freeBytes(backupsDir);
      if (free !== null && free < needed) {
        for (const name of pickPrunable(listLocalBackups(backupsDir), Date.now(), 0)) {
          fs.rmSync(path.join(backupsDir, name), { force: true });
        }
        free = freeBytes(backupsDir);
        if (free !== null && free < needed) {
          throw new Error(`not enough disk space: ${Math.round(free / 1048576)} MB free after pruning, ${Math.round(needed / 1048576)} MB needed (database + artifact) — free space on the volume`);
        }
      }

      // 1 — consistent copy of the live database (see the module comment for why VACUUM INTO),
      //     in the worker. If it cannot run, the fallback is the update script's last resort:
      //     copy the file together with its WAL sidecars (async — copyFile runs on the
      //     threadpool) and checkpoint the replay in the worker, which makes the copy a
      //     standalone database.
      let method = "vacuum";
      try {
        await runSqliteOp("vacuum", { dbPath, sql: `VACUUM INTO '${rawPath.replace(/'/g, "''")}'` });
      } catch (vacuumError) {
        console.warn(`[backup] VACUUM INTO failed (${(vacuumError as Error)?.message ?? vacuumError}) — falling back to a file copy`);
        fs.rmSync(rawPath, { force: true });
        method = "copy";
        await fsp.copyFile(dbPath, rawPath);
        for (const suffix of ["-wal", "-shm"]) {
          if (fs.existsSync(dbPath + suffix)) await fsp.copyFile(dbPath + suffix, rawPath + suffix);
        }
        await runSqliteOp("checkpoint", { rawPath });
      }

      // 2 — a copy that cannot be opened is not a backup.
      await runSqliteOp("verify", { rawPath });

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

      // 6 — offsite copy. Two gates before any byte leaves the server, both review findings:
      //     the destination's host key must be pinned (Test connection does it — an unpinned
      //     nightly upload would hand the SFTP password to any man in the middle), and the
      //     artifact must be encrypted (the database stores SMTP passwords, provider keys and
      //     this very SFTP config — it is at least as sensitive as the .env). A local success
      //     with a skipped/failed upload is a success the operator must hear about, not a
      //     failed run — the row records it separately from the status.
      let uploaded = false;
      let uploadError = "";
      if (cfg.sftp && cfg.sftp.host) {
        if (!cfg.sftp.hostKeyFingerprint) {
          uploadError = "host key not pinned — open Settings → Backups, run Test connection and let it pin the server's fingerprint";
        } else if (!cfg.passphrase) {
          uploadError = "backups are uploaded only when encrypted — set a passphrase in Settings → Backups (the database holds every secret of this instance)";
        } else {
          try {
            await sftpUpload(cfg.sftp, finalPath, finalName, sizeBytes);
            if (envName && cfg.passphrase) {
              await sftpUpload(cfg.sftp, path.join(backupsDir, envName), envName, fs.statSync(path.join(backupsDir, envName)).size);
            }
            uploaded = true;
            const cutoff = Date.now() - cfg.retentionDays * 24 * 60 * 60_000;
            await sftpPrune(cfg.sftp, cutoff, ["opengsc-scheduled-", "opengsc-manual-"]);
          } catch (e) {
            uploadError = String((e as Error)?.message ?? e).slice(0, 500);
          }
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
      cleanupFailedRun(backupsDir, stamp, rawPath);
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
