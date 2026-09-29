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
