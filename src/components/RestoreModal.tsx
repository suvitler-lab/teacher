import { useState } from "preact/hooks";
import { Icon } from "./Icon";
import { api, ApiError } from "../lib/api";
import { runBackup, BackupInconsistentError, type BackupFile } from "../lib/backup";
import { loadBootstrap } from "../store";

const TABLES = [
  "settings", "terms", "classes", "subjects", "work_types", "students",
  "revoked_qr_tokens", "assignments", "assignment_classes", "scan_sessions",
  "submissions", "attendance_sessions", "attendance",
];
const CHUNK = 500;

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// what went wrong, in words — and whether the teacher can just try again
function explain(e: unknown): { text: string; retry: boolean } {
  // the safety copy of today's data could not be taken cleanly — and nothing has been touched yet
  if (e instanceof BackupInconsistentError) return { text: e.message + " (ยังไม่ได้เริ่มกู้คืน ข้อมูลเดิมไม่ถูกเปลี่ยน)", retry: true };
  if (e instanceof ApiError) {
    const code = e.data?.error ?? e.code;
    if (code === "restore_failed") return { text: "ไฟล์สำรองมีข้อมูลที่ไม่สอดคล้องกัน (เช่น อ้างถึงห้องหรือนักเรียนที่ไม่มีในไฟล์) — ไม่มีอะไรถูกเปลี่ยน ข้อมูลเดิมยังอยู่ครบ", retry: false };
    if (code === "incomplete_upload") return { text: `ส่งข้อมูลขึ้นระบบไม่ครบ (ตาราง ${e.data?.table}) — ไม่มีอะไรถูกเปลี่ยน ลองกู้คืนอีกครั้ง`, retry: true };
    if (code === "restore_expired" || code === "job_not_active") return { text: "งานกู้คืนนี้หมดอายุหรือถูกยกเลิกแล้ว — เลือกไฟล์ใหม่อีกครั้ง", retry: false };
    if (e.status === 0) return { text: "ต่ออินเทอร์เน็ตไม่ได้ระหว่างส่งไฟล์ — ยังไม่มีอะไรถูกเปลี่ยน ลองอีกครั้งเมื่อมีเน็ต", retry: true };
  }
  return { text: (e as Error)?.message || "กู้คืนไม่สำเร็จ — ไม่มีอะไรถูกเปลี่ยน", retry: true };
}

