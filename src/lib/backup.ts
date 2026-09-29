import { api } from "./api";
import { settings } from "../store";

const TABLES = [
  "settings", "terms", "classes", "subjects", "work_types", "students",
  "revoked_qr_tokens", "assignments", "assignment_classes", "scan_sessions",
  "submissions", "attendance_sessions", "attendance",
];

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface BackupFile {
  app: "ngankrob";
  schema_version: number;
  exported_at: number;
  counts: Record<string, number>;
  sha256: string;
  /** what the server's data looked like when this was read — the same before and after, or the file would not exist */
  fingerprint?: string;
  data: Record<string, any[]>;
}

/** The data kept changing while it was being read (another device was saving), on every attempt. */
export class BackupInconsistentError extends Error {
  constructor() {
    super("ข้อมูลมีการเปลี่ยนแปลงตลอดระหว่างสำรอง (มีเครื่องอื่นกำลังบันทึกอยู่) — รอสักครู่ให้หยุดสแกน/เช็คชื่อ แล้วลองใหม่");
  }
}

/** The file's name carries the date in Bangkok — a backup taken at 06:00 there is still that day (UTC would call it yesterday). */
export function backupFileName(at: number = Date.now()): string {
  return `ngankrob-backup-${new Date(at + 7 * 3600_000).toISOString().slice(0, 10)}.json`;
}

const ATTEMPTS = 3;
const fingerprint = async () => (await api.get<{ fingerprint: string }>("/api/backup/fingerprint")).fingerprint;

async function readAll() {
  const data: Record<string, any[]> = {};
  const counts: Record<string, number> = {};
  let schemaVersion = 1;
  for (const table of TABLES) {
    const rows: any[] = [];
    let cursor: number | null = 0;
    while (cursor !== null) {
      const res: { rows: any[]; nextCursor: number | null; schema_version: number } =
        await api.get(`/api/backup?table=${table}&cursor=${cursor}`);
      rows.push(...res.rows);
      cursor = res.nextCursor;
      schemaVersion = res.schema_version;
    }
    data[table] = rows;
    counts[table] = rows.length;
  }
  return { data, counts, schemaVersion };
}

/**
 * Download all data as one JSON file (paginated reads to respect CPU limits).
 * The read is repeated if the data changed while it was going on: a file that is half before and half after another
 * device's save is worse than no file, because it looks fine.
 */
export async function runBackup(opts: { onRetry?: (attempt: number) => void } = {}): Promise<BackupFile> {
  let taken: (Awaited<ReturnType<typeof readAll>> & { fingerprint: string }) | null = null;
  for (let attempt = 1; attempt <= ATTEMPTS && !taken; attempt++) {
    const before = await fingerprint();
    const read = await readAll();
    const after = await fingerprint();
    if (before === after) taken = { ...read, fingerprint: after };
    else if (attempt < ATTEMPTS) opts.onRetry?.(attempt);
  }
  if (!taken) throw new BackupInconsistentError();

  const sha = await sha256Hex(JSON.stringify(taken.data));
  const file: BackupFile = {
    app: "ngankrob",
    schema_version: taken.schemaVersion,
    exported_at: Date.now(),
    counts: taken.counts,
    sha256: sha,
    fingerprint: taken.fingerprint,
    data: taken.data,
  };
  // trigger download
  const blob = new Blob([JSON.stringify(file)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = backupFileName();
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  // record last backup time — on the server AND on screen right away (Home and Settings both warn from it)
  const at = String(Date.now());
  api.put("/api/settings", { last_backup_at: at })
    .then(() => { if (settings.value) settings.value = { ...settings.value, last_backup_at: at }; })
    .catch(() => {});
  return file;
}
