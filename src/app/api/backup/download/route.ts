import { NextResponse } from "next/server";
import { createReadStream } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { workspaceUserId } from "@/lib/team/workspace";
import { resolveSqliteDb, listLocalBackups } from "@/lib/backup/artifacts";

// GET /api/backup/download?name=<basename> — stream one artifact from the backups directory.
// The name must be an exact entry from the directory listing, which is both the authorization
// ("files this module produced") and the traversal guard (a synthesized ../ path is never in
// the listing). Owner-only: backups contain every secret in the instance.
export async function GET(req: Request) {
  const userId = await workspaceUserId("manageSecrets");
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const location = resolveSqliteDb();
  if (!location) return NextResponse.json({ error: "not_sqlite" }, { status: 400 });

  const name = new URL(req.url).searchParams.get("name") ?? "";
  const file = listLocalBackups(location.backupsDir).find(f => f.name === name);
  if (!file) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const full = path.join(location.backupsDir, file.name);
  const stream = Readable.toWeb(createReadStream(full)) as ReadableStream<Uint8Array>;
  return new Response(stream, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(file.sizeBytes),
      "Content-Disposition": `attachment; filename="${file.name}"`,
    },
  });
}
