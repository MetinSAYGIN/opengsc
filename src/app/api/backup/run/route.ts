import { NextResponse } from "next/server";
import { workspaceUserId } from "@/lib/team/workspace";
import { runBackup, isBackupRunning } from "@/lib/backup/dump";
import { resolveSqliteDb } from "@/lib/backup/artifacts";

// POST /api/backup/run — the "Back up now" button. Fire-and-forget: a real backup of a large
// database takes minutes (VACUUM INTO + gzip), far past any sensible HTTP timeout, and the
// runner is single-flight — the button polls GET /api/backup and watches the running row.
export async function POST() {
  const userId = await workspaceUserId("manageSecrets");
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (!resolveSqliteDb()) return NextResponse.json({ error: "not_sqlite" }, { status: 400 });
  if (isBackupRunning()) return NextResponse.json({ error: "already_running" }, { status: 409 });

  void runBackup("manual");
  return NextResponse.json({ started: true });
}
