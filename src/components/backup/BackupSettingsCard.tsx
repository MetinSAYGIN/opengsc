"use client";

// Settings → Backups (issue #32): the owner-facing control surface for scheduled backups.
// Owner-only by route design (401 → render nothing, the notify-channels convention); shows
// the engine, the schedule/retention/compression/encryption controls, the SFTP destination
// with a live test, "Back up now", the run history, the artifacts with download links, and
// the honest restore procedure — a running app must not swap its own database under itself.

import { useCallback, useEffect, useRef, useState } from "react";
import { DatabaseBackup, Loader2, CloudUpload, KeyRound, RotateCcw } from "lucide-react";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

interface BackupFileView { name: string; sizeBytes: number; mtimeMs: number }
interface RunView {
  id: string; kind: string; status: string; startedAt: string; finishedAt: string | null;
  durationMs: number | null; sizeBytes: number; fileName: string; uploaded: boolean;
  uploadError: string; error: string;
}
interface SftpView {
  host: string; port: number; user: string; remoteDir: string; hostKeyFingerprint: string;
  passwordSet: boolean; privateKeySet: boolean; keyPassphraseSet: boolean;
}
interface ConfigView {
  enabled: boolean; schedule: string; retentionDays: number; compress: boolean;
  passphraseSet: boolean; includeEnv: boolean; sftp: SftpView | null;
}
interface StatusResp {
  engine: string; dbPath: string | null; backupsDir: string | null; running: boolean;
  notMigrated: boolean; config: ConfigView; state: { lastFireAt: string | null };
  runs: RunView[]; files: BackupFileView[];
}

const label: React.CSSProperties = { fontSize: "13px", color: "var(--color-text-primary)", fontWeight: 500 };
const hint: React.CSSProperties = { fontSize: "12px", color: "var(--color-text-secondary)" };
const input: React.CSSProperties = {
  padding: "6px 10px", borderRadius: "8px", border: "1px solid var(--color-border)",
  background: "var(--color-bg-secondary)", color: "var(--color-text-primary)", fontSize: "13px", outline: "none",
};
const btn: React.CSSProperties = {
  padding: "7px 14px", borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: "pointer",
  border: "1px solid var(--color-border)", background: "var(--color-card)", color: "var(--color-text-primary)",
};
const primaryBtn: React.CSSProperties = { ...btn, background: "var(--color-accent-blue)", color: "#fff", border: "none" };

