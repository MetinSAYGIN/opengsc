import assert from "node:assert/strict";
import test from "node:test";
import {
  mergeBackupConfig, backupConfigView, DEFAULT_BACKUP_CONFIG, SECRET_MASK,
  BackupConfigError,
} from "./config";

const WITH_SFTP = {
  ...DEFAULT_BACKUP_CONFIG,
  sftp: {
    host: "nas.example", port: 22, user: "backup", password: "hunter2",
    privateKey: "", passphrase: "", remoteDir: "opengsc-backups", hostKeyFingerprint: "",
  },
};

const PIN = "SHA256:cGqP0fa7s86qf14sP5gMZuKkNTHlfJT6zutqyFjqjbU";
const WITH_PINNED = {
  ...WITH_SFTP,
  sftp: { ...WITH_SFTP.sftp!, hostKeyFingerprint: PIN },
};

test("secrets: empty string keeps the stored value, null clears it", () => {
  const kept = mergeBackupConfig({ passphrase: "", sftp: { password: "" } }, WITH_SFTP);
  assert.equal(kept.passphrase, DEFAULT_BACKUP_CONFIG.passphrase);
  assert.equal(kept.sftp?.password, "hunter2");

  const cleared = mergeBackupConfig({ passphrase: null, sftp: { password: null, passphrase: null } }, {
    ...WITH_SFTP, passphrase: "open-sesame",
    sftp: { ...WITH_SFTP.sftp!, privateKey: "-----BEGIN OPENSSH PRIVATE KEY-----\nabc", passphrase: "keypass" },
  });
  assert.equal(cleared.passphrase, "");
  assert.equal(cleared.sftp?.password, "");
  assert.equal(cleared.sftp?.passphrase, "");
  assert.ok(cleared.sftp?.privateKey.includes("PRIVATE KEY"), "the key survives — the destination stays usable");

  // Clearing EVERY credential while a host is set would leave a destination that can never
  // authenticate; save refuses it and the UI must clear the host checkbox instead.
  assert.throws(() => mergeBackupConfig({ sftp: { password: null, privateKey: null } }, {
    ...WITH_SFTP, sftp: { ...WITH_SFTP.sftp!, privateKey: "-----BEGIN OPENSSH PRIVATE KEY-----\nabc" },
  }), BackupConfigError);
});

test("the mask sentinel behaves like empty — an untouched form round-trips", () => {
  const merged = mergeBackupConfig({ passphrase: SECRET_MASK, sftp: { password: SECRET_MASK } }, WITH_SFTP);
  assert.equal(merged.sftp?.password, "hunter2");
});

test("a short encryption passphrase is rejected", () => {
  assert.throws(() => mergeBackupConfig({ passphrase: "short" }, DEFAULT_BACKUP_CONFIG), BackupConfigError);
  assert.doesNotThrow(() => mergeBackupConfig({ passphrase: "long-enough-pass" }, DEFAULT_BACKUP_CONFIG));
});

test("schedule must be valid cron; retention must be 1..90 days (numeric strings ok)", () => {
  assert.throws(() => mergeBackupConfig({ schedule: "every day" }, DEFAULT_BACKUP_CONFIG), BackupConfigError);
  assert.doesNotThrow(() => mergeBackupConfig({ schedule: "15 2 * * 1-5" }, DEFAULT_BACKUP_CONFIG));
  for (const bad of [0, -1, 91, 3.5]) {
    assert.throws(() => mergeBackupConfig({ retentionDays: bad }, DEFAULT_BACKUP_CONFIG), BackupConfigError, String(bad));
  }
  assert.equal(mergeBackupConfig({ retentionDays: 30 }, DEFAULT_BACKUP_CONFIG).retentionDays, 30);
  assert.equal(mergeBackupConfig({ retentionDays: "14" }, DEFAULT_BACKUP_CONFIG).retentionDays, 14);
});

test("remote dir traversal and home paths are refused", () => {
  for (const bad of ["/srv/../etc", "../escape", "~/backups", "dir with spaces", "a;b"]) {
    assert.throws(() => mergeBackupConfig({ sftp: { remoteDir: bad } }, WITH_SFTP), BackupConfigError, bad);
  }
  assert.equal(mergeBackupConfig({ sftp: { remoteDir: "/srv/backups/opengsc" } }, WITH_SFTP).sftp?.remoteDir, "/srv/backups/opengsc");
  assert.equal(mergeBackupConfig({ sftp: { remoteDir: "" } }, WITH_SFTP).sftp?.remoteDir, "opengsc-backups");
});

