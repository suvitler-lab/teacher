// Reads student rows pasted from Excel or read from a .csv: code | prefix first-name last-name | number.

export interface ImportRow { code: string; prefix: string; first_name: string; last_name: string; number: number | null }

export interface ParsedImport {
  rows: ImportRow[];
  /** lines with no readable code or first name — shown, never dropped silently */
  skipped: string[];
  /** lines that have a code and a first name but no last name: the add form requires one, so they are NOT in `rows` */
  noLastName: string[];
  /** rows kept in `rows` whose class number was not a whole number from 1 to 99 (e.g. -3, 2.5, 0): the number is left empty */
  badNumber: { code: string; text: string }[];
}

const PREFIX = /^(ด\.ช\.|ด\.ญ\.|นาย|น\.ส\.|เด็กชาย|เด็กหญิง)$/;

/**
 * A student code the import can find in a line: 3-30 letters/digits (English letters), at least one digit
 * (so an English first name is not mistaken for the code). 10501 and P001 both qualify.
 */
export const IMPORT_CODE = /^(?=.*\d)[A-Za-z0-9]{3,30}$/;
/** The same rule as a sentence, for the hints on screen. */
export const CODE_RULE_TEXT = "รหัสนักเรียนยาว 3 ตัวขึ้นไป เป็นตัวเลขหรือตัวอักษรอังกฤษ เช่น 10501 หรือ P001";

/**
 * Split text into records of cells the way a spreadsheet's .csv does (RFC 4180): cells are separated by tab or comma,
 * records by a line break; a cell that STARTS with a double quote runs to the closing quote, so commas, tabs and
 * line breaks inside it stay in the cell, and "" inside it is one quote. A quote anywhere else is an ordinary
 * character, and an opening quote that is never closed is too (otherwise it would swallow the rest of the file).
 */
function splitRecords(text: string): { cells: string[]; raw: string }[] {
  const literal = new Set<number>();
  for (;;) {
    const res = scan(text, literal);
    if (typeof res !== "number") return res;
    literal.add(res);
  }
}

/** The records, or the position of an opening quote that never closes. */
function scan(text: string, literal: Set<number>): { cells: string[]; raw: string }[] | number {
  const out: { cells: string[]; raw: string }[] = [];
  let cells: string[] = [], buf = "", start = 0, atStart = true, i = 0;
  const endRecord = (end: number) => {
    cells.push(buf); buf = "";
    out.push({ cells, raw: text.slice(start, end).replace(/\s*[\r\n]+\s*/g, " ").trim() });
    cells = []; start = end + 1; atStart = true;
  };
  while (i < text.length) {
    const ch = text[i];
    if (ch === '"' && atStart && !literal.has(i)) {
      let j = i + 1, q = "";
      for (;;) {
        if (j >= text.length) return i;
        if (text[j] === '"') { if (text[j + 1] === '"') { q += '"'; j += 2; continue; } break; }
        q += text[j++];
      }
      buf = q; atStart = false; i = j + 1;
    } else if (ch === "\t" || ch === ",") { cells.push(buf); buf = ""; atStart = true; i++; }
    else if (ch === "\n") { endRecord(i); i++; }
    else { if (ch !== "\r") { buf += ch; atStart = false; } i++; }
  }
  endRecord(text.length);
  return out;
}

export function parseImport(text: string): ParsedImport {
  const rows: ImportRow[] = [];
  const skipped: string[] = [], noLastName: string[] = [];
  const badNumber: { code: string; text: string }[] = [];
  for (const rec of splitRecords(text)) {
    // split on tabs/commas AND spaces: a cell like "ด.ช. ภูมิพัฒน์ ใจดี" (the format in the
    // placeholder) must become prefix + first name + last name, not one giant "first name"
    const cols = rec.cells.flatMap((c) => c.split(/[\s,]+/)).filter(Boolean);
    if (cols.length === 0) continue;
    let code = "", num: number | null = null, prefix = "";
    const words: string[] = [];
    for (const c of cols) {
      if (!code && IMPORT_CODE.test(c)) code = c;
      // a second long number (Excel often repeats the student ID in another column) is not part of a name
      else if (c === code || /^\d{3,}$/.test(c)) continue;
      else if (PREFIX.test(c)) prefix = c;
      else words.push(c);
    }
    let bad = "";
    const tail = words[words.length - 1];
    if (tail !== undefined && /^[+-]?\d+(\.\d+)?$/.test(tail)) {
      words.pop();
      // a class number is a whole number from 1 to 99; -3, 2.5 and 0 are not names either, so they never end up in the surname
      if (/^\d{1,2}$/.test(tail) && Number(tail) >= 1) num = Number(tail); else bad = tail;
    }
    const first = words.shift() ?? "";
    if (!code || !first) { skipped.push(rec.raw); continue; } // a line we can't read is shown, not silently dropped
    if (words.length === 0) { noLastName.push(rec.raw); continue; } // the add form requires a last name: so does this
    if (bad) badNumber.push({ code, text: bad });
    rows.push({ code, prefix, first_name: first, last_name: words.join(" "), number: num });
  }
  return { rows, skipped, noLastName, badNumber };
}

export interface StudentFormErrors { code?: string; first_name?: string; last_name?: string; number?: string }
export const REQUIRED_FIELDS_TEXT = "กรอกชื่อ สกุล และรหัสนักเรียนให้ครบ";

/**
 * Check the add/edit student form before it is sent: name, last name and code are required (trimmed); the number is
 * empty or a whole number from 1. A NEW or CHANGED code must follow the import's rule (3+ English letters/digits);
 * an old code left as it is is not re-judged, so an existing child can still be edited.
 */
export function studentFormErrors(f: { code: string; first_name: string; last_name: string; number: number | "" | null }, originalCode?: string | null): StudentFormErrors {
  const e: StudentFormErrors = {};
  const code = f.code.trim();
  if (!code) e.code = "กรอกรหัสนักเรียน";
  else if (code !== (originalCode ?? null) && !/^[A-Za-z0-9]{3,30}$/.test(code)) e.code = "รหัสนักเรียนต้องยาว 3 ตัวขึ้นไป ใช้ตัวเลขหรือตัวอักษรอังกฤษ เช่น 10501 หรือ P001";
  if (!f.first_name.trim()) e.first_name = "กรอกชื่อ";
  if (!f.last_name.trim()) e.last_name = "กรอกสกุล";
  if (f.number !== "" && f.number != null && (!Number.isInteger(f.number) || f.number < 1)) e.number = "เลขที่ต้องเป็นจำนวนเต็มตั้งแต่ 1 ขึ้นไป (หรือเว้นว่าง)";
  return e;
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
