// The sample roster file of the import box (P7, AC-195): built in the browser with exceljs (already in the app), works offline,
// made-up names only. The reader (`parseImport`) must read it back as exactly two rows.

export const TEMPLATE_FILE_NAME = "ตัวอย่างรายชื่อ.xlsx";
export const TEMPLATE_HEADER = ["รหัส", "คำนำหน้า", "ชื่อ", "สกุล", "เลขที่"] as const;
export const TEMPLATE_ROWS: (string | number)[][] = [
  ["10501", "ด.ช.", "สมมติ", "ตัวอย่าง", 1],
  ["10502", "ด.ญ.", "ทดลอง", "ใจดี", 2],
];

/** A line that is only the table's head ("รหัส คำนำหน้า ชื่อ สกุล เลขที่"): not a student, not a warning. */
export function isHeaderLine(raw: string): boolean {
  const t = raw.replace(/\s+/g, " ").trim();
  return /^(รหัส|code)/i.test(t) && /ชื่อ|name/i.test(t);
}

/** The bytes of the sample .xlsx. */
export async function buildTemplateBuffer(): Promise<ArrayBuffer> {
  const ExcelJS: any = (await import("exceljs")).default ?? (await import("exceljs"));
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("รายชื่อ");
  ws.addRow([...TEMPLATE_HEADER]).font = { bold: true };
  for (const r of TEMPLATE_ROWS) ws.addRow(r);
  // the code is text so a leading zero survives
  ws.getColumn(1).numFmt = "@";
  ws.columns.forEach((c: any) => { c.width = 14; });
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

/** Save it from the browser (nothing is uploaded). */
export async function downloadTemplate(): Promise<void> {
  const buf = await buildTemplateBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = TEMPLATE_FILE_NAME;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}
