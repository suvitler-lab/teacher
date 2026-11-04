// Reads student rows pasted from Excel: code | prefix first-name last-name | number.

export interface ImportRow { code: string; prefix: string; first_name: string; last_name: string; number: number | null }

const PREFIX = /^(ด\.ช\.|ด\.ญ\.|นาย|น\.ส\.|เด็กชาย|เด็กหญิง)$/;

export function parseImport(text: string): { rows: ImportRow[]; skipped: string[] } {
  const rows: ImportRow[] = [];
  const skipped: string[] = [];
  for (const line of text.split("\n").map((l) => l.trim()).filter(Boolean)) {
    // split on tabs/commas AND spaces: a cell like "ด.ช. ภูมิพัฒน์ ใจดี" (the format in the
    // placeholder) must become prefix + first name + last name, not one giant "first name"
    const cols = line.split(/[\t,]|\s+/).map((c) => c.trim()).filter(Boolean);
    let code = "", num: number | null = null, prefix = "";
    const words: string[] = [];
    for (const c of cols) {
      if (!code && /^\d{3,}$/.test(c)) code = c;
      // a second long number (Excel often repeats the student ID in another column) is not part of a name
      else if (/^\d{3,}$/.test(c)) continue;
      else if (PREFIX.test(c)) prefix = c;
      else words.push(c);
    }
    if (words.length && /^\d{1,2}$/.test(words[words.length - 1])) num = Number(words.pop());
    const first = words.shift() ?? "";
    if (!code || !first) { skipped.push(line); continue; } // a line we can't read is shown, not silently dropped
    rows.push({ code, prefix, first_name: first, last_name: words.join(" "), number: num });
  }
  return { rows, skipped };
}

/** The text the paste box would hold for one worksheet row: its cells joined by tabs (the parser splits on tabs, commas and spaces). */
export function rowsToText(rows: unknown[][]): string {
  return rows.map((r) => r.map((c) => (c == null ? "" : String(c).trim())).filter((c) => c !== "").join("\t")).filter(Boolean).join("\n");
}

export interface SheetText { name: string; text: string }

/**
 * Read a chosen file as one or more sheets of paste-box text. .csv/.txt are one sheet named after the file; .xlsx gives every visible
 * worksheet (read by exceljs in the browser — nothing is uploaded). The teacher picks the sheet when there are several.
 */
export async function fileToSheets(file: File): Promise<SheetText[]> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx")) {
    const ExcelJS: any = (await import("exceljs")).default ?? (await import("exceljs"));
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await file.arrayBuffer());
    const out: SheetText[] = [];
    for (const ws of wb.worksheets as any[]) {
      if (ws.state === "hidden" || ws.state === "veryHidden") continue;
      const rows: unknown[][] = [];
      ws.eachRow({ includeEmpty: false }, (row: any) => {
        // exceljs numbers cells from 1; a formula/rich cell gives {result} / {richText}
        const cells: unknown[] = [];
        row.eachCell({ includeEmpty: false }, (cell: any) => {
          const v = cell.value;
          cells.push(v && typeof v === "object" ? ("result" in v ? v.result : "richText" in v ? v.richText.map((t: any) => t.text).join("") : "text" in v ? v.text : String(v)) : v);
        });
        rows.push(cells);
      });
      out.push({ name: String(ws.name ?? ""), text: rowsToText(rows) });
    }
    return out;
  }
  if (name.endsWith(".xls")) throw new Error("ไฟล์ .xls รุ่นเก่าอ่านไม่ได้ — บันทึกเป็น .xlsx หรือ .csv ใน Excel ก่อน");
  return [{ name: file.name, text: (await file.text()).replace(/^﻿/, "") }];
}

/** Which sheet to open first: the first one that holds readable students (the others are often notes or a cover page). */
export function bestSheet(sheets: SheetText[]): number {
  const i = sheets.findIndex((s) => parseImport(s.text).rows.length > 0);
  return i >= 0 ? i : 0;
}

/** Read a student list from a chosen file (its best sheet). */
export async function fileToText(file: File): Promise<string> {
  const sheets = await fileToSheets(file);
  return sheets[bestSheet(sheets)]?.text ?? "";
}
