// Issue #32 — configuration for scheduled backups. This module is the pure half (types,
// sanitizing, the masked view); the InstanceSetting read/write lives in configStore.ts so the
// unit tests can import the rules without a database. Same JSON-key convention as
// aeo_domain_lists (domainListStore.ts): instance-wide, edited from Settings without a deploy.
//
// Secrets (SFTP password/key/passphrase, the encryption passphrase) are stored as plain JSON in
// the database — the exact threat model the notification channels already have (SMTP passwords
// in User.notifyChannels). The GET route replaces them with a mask; on save, `""` keeps the
// stored value (notify-channels convention) and `null` clears it.

import { validateCron } from "@/lib/cron";

export interface BackupSftpConfig {
  host: string;
  port: number;
  user: string;
  password: string;   // "" = none
  privateKey: string; // PEM text, "" = none
  passphrase: string; // for the private key, "" = none
  remoteDir: string;  // relative to the SFTP login dir, or absolute
  /** MD5 fingerprint of the host key, pinned after the first Test connection. "" = accept any. */
  hostKeyFingerprint: string;
}

export interface BackupConfig {
  enabled: boolean;
  /** 5-field cron in UTC (cron.ts matcher) — "0 3 * * *" by default. */
  schedule: string;
  retentionDays: number;
  compress: boolean;
  /** AES-256-CBC (openssl enc-compatible) passphrase; "" = no encryption. */
  passphrase: string;
  /** Also copy .env (and upload it — only when encryption is on). */
  includeEnv: boolean;
  sftp: BackupSftpConfig | null;
}

export interface BackupConfigView {
  enabled: boolean;
  schedule: string;
  retentionDays: number;
  compress: boolean;
  passphraseSet: boolean;
  includeEnv: boolean;
  sftp: Omit<BackupSftpConfig, "password" | "privateKey" | "passphrase"> & {
    passwordSet: boolean;
    privateKeySet: boolean;
    keyPassphraseSet: boolean;
  } | null;
}

/** Sentinel the GET route returns for every stored secret; a save echoes it back untouched. */
export const SECRET_MASK = "••••••••";

export const DEFAULT_BACKUP_CONFIG: BackupConfig = {
  enabled: false,
  schedule: "0 3 * * *",
  retentionDays: 14,
  compress: true,
  passphrase: "",
  includeEnv: true,
  sftp: null,
};

/** Coded validation failure → { error: code } with 400, like ChannelError in notify/channels. */
export class BackupConfigError extends Error {
  constructor(public readonly code: string) { super(code); }
}

// ─── Sanitizing ───────────────────────────────────────────────────────────────

/** One-line string: trimmed, no control characters, capped. */
function cleanLine(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  const out = value.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return out.slice(0, max);
}

function cleanMultiline(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  // A pasted PEM keeps its newlines; \r and control chars other than \n still go.
  return value.replace(/\r/g, "").replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, "").trim().slice(0, max);
}

function sanitizeRemoteDir(value: unknown): string {
  const dir = cleanLine(value, 256);
  if (!dir) return "opengsc-backups";
  if (dir.startsWith("~")) throw new BackupConfigError("bad_remote_dir");
  if (dir.split("/").includes("..")) throw new BackupConfigError("bad_remote_dir");
  if (!/^\/?[A-Za-z0-9._\-/]+$/.test(dir)) throw new BackupConfigError("bad_remote_dir");
  return dir.replace(/\/+/g, "/");
}

/**
 * Merge a partial config (Settings PUT or the SFTP test form) over `current`.
 * Secret fields: `""` = keep stored, `null` = clear, any other string = set. The whole sftp
 * object set to null clears the destination. Returns the full sanitized config.
 */