function mb(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

const SCHEDULE_PRESETS: { value: string; key: "backupSchDaily3" | "backupSchDaily6" | "backupSch12h" | "backupSchWeekly" }[] = [
  { value: "0 3 * * *", key: "backupSchDaily3" },
  { value: "0 6 * * *", key: "backupSchDaily6" },
  { value: "0 3,15 * * *", key: "backupSch12h" },
  { value: "0 3 * * 0", key: "backupSchWeekly" },
];

export default function BackupSettingsCard() {
  const { t } = useLanguage();
  const [status, setStatus] = useState<StatusResp | null>(null);
  const [denied, setDenied] = useState(false);
  const [loadError, setLoadError] = useState(false);

  // Form state — secrets stay empty in the form unless typed; "" back to the API = keep stored.
  const [enabled, setEnabled] = useState(false);
  const [schedule, setSchedule] = useState("0 3 * * *");
  const [customSchedule, setCustomSchedule] = useState("");
  const [retentionDays, setRetentionDays] = useState(14);
  const [compress, setCompress] = useState(true);
  const [passphrase, setPassphrase] = useState("");
  const [clearPassphrase, setClearPassphrase] = useState(false);
  const [includeEnv, setIncludeEnv] = useState(true);
  const [sftpOn, setSftpOn] = useState(false);
  const [sftpHost, setSftpHost] = useState("");
  const [sftpPort, setSftpPort] = useState(22);
  const [sftpUser, setSftpUser] = useState("");
  const [sftpPassword, setSftpPassword] = useState("");
  const [sftpKey, setSftpKey] = useState("");
  const [sftpKeyPass, setSftpKeyPass] = useState("");
  const [sftpDir, setSftpDir] = useState("opengsc-backups");
  const [sftpFingerprint, setSftpFingerprint] = useState("");

  const [busy, setBusy] = useState<"" | "save" | "run" | "test">("");
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string; fingerprint?: string; pinned?: boolean } | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const applyStatus = (d: StatusResp) => {
    setStatus(d);
    setEnabled(d.config.enabled);
    const preset = SCHEDULE_PRESETS.find(p => p.value === d.config.schedule);
    setSchedule(preset ? d.config.schedule : "custom");
    if (!preset) setCustomSchedule(d.config.schedule);
    setRetentionDays(d.config.retentionDays);
    setCompress(d.config.compress);
    setIncludeEnv(d.config.includeEnv);
    setSftpOn(!!d.config.sftp);
    if (d.config.sftp) {
      setSftpHost(d.config.sftp.host);
      setSftpPort(d.config.sftp.port);
      setSftpUser(d.config.sftp.user);
      setSftpDir(d.config.sftp.remoteDir);
      setSftpFingerprint(d.config.sftp.hostKeyFingerprint);
    }
  };

  const load = useCallback(() => {
    fetch("/api/backup")
      .then(r => r.status === 401 ? (setDenied(true), null) : r.json())
      .then(d => { if (d && !d.error) applyStatus(d as StatusResp); else if (d?.error) setLoadError(true); })
      .catch(() => setLoadError(true));
  }, []);

  useEffect(() => { load(); }, [load]);

  // While a run is in flight (or right after "Back up now"), refresh so the history row,
  // the file list and the running flag stay live.
  useEffect(() => {
    const shouldPoll = status?.running;
    if (shouldPoll && !pollRef.current) {
      pollRef.current = setInterval(load, 5000);
    } else if (!shouldPoll && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [status?.running, load]);

  if (denied) return null;

  if (!status) {
    if (loadError) {
      return (
        <div className="card" style={{ color: "#f87171", fontSize: "13px" }}>
          {t("backupTitle")} — {t("backupError")} network
        </div>
      );
    }
    return (
      <div className="card" style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--color-text-secondary)", fontSize: "13px" }}>
        <Loader2 size={14} className="spin" /> {t("backupTitle")}…
      </div>
    );
  }

  if (status.notMigrated) {
    return (
      <div className="card" style={{ color: "var(--color-accent-orange)", fontSize: "13px" }}>
        {t("backupTitle")} — npx prisma db push
      </div>
    );
  }

  const save = async () => {
    setBusy("save"); setMsg(null);
    const effectiveSchedule = schedule === "custom" ? customSchedule : schedule;
    const sftp = sftpOn && sftpHost.trim() ? {
      host: sftpHost, port: sftpPort, user: sftpUser, remoteDir: sftpDir,
      hostKeyFingerprint: sftpFingerprint,
      password: sftpPassword, // "" = keep stored
      privateKey: sftpKey,
      passphrase: sftpKeyPass,
    } : (sftpOn ? { host: "", port: sftpPort } : null);
    try {
      const res = await fetch("/api/backup", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled, schedule: effectiveSchedule, retentionDays, compress, includeEnv, sftp,
          passphrase: clearPassphrase ? null : passphrase,
        }),
      });
      const d = await res.json();
      if (d.error) { setMsg({ text: `${t("backupError")} ${String(d.error)}`, bad: true }); }
      else { setMsg({ text: t("backupSaved") }); setPassphrase(""); setClearPassphrase(false); setSftpPassword(""); setSftpKey(""); setSftpKeyPass(""); load(); }
    } catch { setMsg({ text: t("backupError"), bad: true }); }
    setBusy("");
  };

  const runNow = async () => {
    setBusy("run"); setMsg(null);
    try {
      const res = await fetch("/api/backup/run", { method: "POST" });
      const d = await res.json();
      if (d.error) setMsg({ text: t("backupError") + " " + d.error, bad: true });
      else { setMsg({ text: t("backupRunStarted") }); load(); }
    } catch { setMsg({ text: t("backupError"), bad: true }); }
    setBusy("");
  };

  const testSftp = async () => {
    setBusy("test"); setTestResult(null);
    try {
      const res = await fetch("/api/backup/test-sftp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sftp: { host: sftpHost, port: sftpPort, user: sftpUser, remoteDir: sftpDir, password: sftpPassword, privateKey: sftpKey, passphrase: sftpKeyPass } }),
      });
      const d = await res.json();
      setTestResult(d);
      if (d.ok && d.pinned) load(); // the server pinned the host key — refresh the stored view
    } catch { setTestResult({ ok: false, error: "network" }); }
    setBusy("");
  };

  const scheduleValue = schedule === "custom" ? customSchedule : schedule;

  return (
    <div className="card">
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
        <DatabaseBackup size={17} color="#3B82F6" />
        <div>
          <div style={{ ...label, fontSize: "15px" }}>{t("backupTitle")}</div>
          <div style={hint}>{t("backupSub")}</div>
        </div>
      </div>

      {status.engine !== "sqlite" && (
        <div style={{ fontSize: "12px", color: "var(--color-accent-orange)", margin: "10px 0" }}>{t("backupSqliteOnly")}</div>
      )}

      {status.engine === "sqlite" && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", margin: "12px 0 4px" }}>
            <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />
            <span style={label}>{t("backupEnable")}</span>
            <span style={hint}>{status.dbPath ? `${status.backupsDir}` : ""}</span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px", margin: "10px 0" }}>
            <div>
              <div style={label}>{t("backupSchedule")}</div>
              <select value={schedule} onChange={e => setSchedule(e.target.value)} style={{ ...input, width: "100%", marginTop: "4px" }}>
                {SCHEDULE_PRESETS.map(p => <option key={p.value} value={p.value}>{t(p.key)}</option>)}
                <option value="custom">{t("backupSchCustom")}</option>
              </select>
              {schedule === "custom" && (
                <input value={customSchedule} onChange={e => setCustomSchedule(e.target.value)} placeholder="0 3 * * *" style={{ ...input, width: "100%", marginTop: "6px", fontFamily: "monospace" }} />
              )}
              <div style={{ ...hint, marginTop: "4px" }}>{t("backupScheduleHint")} <code style={{ fontFamily: "monospace" }}>{scheduleValue || "…"}</code> UTC</div>
            </div>
            <div>
              <div style={label}>{t("backupRetention")}</div>
              <select value={retentionDays} onChange={e => setRetentionDays(Number(e.target.value))} style={{ ...input, width: "100%", marginTop: "4px" }}>
                {[7, 14, 30].map(d => <option key={d} value={d}>{d} {t("backupDays")}</option>)}
              </select>
            </div>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: "18px", margin: "8px 0" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "8px", ...label }}>
              <input type="checkbox" checked={compress} onChange={e => setCompress(e.target.checked)} /> {t("backupCompress")}
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: "8px", ...label }}>
              <input type="checkbox" checked={includeEnv} onChange={e => setIncludeEnv(e.target.checked)} /> {t("backupIncludeEnv")}
            </label>
          </div>
          <div style={{ ...hint, marginBottom: "10px" }}>{t("backupIncludeEnvHint")}</div>

          {/* Encryption */}
          <div style={{ borderTop: "1px solid var(--color-border)", paddingTop: "10px", marginTop: "6px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <KeyRound size={14} color="#F59E0B" />
              <span style={label}>{t("backupEncryption")}</span>
              {status.config.passphraseSet && !clearPassphrase && <span style={hint}>{t("backupPassphraseSet")}</span>}
            </div>
            <div style={{ display: "flex", gap: "8px", marginTop: "6px", flexWrap: "wrap" }}>
              <input type="password" value={passphrase} onChange={e => { setPassphrase(e.target.value); setClearPassphrase(false); }}
                placeholder={status.config.passphraseSet ? t("backupPassphraseKeep") : t("backupPassphrase")} disabled={clearPassphrase}
                style={{ ...input, flex: 1, minWidth: "220px" }} />
              {status.config.passphraseSet && (
                <button onClick={() => setClearPassphrase(!clearPassphrase)} style={btn}>
                  {clearPassphrase ? t("backupUndo") : t("backupClear")}
                </button>
              )}
            </div>
            <div style={{ ...hint, marginTop: "4px" }}>{t("backupEncryptionHint")}</div>
          </div>

          {/* SFTP */}
          <div style={{ borderTop: "1px solid var(--color-border)", paddingTop: "10px", marginTop: "12px" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "8px", ...label }}>
              <input type="checkbox" checked={sftpOn} onChange={e => setSftpOn(e.target.checked)} />
              <CloudUpload size={14} color="#3B82F6" /> {t("backupSftpTitle")}
            </label>
            {sftpOn && (
              <div style={{ marginTop: "8px" }}>
                <div style={hint}>{t("backupSftpHint")}</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "10px", marginTop: "8px" }}>
                  <div>
                    <div style={hint}>{t("backupSftpHost")}</div>
                    <input value={sftpHost} onChange={e => setSftpHost(e.target.value)} placeholder="nas.local" style={{ ...input, width: "100%", marginTop: "2px" }} />
                  </div>
                  <div>
                    <div style={hint}>{t("backupSftpPort")}</div>
                    <input type="number" value={sftpPort} onChange={e => setSftpPort(Number(e.target.value))} style={{ ...input, width: "100%", marginTop: "2px" }} />
                  </div>
                  <div>
                    <div style={hint}>{t("backupSftpUser")}</div>
                    <input value={sftpUser} onChange={e => setSftpUser(e.target.value)} placeholder="backup" style={{ ...input, width: "100%", marginTop: "2px" }} />
                  </div>
                  <div>
                    <div style={hint}>{t("backupSftpDir")}</div>
                    <input value={sftpDir} onChange={e => setSftpDir(e.target.value)} style={{ ...input, width: "100%", marginTop: "2px", fontFamily: "monospace" }} />
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "10px", marginTop: "8px" }}>
                  <div>
                    <div style={hint}>{t("backupSftpPassword")}{status.config.sftp?.passwordSet ? " ✓" : ""}</div>
                    <input type="password" value={sftpPassword} onChange={e => setSftpPassword(e.target.value)}
                      placeholder={status.config.sftp?.passwordSet ? t("backupPassphraseKeep") : "••••"} style={{ ...input, width: "100%", marginTop: "2px" }} />
                  </div>
                  <div>
                    <div style={hint}>{t("backupSftpKeyPass")}{status.config.sftp?.keyPassphraseSet ? " ✓" : ""}</div>
                    <input type="password" value={sftpKeyPass} onChange={e => setSftpKeyPass(e.target.value)}
                      placeholder={status.config.sftp?.keyPassphraseSet ? t("backupPassphraseKeep") : "••••"} style={{ ...input, width: "100%", marginTop: "2px" }} />
                  </div>
                </div>
                <div style={{ marginTop: "8px" }}>
                  <div style={hint}>{t("backupSftpKey")}{status.config.sftp?.privateKeySet ? " ✓" : ""}</div>
                  <textarea value={sftpKey} onChange={e => setSftpKey(e.target.value)} rows={3}
                    placeholder={"-----BEGIN OPENSSH PRIVATE KEY-----"} style={{ ...input, width: "100%", marginTop: "2px", fontFamily: "monospace", fontSize: "11px" }} />
                </div>
                <div style={{ display: "flex", gap: "8px", alignItems: "center", marginTop: "8px", flexWrap: "wrap" }}>
                  <button onClick={testSftp} disabled={busy === "test" || !sftpHost.trim()} style={btn}>
                    {busy === "test" ? "…" : t("backupSftpTest")}
                  </button>
                  {testResult && (
                    <span style={{ ...hint, color: testResult.ok ? "#10B981" : "#f87171" }}>
                      {testResult.ok
                        ? `${t("backupSftpTestOk")}${testResult.pinned ? " · " + t("backupPinned") : ""}`
                        : `${t("backupSftpTestFail")}: ${testResult.error}`}
                    </span>
                  )}
                </div>
                {(testResult?.fingerprint || status.config.sftp?.hostKeyFingerprint) && (
                  <div style={{ display: "flex", gap: "8px", alignItems: "center", marginTop: "6px", flexWrap: "wrap" }}>
                    <span style={hint}>{t("backupSftpFingerprint")}:</span>
                    <input value={sftpFingerprint} onChange={e => setSftpFingerprint(e.target.value)}
                      placeholder={testResult?.fingerprint ?? "md5"} style={{ ...input, fontFamily: "monospace", fontSize: "11px", minWidth: "260px" }} />
                    {testResult?.fingerprint && !sftpFingerprint && (
                      <button onClick={() => setSftpFingerprint(testResult.fingerprint!)} style={btn}>{t("backupPin")}</button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: "10px", marginTop: "14px", alignItems: "center", flexWrap: "wrap" }}>
            <button onClick={save} disabled={busy === "save"} style={primaryBtn}>{busy === "save" ? "…" : t("backupSave")}</button>
            <button onClick={runNow} disabled={busy === "run" || status.running} style={btn}>
              {status.running ? <Loader2 size={12} className="spin" /> : <RotateCcw size={12} />} {status.running ? t("backupRunning") : t("backupRunNow")}
            </button>
            {msg && <span style={{ ...hint, color: msg.bad ? "#f87171" : "#10B981" }}>{msg.text}</span>}
          </div>

          {/* History */}
          {status.runs.length > 0 && (
            <div style={{ borderTop: "1px solid var(--color-border)", paddingTop: "10px", marginTop: "14px" }}>
              <div style={{ ...label, marginBottom: "6px" }}>{t("backupHistory")}</div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                <tbody>
                  {status.runs.map(r => (
                    <tr key={r.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                      <td style={{ padding: "5px 8px 5px 0", color: "var(--color-text-secondary)", whiteSpace: "nowrap" }}>
                        {new Date(r.startedAt).toLocaleString()}
                      </td>
                      <td style={{ padding: "5px 8px 5px 0", color: "var(--color-text-secondary)" }}>{r.kind}</td>
                      <td style={{ padding: "5px 8px 5px 0", color: r.status === "success" ? "#10B981" : r.status === "failed" ? "#f87171" : "var(--color-text-secondary)" }}>
                        {r.status === "success" && r.uploadError ? "⚠" : ""} {r.status}
                      </td>
                      <td style={{ padding: "5px 8px 5px 0", color: "var(--color-text-secondary)" }}>{r.sizeBytes ? mb(r.sizeBytes) : "—"}</td>
                      <td style={{ padding: "5px 0", color: "var(--color-text-secondary)", maxWidth: "300px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.error || r.uploadError || r.fileName}>
                        {r.error || r.uploadError || r.fileName}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Local artifacts */}
          <div style={{ borderTop: "1px solid var(--color-border)", paddingTop: "10px", marginTop: "12px" }}>
            <div style={{ ...label, marginBottom: "6px" }}>{t("backupFiles")}</div>
            {status.files.length === 0 ? (
              <div style={hint}>{t("backupFilesEmpty")}</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                {status.files.map(f => (
                  <a key={f.name} href={`/api/backup/download?name=${encodeURIComponent(f.name)}`}
                    style={{ ...hint, display: "flex", justifyContent: "space-between", gap: "12px", textDecoration: "none" }}>
                    <span style={{ fontFamily: "monospace" }}>{f.name}</span>
                    <span style={{ color: "var(--color-accent-blue)", whiteSpace: "nowrap" }}>{mb(f.sizeBytes)} · {t("backupDownload")}</span>
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* Restore */}
          <details style={{ marginTop: "14px" }}>
            <summary style={{ ...label, cursor: "pointer" }}>{t("backupRestoreTitle")}</summary>
            <pre style={{ ...hint, whiteSpace: "pre-wrap", background: "var(--color-bg-secondary)", padding: "10px", borderRadius: "8px", marginTop: "8px", fontFamily: "monospace" }}>
              {t("backupRestoreHint")}
            </pre>
          </details>
        </>
      )}
    </div>
  );
}
