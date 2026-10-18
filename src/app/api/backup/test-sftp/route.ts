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
// The route WRITES NOTHING. A successful test returns the server's SHA256 fingerprint (the
// exact string `ssh-keygen -lf` prints, so the operator can verify it against their server by
// hand); the Settings card fills it into the form, and the next Save pins it together with
// the host. Two reasons the route must not save by itself:
//   • on first setup the stored config has no SFTP section yet, and writing the fingerprint
//     "over an empty destination" is a no-op that silences mergeBackupConfig's shape rules —
//     it would report success while pinning nothing (review finding on 7baf7b0);
//   • a Test button that mutates the saved config is a side effect the button does not promise.
//
// Host-key verification still happens here: when the candidate's host and port are unchanged,
// the stored fingerprint participates in the connection, so a swapped key on a known host —
// the actual MITM case — fails the test loudly. A changed host:port merges to an empty
// fingerprint (mergeBackupConfig resets it), so a new destination is tested unpinned and its
// own fingerprint comes back for the form.
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