test("a host without user or without any credentials is rejected; empty host clears the destination", () => {
  // no user, no stored sftp to inherit one from
  assert.throws(() => mergeBackupConfig({ sftp: { host: "nas", port: 22 } }, DEFAULT_BACKUP_CONFIG), BackupConfigError);
  // no credentials at all (current config has no sftp to keep secrets from)
  assert.throws(() => mergeBackupConfig({ sftp: { host: "nas", user: "backup" } }, DEFAULT_BACKUP_CONFIG), BackupConfigError);
  // keeping stored credentials is enough — the test form sends "" for secrets
  const ok = mergeBackupConfig({ sftp: { host: "nas2", user: "backup2", password: "" } }, WITH_SFTP);
  assert.equal(ok.sftp?.host, "nas2");
  assert.equal(ok.sftp?.password, "hunter2");

  const cleared = mergeBackupConfig({ sftp: { host: "" } }, WITH_SFTP);
  assert.equal(cleared.sftp, null);
});

test("a private key that is not a PEM is rejected", () => {
  assert.throws(() => mergeBackupConfig({ sftp: { privateKey: "just some text" } }, WITH_SFTP), BackupConfigError);
  const ok = mergeBackupConfig({ sftp: { privateKey: "-----BEGIN OPENSSH PRIVATE KEY-----\nAAAA\n-----END OPENSSH PRIVATE KEY-----" } }, WITH_SFTP);
  assert.ok(ok.sftp?.privateKey.includes("BEGIN OPENSSH PRIVATE KEY"));
});

test("the view masks secrets into booleans and never carries them out", () => {
  const view = backupConfigView({ ...DEFAULT_BACKUP_CONFIG, passphrase: "secret-1", sftp: WITH_SFTP.sftp });
  const json = JSON.stringify(view);
  assert.equal(view.passphraseSet, true);
  assert.equal(view.sftp?.passwordSet, true);
  assert.ok(!json.includes("hunter2"));
  assert.ok(!json.includes("secret-1"));
});

// The review bug on 7baf7b0: the test route used to "pin" by writing a fingerprint over a
// stored config that had no SFTP section — merge correctly refuses to materialize a
// destination from a fingerprint alone, so that write pinned nothing while reporting success.
test("a fingerprint alone never materializes an SFTP destination", () => {
  const merged = mergeBackupConfig({ sftp: { hostKeyFingerprint: PIN } }, DEFAULT_BACKUP_CONFIG);
  assert.equal(merged.sftp, null);
});

test("a host or port change without a new fingerprint drops the stale one", () => {
  const hostChanged = mergeBackupConfig({ sftp: { host: "nas2.example" } }, WITH_PINNED);
  assert.equal(hostChanged.sftp?.host, "nas2.example");
  assert.equal(hostChanged.sftp?.hostKeyFingerprint, "", "old host's fingerprint must not vouch for the new host");

  const portChanged = mergeBackupConfig({ sftp: { port: 2222 } }, WITH_PINNED);
  assert.equal(portChanged.sftp?.port, 2222);
  assert.equal(portChanged.sftp?.hostKeyFingerprint, "");

  // the fix's companion flows: a new host WITH its new fingerprint pins it, and an untouched
  // host keeps the pin (later Tests verify the key against it — the MITM case)
  const hostChangedWithFp = mergeBackupConfig({ sftp: { host: "nas2.example", hostKeyFingerprint: "SHA256:" + "B".repeat(43) } }, WITH_PINNED);
  assert.equal(hostChangedWithFp.sftp?.hostKeyFingerprint, "SHA256:" + "B".repeat(43));
  const untouched = mergeBackupConfig({ sftp: { user: "backup2" } }, WITH_PINNED);
  assert.equal(untouched.sftp?.hostKeyFingerprint, PIN);
});

test("fingerprints canonicalize to SHA256:base64 (the ssh-keygen -lf form)", () => {
  // lowercase prefix normalized, kept as-is otherwise
  assert.equal(
    mergeBackupConfig({ sftp: { hostKeyFingerprint: "sha256:cGqP0fa7s86qf14sP5gMZuKkNTHlfJT6zutqyFjqjbU" } }, WITH_SFTP).sftp?.hostKeyFingerprint,
    "SHA256:cGqP0fa7s86qf14sP5gMZuKkNTHlfJT6zutqyFjqjbU",
  );
  // bare base64 gets the prefix — a paste straight off `ssh-keygen -lf` minus the prefix
  assert.equal(
    mergeBackupConfig({ sftp: { hostKeyFingerprint: "cGqP0fa7s86qf14sP5gMZuKkNTHlfJT6zutqyFjqjbU" } }, WITH_SFTP).sftp?.hostKeyFingerprint,
    "SHA256:cGqP0fa7s86qf14sP5gMZuKkNTHlfJT6zutqyFjqjbU",
  );
  // md5 hex and other junk are refused rather than stored as an unpinnable value
  for (const bad of ["AA:BB:01", "MD5:aabb01", "not base64!!", "SHA256:short?"]) {
    assert.throws(() => mergeBackupConfig({ sftp: { hostKeyFingerprint: bad } }, WITH_SFTP), BackupConfigError, bad);
  }
});
