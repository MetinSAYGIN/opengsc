import { NextResponse } from "next/server";
import { workspaceUserId } from "@/lib/team/workspace";
import { mergeBackupConfig, BackupConfigError } from "@/lib/backup/config";
import { readBackupConfig, saveBackupConfig } from "@/lib/backup/configStore";
import { sftpTest } from "@/lib/backup/sftp";

// POST /api/backup/test-sftp { sftp: partial } — connect, mkdir -p the remote dir, and prove
// it is writable with a write→read→delete probe. The candidate is the form's fields merged
// over the stored config ("" on a secret = keep the stored one), so the button tests exactly
// what saving would store.
//
// A successful test against an unpinned host PINS the server's SHA256 fingerprint into the
// stored config automatically (the response reports what was pinned, so the operator can
// verify it against `ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub` and edit it if wrong).
// The runner refuses to upload anywhere unpinned — the first Test is what makes the nightly
// offsite copy possible, and a later change of the server's key is refused loudly.
export async function POST(req: Request) {
  const userId = await workspaceUserId("manageSecrets");
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const sftp = (body as { sftp?: unknown })?.sftp;
  if (!sftp || typeof sftp !== "object") return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const stored = await readBackupConfig();
  let target;
  try {
    target = mergeBackupConfig({ sftp }, stored).sftp;
  } catch (e) {
    if (e instanceof BackupConfigError) return NextResponse.json({ error: e.code }, { status: 400 });
    throw e;
  }
  if (!target || !target.host) return NextResponse.json({ error: "bad_sftp_auth" }, { status: 400 });

  const result = await sftpTest(target);

  let pinned = false;
  if (result.ok && result.fingerprint && !target.hostKeyFingerprint) {
    try {
      const merged = mergeBackupConfig({ sftp: { hostKeyFingerprint: result.fingerprint } }, await readBackupConfig());
      await saveBackupConfig(merged);
      pinned = true;
    } catch { /* the operator can still pin by hand; report the fingerprint either way */ }
  }

  return NextResponse.json({ ...result, pinned });
}
