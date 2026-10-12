import { NextResponse } from "next/server";
import { workspaceUserId } from "@/lib/team/workspace";
import { prisma } from "@/lib/prisma";
import { mergeBackupConfig, backupConfigView, BackupConfigError } from "@/lib/backup/config";
import { readBackupConfig, saveBackupConfig, readBackupState } from "@/lib/backup/configStore";
import { isBackupRunning } from "@/lib/backup/dump";
import { resolveSqliteDb, listLocalBackups } from "@/lib/backup/artifacts";

// Backups (issue #32) — Settings → Backups. Owner-only like /api/settings/notify-channels:
// the config holds SFTP credentials and the encryption passphrase, and `manageSecrets` is the
// capability the notify-channels route already uses for exactly this kind of secret.
//
//   GET → { engine, backupsDir, dbPath, running, notMigrated, config (masked), state, runs, files }
//   PUT → partial config; secret fields: "" = keep, null = clear (mergeBackupConfig)

export async function GET() {
  const userId = await workspaceUserId("manageSecrets");
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const location = resolveSqliteDb();
  let notMigrated = false;
  let runs: unknown[] = [];
  try {
    runs = await prisma.backupRun.findMany({ orderBy: { startedAt: "desc" }, take: 20 });
  } catch {
    notMigrated = true;
  }

  const cfg = await readBackupConfig();
  return NextResponse.json({
    engine: location ? "sqlite" : "other",
    dbPath: location?.dbPath ?? null,
    backupsDir: location?.backupsDir ?? null,
    running: isBackupRunning(),
    notMigrated,
    config: backupConfigView(cfg),
    state: await readBackupState(),
    runs,
    files: location ? listLocalBackups(location.backupsDir) : [],
  });
}

export async function PUT(req: Request) {
  const userId = await workspaceUserId("manageSecrets");
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  if (!body || typeof body !== "object") return NextResponse.json({ error: "bad_request" }, { status: 400 });
  try {
    const merged = mergeBackupConfig(body as Record<string, unknown>, await readBackupConfig());
    await saveBackupConfig(merged);
    return NextResponse.json({ config: backupConfigView(merged) });
  } catch (e) {
    if (e instanceof BackupConfigError) return NextResponse.json({ error: e.code }, { status: 400 });
    console.warn("[backup] config save failed:", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
