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
  data: Record<string, any[]>;
}

/** Download all data as one JSON file (paginated reads to respect CPU limits). */
export async function runBackup(): Promise<BackupFile> {
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
  const sha = await sha256Hex(JSON.stringify(data));
  const file: BackupFile = {
    app: "ngankrob",
    schema_version: schemaVersion,
    exported_at: Date.now(),
    counts,
    sha256: sha,
    data,
  };
  // trigger download
  const blob = new Blob([JSON.stringify(file)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const d = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `ngankrob-backup-${d}.json`;
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
