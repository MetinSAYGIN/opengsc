// SFTP destination for scheduled backups (issue #32) — the user's own NAS or another server.
// ssh2 is loaded through createRequire (the mariadb-adapter convention in prisma.ts): the
// bundler must not try to resolve a package with runtime-optional native pieces, and the
// scheduler runs inside the Next server process, not in a bundled chunk.
//
// Errors come back as { ok: false, error } strings rather than exceptions — the backup runner
// records them on the run row and the Settings card shows them verbatim.

import { createRequire } from "node:module";
import type { Client, SFTPWrapper } from "ssh2";
import type { BackupSftpConfig } from "@/lib/backup/config";

const READY_TIMEOUT_MS = 15_000;
const OP_TIMEOUT_MS = 60_000;

type Ssh2Module = typeof import("ssh2");
let ssh2: Ssh2Module | null = null;
function load(): Ssh2Module {
  if (!ssh2) ssh2 = createRequire(import.meta.url)("ssh2") as Ssh2Module;
  return ssh2;
}

function fingerprintHex(md5Colon: string): string {
  return md5Colon.replace(/:/g, "").toLowerCase();
}

interface SftpSession { conn: Client; sftp: SFTPWrapper; fingerprint: string }

function openSession(target: BackupSftpConfig): Promise<SftpSession> {
  return new Promise((resolve, reject) => {
    let conn: Client;
    try {
      conn = new (load().Client)();
    } catch (e) {
      reject(new Error(`ssh2 could not be loaded: ${(e as Error)?.message ?? e}`));
      return;
    }

    // Host-key pinning: when a fingerprint is stored (captured by the Test button), a different
    // key is a wrong or intercepted host and the connection is refused. Without one, any key is
    // accepted and the presented fingerprint is reported back so the operator can pin it.
    let presented = "";
    const pinned = target.hostKeyFingerprint;
    const hostVerifier = (hashedKey: string) => {
      presented = fingerprintHex(hashedKey);
      return !pinned || presented === pinned;
    };

    conn.on("error", err => { conn.end(); reject(new Error(sshErrorMessage(err))); });
    conn.on("ready", () => {
      conn.sftp((err, sftp) => {
        if (err) { conn.end(); reject(new Error(`sftp channel: ${sshErrorMessage(err)}`)); return; }
        resolve({ conn, sftp, fingerprint: presented });
      });
    });
    conn.connect({
      host: target.host,
      port: target.port,
      username: target.user,
      ...(target.password ? { password: target.password } : {}),
      ...(target.privateKey ? { privateKey: target.privateKey, ...(target.passphrase ? { passphrase: target.passphrase } : {}) } : {}),
      readyTimeout: READY_TIMEOUT_MS,
      keepaliveInterval: 0,
      hostHash: "md5" as const,
      hostVerifier,
    });
  });
}

/** ssh2's ErrorLevel errors carry a .message like "Connect: Timed out while waiting for handshake". */
function sshErrorMessage(err: unknown): string {
  return String((err as Error)?.message ?? err).slice(0, 300);
}

