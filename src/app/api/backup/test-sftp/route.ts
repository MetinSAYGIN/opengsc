import { NextResponse } from "next/server";
import { workspaceUserId } from "@/lib/team/workspace";
import { mergeBackupConfig, BackupConfigError } from "@/lib/backup/config";
import { readBackupConfig } from "@/lib/backup/configStore";
import { sftpTest } from "@/lib/backup/sftp";

// POST /api/backup/test-sftp { sftp: partial } — connect, mkdir -p the remote dir, and prove
// it is writable with a write→read→delete probe. The candidate is the form's fields merged
// over the stored config ("" on a secret = keep the stored one), so the button tests exactly
// what saving would store.
//
// The response carries the server's host-key fingerprint (MD5, hex). With nothing pinned the
// test accepts any key and reports it; the UI offers to pin it, after which a different key —
// a wrong or intercepted host — is refused.
export async function POST(req: Request) {
  const userId = await workspaceUserId("manageSecrets");
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const sftp = (body as { sftp?: unknown })?.sftp;
  if (!sftp || typeof sftp !== "object") return NextResponse.json({ error: "bad_request" }, { status: 400 });

  let target;
  try {
    target = mergeBackupConfig({ sftp }, await readBackupConfig()).sftp;
  } catch (e) {
    if (e instanceof BackupConfigError) return NextResponse.json({ error: e.code }, { status: 400 });
    throw e;
  }
  if (!target || !target.host) return NextResponse.json({ error: "bad_sftp_auth" }, { status: 400 });

  const result = await sftpTest(target);
  return NextResponse.json(result);
}