export function RestoreModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [file, setFile] = useState<BackupFile | null>(null);
  const [restoreId, setRestoreId] = useState("");
  const [confirmText, setConfirmText] = useState("");
  // "unknown" = the switch-over was sent but we lost the connection before hearing back: it may or may not have happened
  const [stage, setStage] = useState<"pick" | "validated" | "running" | "done" | "unknown">("pick");
  const [err, setErr] = useState("");
  const [progress, setProgress] = useState("");

  // Closing without finishing must not leave an uploaded copy or a "restore in progress" behind.
  function close() {
    if (stage === "running") return;
    // cancel THIS restore only (never another device's newer one); when the outcome is unknown, leave it alone
    if (stage === "validated" && restoreId) api.post("/api/restore/cancel", { restoreId }).catch(() => {});
    onClose();
  }

  async function onPick(e: Event) {
    setErr("");
    const input = e.target as HTMLInputElement;
    const f = input.files?.[0];
    if (!f) return;
    try {
      const parsed = JSON.parse(await f.text()) as BackupFile;
      if (parsed.app !== "ngankrob") throw new Error("ไม่ใช่ไฟล์สำรองของงานครบ");
      const sha = await sha256Hex(JSON.stringify(parsed.data));
      if (parsed.sha256 && parsed.sha256 !== sha) throw new Error("ไฟล์เสียหาย (sha256 ไม่ตรง)");
      setFile(parsed);
      const res = await api.post<{ ok: boolean; restoreId?: string; error?: string; file?: number; app?: number; missing?: string[] }>(
        "/api/restore/validate", { manifest: { schema_version: parsed.schema_version, counts: parsed.counts, sha256: parsed.sha256 } },
      ).catch((er: any) => er.data ?? { ok: false, error: er.code });
      if (!res.ok) {
        if (res.error === "schema_mismatch") throw new Error(`เวอร์ชันไม่ตรง (ไฟล์ v${res.file} · ระบบ v${res.app}) — ไฟล์นี้ใหม่กว่าระบบ`);
        if (res.error === "incomplete_backup") throw new Error(`ไฟล์สำรองไม่ครบทุกตาราง (ขาด: ${(res.missing ?? []).join(", ")})`);
        throw new Error("ตรวจไฟล์ไม่ผ่าน");
      }
      setRestoreId(res.restoreId!);
      setStage("validated");
    } catch (er: any) {
      setErr(er.message || "อ่านไฟล์ไม่สำเร็จ");
      input.value = ""; // let the same file be picked again
    }
  }

  async function sendChunk(table: string, seq: number, rows: unknown[]) {
    for (let attempt = 0; ; attempt++) {
      try { return await api.post("/api/restore/execute", { restoreId, step: "chunk", table, seq, rows }); }
      catch (e) {
        // a flaky connection: re-sending a chunk is safe (it replaces itself on the server)
        if (attempt < 2 && e instanceof ApiError && (e.status === 0 || e.status >= 500)) continue;
        throw e;
      }
    }
  }

  // After a lost reply to the switch-over: ask the server what really happened to THIS restore.
  // done → it went through · validated/aborted → it did not · no answer → we honestly don't know.
  async function askOutcome(): Promise<"done" | "not_applied" | "unknown"> {
    for (let i = 0; i < 3; i++) {
      try {
        const st = await api.get<{ job: { status: string } | null }>(`/api/restore/status?id=${encodeURIComponent(restoreId)}`);
        if (st.job?.status === "done") return "done";
        if (st.job) return "not_applied";
        return "unknown";
      } catch { await new Promise((r) => setTimeout(r, 1500)); }
    }
    return "unknown";
  }

  async function settleOutcome() {
    setErr(""); setStage("running"); setProgress("กำลังตรวจสอบผลการกู้คืน…");
    const out = await askOutcome();
    if (out === "done") {
      setProgress("โหลดข้อมูลใหม่…");
      try { await loadBootstrap(); } catch { /* the data is restored; a reload will pick it up */ }
      setStage("done");
    } else if (out === "not_applied") {
      setErr("ตรวจแล้ว: การกู้คืนครั้งนี้ยังไม่ได้เกิดขึ้น ข้อมูลเดิมยังอยู่ครบ — กดกู้คืนอีกครั้งได้");
      setStage("validated");
    } else {
      setErr("ยังไม่ทราบผล: เชื่อมต่อไม่ได้ระหว่างเปลี่ยนข้อมูล อาจสำเร็จไปแล้วหรือยังไม่เกิดขึ้น — ต่อเน็ตแล้วกด \"ตรวจสอบผล\" ก่อนทำอะไรต่อ");
      setStage("unknown");
    }
  }

  async function execute() {
    if (!file) return;
    setStage("running");
    setErr("");
    let committing = false;
    try {
      setProgress("กำลังสำรองข้อมูลปัจจุบันไว้ก่อน…");
      await runBackup(); // safety copy of what is about to be replaced
      // 1) upload into a holding area — nothing live is touched yet
      for (const table of TABLES) {
        const rows = file.data[table] ?? [];
        for (let i = 0, seq = 0; i < rows.length; i += CHUNK, seq++) {
          setProgress(`ส่งข้อมูลขึ้นระบบ: ${table} (${Math.min(i + CHUNK, rows.length)}/${rows.length})`);
          await sendChunk(table, seq, rows.slice(i, i + CHUNK));
        }
      }
      // 2) one atomic swap: it all changes, or none of it does
      setProgress("กำลังเปลี่ยนข้อมูล…");
      committing = true;
      await api.post("/api/restore/execute", { restoreId, step: "commit" });
      setProgress("โหลดข้อมูลใหม่…");
      await loadBootstrap();
      setStage("done");
    } catch (e) {
      // the request was sent but we never got a clear answer: it may HAVE gone through — find out, don't assume
      if (committing && e instanceof ApiError && (e.status === 0 || e.status >= 500)) { await settleOutcome(); return; }
      const x = explain(e);
      setErr(x.text);
      if (x.retry) setStage("validated"); // the uploaded chunks are still valid: just press restore again
      else { api.post("/api/restore/cancel", { restoreId }).catch(() => {}); setFile(null); setRestoreId(""); setConfirmText(""); setStage("pick"); }
    }
  }

  const totalRows = file ? Object.values(file.counts).reduce((n, v) => n + v, 0) : 0;

  return (
    <div class="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div class="modal" role="dialog" aria-label="กู้คืนข้อมูล" style="max-width:520px">
        <div class="row" style="justify-content:space-between;margin-bottom:12px">
          <h2 style="font-size:18px">กู้คืนข้อมูลจากไฟล์สำรอง</h2>
          {stage !== "running" && <button class="icon ghost" aria-label="ปิด" onClick={close}><Icon name="x" /></button>}
        </div>

        {stage === "pick" && (
          <>
            <div class="page-sub" style="margin-bottom:10px">เลือกไฟล์สำรอง (.json) ที่เคยดาวน์โหลดไว้ ระบบจะตรวจความถูกต้องก่อน</div>
            <input type="file" accept="application/json,.json" onChange={onPick} />
          </>
        )}

        {(stage === "validated" || stage === "running") && file && (
          <>
            <div class="card" style="background:var(--surface-1);margin-bottom:10px">
              <div class="page-sub">ไฟล์สำรองเมื่อ {new Date(file.exported_at).toLocaleString("th-TH")}</div>
              <div style="font-size:14px;margin-top:4px">นักเรียน {file.counts.students ?? 0} · งาน {file.counts.assignments ?? 0} · ส่งงาน {file.counts.submissions ?? 0} · เช็คชื่อ {file.counts.attendance ?? 0}</div>
              <div class="page-sub" style="margin-top:4px">รวม {totalRows} แถว</div>
            </div>
            <div style="background:var(--bg-warning);color:var(--text-warning);border-radius:var(--radius-sm);padding:10px 12px;font-size:13px;margin-bottom:10px">
              <div><Icon name="alert-triangle" size={14} /> <b style="font-weight:500">กู้คืนแทนข้อมูลปัจจุบัน</b> — ข้อมูลที่เกิดหลังวันที่สำรองจะหายไป</div>
              <div style="margin-top:4px;opacity:.9">ระบบดาวน์โหลดสำรองข้อมูลปัจจุบันให้อัตโนมัติก่อน และเปลี่ยนข้อมูลทีเดียวทั้งหมด ถ้าล้มเหลวจะไม่มีอะไรเปลี่ยน · รหัสผ่านและเครื่องที่เข้าระบบไว้ไม่ถูกแตะ</div>
            </div>
            {stage === "running" ? (
              <div class="row" style="gap:8px"><Icon name="loader-2" class="spin" /> {progress}</div>
            ) : (
              <>
                <label class="field"><span>พิมพ์คำว่า "ยืนยัน" เพื่อดำเนินการ</span>
                  <input value={confirmText} onInput={(e) => setConfirmText((e.target as HTMLInputElement).value)} />
                </label>
                <div class="row" style="justify-content:flex-end;gap:8px;margin-top:8px">
                  <button onClick={close}>ยกเลิก</button>
                  <button class="primary" onClick={execute} disabled={confirmText !== "ยืนยัน"}><Icon name="database-import" size={16} /> กู้คืน</button>
                </div>
              </>
            )}
          </>
        )}

        {stage === "unknown" && (
          <div>
            <div style="background:var(--bg-warning);color:var(--text-warning);border-radius:var(--radius-sm);padding:10px 12px;font-size:13px;margin-bottom:10px">
              <Icon name="help-circle" size={14} /> ยังไม่ทราบผลการกู้คืน — ห้ามเริ่มใหม่หรือแก้ข้อมูลจนกว่าจะตรวจสอบ
            </div>
            <div class="row" style="justify-content:flex-end;gap:8px">
              <button onClick={onClose}>ปิดไว้ก่อน</button>
              <button class="primary" onClick={settleOutcome}><Icon name="refresh" size={16} /> ตรวจสอบผล</button>
            </div>
          </div>
        )}

        {stage === "done" && (
          <div style="text-align:center;padding:16px">
            <div style="width:56px;height:56px;border-radius:50%;background:var(--fill-success);color:#fff;display:inline-flex;align-items:center;justify-content:center"><Icon name="check" size={30} /></div>
            <div style="font-size:16px;font-weight:500;margin-top:10px">กู้คืนข้อมูลสำเร็จ</div>
            <button class="primary" style="margin-top:12px" onClick={onDone}>เสร็จสิ้น</button>
          </div>
        )}

        {err && <div style="color:var(--text-danger);font-size:13px;margin-top:10px" role="alert">{err}</div>}
      </div>
    </div>
  );
}
