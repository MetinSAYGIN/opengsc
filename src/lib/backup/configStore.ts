// The InstanceSetting half of the backup config (issue #32). Split from config.ts so the pure
// rules stay importable in unit tests without a database. Graceful before any data: a missing
// key or corrupt JSON reads as the defaults, exactly like the domainListStore convention.

import { prisma } from "@/lib/prisma";
import { DEFAULT_BACKUP_CONFIG, mergeBackupConfig, type BackupConfig } from "@/lib/backup/config";

const KEY = "backup_config";
const STATE_KEY = "backup_state";

export async function readBackupConfig(): Promise<BackupConfig> {
  try {
    const row = await prisma.instanceSetting.findUnique({ where: { key: KEY } });
    if (!row) return { ...DEFAULT_BACKUP_CONFIG };
    const parsed = JSON.parse(row.value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { ...DEFAULT_BACKUP_CONFIG };
    // Re-sanitized defensively: the JSON may predate a field or carry a shape this version dropped.
    return mergeBackupConfig(parsed, DEFAULT_BACKUP_CONFIG);
  } catch {
    return { ...DEFAULT_BACKUP_CONFIG };
  }
}

export async function saveBackupConfig(cfg: BackupConfig): Promise<void> {
  await prisma.instanceSetting.upsert({
    where: { key: KEY },
    create: { key: KEY, value: JSON.stringify(cfg) },
    update: { value: JSON.stringify(cfg) },
  });
}

/** Scheduler bookkeeping — the cron high-water, separate from the config so editing the
 *  schedule never resets "when did we last actually run". */
export interface BackupState { lastFireAt: string | null }

export async function readBackupState(): Promise<BackupState> {
  try {
    const row = await prisma.instanceSetting.findUnique({ where: { key: STATE_KEY } });
    const parsed = row ? JSON.parse(row.value) : null;
    const last = parsed && typeof parsed === "object" ? (parsed as BackupState).lastFireAt : null;
    return typeof last === "string" ? { lastFireAt: last } : { lastFireAt: null };
  } catch {
    return { lastFireAt: null };
  }
}

export async function saveBackupState(state: BackupState): Promise<void> {
  await prisma.instanceSetting.upsert({
    where: { key: STATE_KEY },
    create: { key: STATE_KEY, value: JSON.stringify(state) },
    update: { value: JSON.stringify(state) },
  }).catch(() => { /* the next fire re-writes it; losing a high-water only re-runs a backup */ });
}