function withTimeout<T>(p: Promise<T>, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${what}: timed out after ${OP_TIMEOUT_MS / 1000}s`)), OP_TIMEOUT_MS);
    p.then(v => { clearTimeout(timer); resolve(v); }, e => { clearTimeout(timer); reject(e); });
  });
}

function mkdirp(sftp: SFTPWrapper, dir: string): Promise<void> {
  const segments = dir.split("/").filter(Boolean);
  let current = dir.startsWith("/") ? "" : ".";
  return segments.reduce(
    (chain, segment) => chain.then(() => new Promise<void>(resolve => {
      current = `${current}/${segment}`;
      // Every mkdir error is swallowed, EEXIST included — a segment we lack mkdir rights on may
      // still be a perfectly writable directory, and the upload that follows fails loudly if not.
      sftp.mkdir(current, () => resolve());
    })),
    Promise.resolve(),
  );
}

/** Upload one local file into the configured remoteDir as remoteName (mode 600). */
export async function sftpUpload(target: BackupSftpConfig, localPath: string, remoteName: string): Promise<void> {
  const { conn, sftp } = await openSession(target);
  try {
    await mkdirp(sftp, target.remoteDir);
    const remote = `${target.remoteDir.replace(/\/+$/, "")}/${remoteName}`;
    await withTimeout(new Promise<void>((resolve, reject) => {
      sftp.fastPut(localPath, remote, { mode: 0o600 }, err => err ? reject(new Error(`upload: ${sshErrorMessage(err)}`)) : resolve());
    }), `upload ${remoteName}`);
    // chmod best-effort: some servers ignore the mode passed to fastPut.
    await new Promise<void>(resolve => sftp.chmod(remote, 0o600, () => resolve()));
  } finally {
    conn.end();
  }
}

export interface SftpTestResult { ok: boolean; error?: string; fingerprint?: string }

/** Connect, create the remote dir, and prove it is writable with a write→read→delete probe. */
export async function sftpTest(target: BackupSftpConfig): Promise<SftpTestResult> {
  let session: SftpSession;
  try {
    session = await openSession(target);
  } catch (e) {
    return { ok: false, error: sshErrorMessage(e) };
  }
  const { conn, sftp, fingerprint } = session;
  try {
    await mkdirp(sftp, target.remoteDir);
    const remote = `${target.remoteDir.replace(/\/+$/, "")}/.opengsc-backup-test`;
    const probe = `opengsc-sftp-test ${Date.now()}\n`;
    await withTimeout(new Promise<void>((resolve, reject) => {
      const stream = sftp.createWriteStream(remote, { mode: 0o600 });
      stream.on("error", (e: Error) => reject(new Error(`write probe: ${sshErrorMessage(e)}`)));
      stream.on("close", () => resolve());
      stream.end(probe);
    }), "write probe");
    await withTimeout(new Promise<void>((resolve, reject) => {
      let body = "";
      const stream = sftp.createReadStream(remote);
      stream.on("error", (e: Error) => reject(new Error(`read probe: ${sshErrorMessage(e)}`)));
      stream.on("data", (chunk: Buffer) => { body += chunk.toString("utf8"); });
      stream.on("end", () => body.startsWith("opengsc-sftp-test") ? resolve() : reject(new Error("read probe: content mismatch")));
    }), "read probe");
    await withTimeout(new Promise<void>((resolve, reject) => {
      sftp.unlink(remote, err => err ? reject(new Error(`cleanup: ${sshErrorMessage(err)}`)) : resolve());
    }), "cleanup probe");
    return { ok: true, fingerprint };
  } catch (e) {
    return { ok: false, error: sshErrorMessage(e), fingerprint };
  } finally {
    conn.end();
  }
}

export interface RemoteFile { name: string; mtimeMs: number }

/** Delete our own backup files older than the cutoff in the remoteDir. Best-effort by design:
 *  a remote prune failure must never mark an otherwise good backup run as failed. */
export async function sftpPrune(target: BackupSftpConfig, cutoffMs: number, keepNewestOfPrefixes: string[]): Promise<void> {
  const { conn, sftp } = await openSession(target);
  try {
    const entries = await withTimeout(new Promise<{ filename: string; attrs: { mtime: number } }[]>((resolve, reject) => {
      sftp.readdir(target.remoteDir, (err, list) => err ? reject(err) : resolve(list as { filename: string; attrs: { mtime: number } }[]));
    }), "readdir");
    const ours = entries
      .map(e => ({ name: e.filename, mtimeMs: e.attrs.mtime * 1000 }))
      .filter(f => /^opengsc-(scheduled|manual|env)-/.test(f.name));
    const doomed = ours.filter(f => f.mtimeMs < cutoffMs);
    // The newest file of each protected prefix always survives, even past retention — the
    // same guarantee the local prune gives ("a retention window must never end with zero").
    for (const prefix of keepNewestOfPrefixes) {
      const newest = ours.filter(f => f.name.startsWith(prefix)).sort((a, b) => b.mtimeMs - a.mtimeMs)[0];
      if (newest) {
        const i = doomed.findIndex(f => f.name === newest.name);
        if (i >= 0) doomed.splice(i, 1);
      }
    }
    for (const f of doomed) {
      await new Promise<void>(resolve => sftp.unlink(`${target.remoteDir.replace(/\/+$/, "")}/${f.name}`, () => resolve()));
    }
  } catch {
    // Prune is housekeeping; report nothing and fail nothing.
  } finally {
    conn.end();
  }
}