export function mergeBackupConfig(raw: Record<string, unknown>, current: BackupConfig): BackupConfig {
  const out: BackupConfig = { ...current, sftp: current.sftp ? { ...current.sftp } : null };

  if (typeof raw.enabled === "boolean") out.enabled = raw.enabled;
  if (typeof raw.compress === "boolean") out.compress = raw.compress;
  if (typeof raw.includeEnv === "boolean") out.includeEnv = raw.includeEnv;

  if (raw.schedule !== undefined) {
    const schedule = cleanLine(raw.schedule, 100);
    const problem = validateCron(schedule);
    if (problem) throw new BackupConfigError("bad_schedule");
    out.schedule = schedule;
  }

  if (raw.retentionDays !== undefined) {
    const days = Number(raw.retentionDays);
    if (!Number.isInteger(days) || days < 1 || days > 90) throw new BackupConfigError("bad_retention");
    out.retentionDays = days;
  }

  if (raw.passphrase !== undefined) {
    if (raw.passphrase === null) out.passphrase = "";
    // "" (an untouched form field) and the mask both mean "keep the stored value"; null is the
    // only way to clear, any other string sets.
    else if (typeof raw.passphrase === "string" && raw.passphrase !== "" && raw.passphrase !== SECRET_MASK) {
      const pass = raw.passphrase.trim();
      if (pass && pass.length < 8) throw new BackupConfigError("short_passphrase");
      out.passphrase = pass;
    }
  }

  if (raw.sftp === null) {
    out.sftp = null;
  } else if (raw.sftp && typeof raw.sftp === "object") {
    const s = raw.sftp as Record<string, unknown>;
    const base: BackupSftpConfig = out.sftp ?? {
      host: "", port: 22, user: "", password: "", privateKey: "", passphrase: "",
      remoteDir: "opengsc-backups", hostKeyFingerprint: "",
    };
    const next: BackupSftpConfig = { ...base };
    if (s.host !== undefined) next.host = cleanLine(s.host, 255).toLowerCase();
    if (s.user !== undefined) next.user = cleanLine(s.user, 64);
    if (s.remoteDir !== undefined) next.remoteDir = sanitizeRemoteDir(s.remoteDir);
    if (s.hostKeyFingerprint !== undefined) {
      // Canonical form: "SHA256:" + unpadded base64 — byte-identical to `ssh-keygen -lf`,
      // so an operator can read a fingerprint off their server and paste it as-is. The
      // prefix is added when missing; anything that isn't base64 (old MD5 hex, junk) is
      // refused rather than silently stored as an unpinnable value. Unlike the secrets, an
      // empty string CLEARS: the field always echoes the stored value, and the card empties
      // it when host/port are edited — so "Save without Test" stores an unpinned destination
      // the runner reports honestly, instead of pinning the old host's key onto the new one.
      let fp = cleanLine(s.hostKeyFingerprint, 100);
      if (fp) {
        fp = fp.replace(/^sha256:/i, "SHA256:");
        if (!/^SHA256:/.test(fp)) fp = `SHA256:${fp}`;
        if (!/^SHA256:[A-Za-z0-9+/]+$/.test(fp)) throw new BackupConfigError("bad_fingerprint");
      }
      next.hostKeyFingerprint = fp;
    }

    // A fingerprint vouches for exactly one host:port. When either changes and the caller
    // did not send a new fingerprint, the old one must not survive — it would refuse the new
    // server on every later Test ("wrong host key") or, worse, be trusted to vouch for it.
    // Evaluated after both assignments, so a port change is seen here too.
    if (s.port !== undefined) {
      const port = Number(s.port);
      if (!Number.isInteger(port) || port < 1 || port > 65535) throw new BackupConfigError("bad_port");
      next.port = port;
    }
    const hostOrPortChanged =
      (s.host !== undefined && next.host !== base.host) ||
      (s.port !== undefined && next.port !== base.port);
    if (hostOrPortChanged && s.hostKeyFingerprint === undefined) next.hostKeyFingerprint = "";
    // Nested secrets: "" / mask = keep, null = clear, other string = set (same contract as
    // the passphrase above).
    if (s.password !== undefined) {
      if (s.password === null) next.password = "";
      else if (typeof s.password === "string" && s.password !== "" && s.password !== SECRET_MASK) {
        next.password = s.password.trim().slice(0, 256);
      }
    }
    if (s.passphrase !== undefined) {
      if (s.passphrase === null) next.passphrase = "";
      else if (typeof s.passphrase === "string" && s.passphrase !== "" && s.passphrase !== SECRET_MASK) {
        next.passphrase = s.passphrase.trim().slice(0, 256);
      }
    }
    if (s.privateKey !== undefined) {
      if (s.privateKey === null) next.privateKey = "";
      else if (typeof s.privateKey === "string" && s.privateKey !== "" && s.privateKey !== SECRET_MASK) {
        const key = cleanMultiline(s.privateKey, 64 * 1024);
        if (key && !key.includes("PRIVATE KEY")) throw new BackupConfigError("bad_private_key");
        next.privateKey = key;
      }
    }

    // A destination that could never authenticate is rejected at save time — the nightly run
    // should not be the place the operator learns the config is incomplete.
    if (next.host && !next.user) throw new BackupConfigError("bad_sftp_user");
    if (next.host && !next.password && !next.privateKey) throw new BackupConfigError("bad_sftp_auth");
    out.sftp = next.host ? next : null;
  }

  return out;
}

export function backupConfigView(cfg: BackupConfig): BackupConfigView {
  return {
    enabled: cfg.enabled,
    schedule: cfg.schedule,
    retentionDays: cfg.retentionDays,
    compress: cfg.compress,
    passphraseSet: !!cfg.passphrase,
    includeEnv: cfg.includeEnv,
    sftp: cfg.sftp ? {
      host: cfg.sftp.host, port: cfg.sftp.port, user: cfg.sftp.user,
      remoteDir: cfg.sftp.remoteDir, hostKeyFingerprint: cfg.sftp.hostKeyFingerprint,
      passwordSet: !!cfg.sftp.password,
      privateKeySet: !!cfg.sftp.privateKey,
      keyPassphraseSet: !!cfg.sftp.passphrase,
    } : null,
  };
}
