import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pickPrunable, listLocalBackups, BACKUP_FILE_RE } from "./artifacts";

const DAY = 24 * 60 * 60_000;

test("BACKUP_FILE_RE owns only this module's artifacts", () => {
  const yes = [
    "opengsc-scheduled-20261012T030000Z.db",
    "opengsc-scheduled-20261012T030000Z.db.gz",
    "opengsc-scheduled-20261012T030000Z.db.gz.enc",
    "opengsc-manual-20261012T030000Z.db.enc",
    "opengsc-env-20261012T030000Z.env",
    "opengsc-env-20261012T030000Z.env.enc",
  ];
  const no = [
    "opengsc-before-update-20261012T030000Z.db",  // update.sh's family — never touched
    "opengsc-scheduled-20261012T030000Z.db-wal",  // sidecar junk is not a backup
    "notes.txt",
    "opengsc-scheduled-evil.db.gz.enc.exe",
  ];
  for (const n of yes) assert.ok(BACKUP_FILE_RE.test(n), n);
  for (const n of no) assert.ok(!BACKUP_FILE_RE.test(n), n);
});

test("retention deletes past the cutoff and keeps the newest of each kind", () => {
  const now = Date.parse("2026-10-12T12:00:00Z");
  const old = now - 20 * DAY; // past every retention window used below
  const files = [
    { name: "opengsc-scheduled-A.db", mtimeMs: old },          // past cutoff, NOT the newest scheduled (E is) → pruned
    { name: "opengsc-scheduled-B.db.gz", mtimeMs: old - DAY }, // older still → pruned
    { name: "opengsc-manual-C.db", mtimeMs: old - 2 * DAY },   // the only manual → kept even past cutoff
    { name: "opengsc-env-D.env", mtimeMs: old },               // env has no keep-newest → pruned
    { name: "opengsc-scheduled-E.db", mtimeMs: now - DAY },    // fresh → kept
  ];
  const doomed = pickPrunable(files, now, 7);
  assert.deepEqual(doomed.sort(), [
    "opengsc-env-D.env", "opengsc-scheduled-A.db", "opengsc-scheduled-B.db.gz",
  ].sort());
});

test("an instance down past retention still finds its last backup", () => {
  const now = Date.parse("2026-10-12T12:00:00Z");
  const files = [{ name: "opengsc-scheduled-only.db", mtimeMs: now - 90 * DAY }];
  assert.deepEqual(pickPrunable(files, now, 14), []);
});

test("listLocalBackups reports names and sizes, newest first, ignoring foreign files", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "opengsc-backups-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const oldFile = path.join(dir, "opengsc-scheduled-old.db");
  const newFile = path.join(dir, "opengsc-scheduled-new.db.gz.enc");
  const foreign = path.join(dir, "opengsc-before-update-x.db");
  fs.writeFileSync(oldFile, Buffer.alloc(100));
  fs.writeFileSync(newFile, Buffer.alloc(300));
  fs.writeFileSync(foreign, Buffer.alloc(50));
  // mtime order opposite to name order, to prove sorting is by mtime
  fs.utimesSync(oldFile, new Date(Date.now() - 2 * DAY), new Date(Date.now() - 2 * DAY));

  const listed = listLocalBackups(dir);
  assert.deepEqual(listed.map(f => f.name), ["opengsc-scheduled-new.db.gz.enc", "opengsc-scheduled-old.db"]);
  assert.equal(listed[0].sizeBytes, 300);

  assert.deepEqual(listLocalBackups(path.join(dir, "does-not-exist")), []);
});
