import type { ReportModel, ReportPayload } from "./report";

// "2026-09-30" -> "30/9" (day/month, the order Thai readers expect)
const dayMonth = (iso: string) => `${Number(iso.slice(8, 10))}/${Number(iso.slice(5, 7))}`;

const SHORT: Record<string, string> = { present: "ม", late: "ส", leave: "ล", sick: "ป", absent: "ข" };

export interface ExcelOpts {
  className: string;
  subjectName: string;
  periodLabel: string;
  workTypeName: (id: string | null) => string;
  fullName: (s: any) => string;
}

/** Build the .xlsx as an ArrayBuffer. DOM-free so it can be unit-tested in Node. */
export async function buildWorkbookBuffer(model: ReportModel, payload: ReportPayload, opts: ExcelOpts): Promise<ArrayBuffer> {
  const ExcelJS: any = (await import("exceljs")).default ?? (await import("exceljs"));
  const wb = new ExcelJS.Workbook();
  wb.creator = "งานครบ";
  wb.created = new Date();

  const headerStyle = {
    font: { bold: true, color: { argb: "FF12703F" } },
    fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FFE3F6EC" } },
    alignment: { vertical: "middle", horizontal: "center", wrapText: true },
    border: { bottom: { style: "thin", color: { argb: "FFBBBBBB" } } },
  };
  function styleHeader(row: any) {
    row.eachCell((cell: any) => Object.assign(cell, headerStyle));
    row.height = 28;
  }

  // ---- Sheet 1: สรุปรายคน ----
  const s1 = wb.addWorksheet("สรุปรายคน", { views: [{ state: "frozen", ySplit: 1, xSplit: 3 }] });
  s1.columns = [
    { header: "เลขที่", width: 8 },
    { header: "รหัสนักเรียน", width: 14 },
    { header: "ชื่อ - สกุล", width: 26 },
    { header: "ส่งแล้ว", width: 9 },
    { header: "ค้าง", width: 8 },
    { header: "% ส่ง", width: 9 },
    { header: "คะแนนรวม", width: 12 },
  ];
  styleHeader(s1.getRow(1));
  for (const r of model.students) {
    s1.addRow([r.student.number ?? "", r.student.code ?? "", opts.fullName(r.student), r.submitted, r.missing, r.percent + "%", `${r.score}/${r.fullScore}`]);
  }

  // ---- Sheet 2: คะแนนรายงาน ----
  const s2 = wb.addWorksheet("คะแนนรายงาน", { views: [{ state: "frozen", ySplit: 1, xSplit: 3 }] });
  const cols2 = [
    { header: "เลขที่", width: 8 },
    { header: "รหัสนักเรียน", width: 14 },
    { header: "ชื่อ - สกุล", width: 26 },
    ...payload.assignments.map((a) => ({ header: `${a.title} /${a.full_score}`, width: 16 })),
  ];
  s2.columns = cols2 as any;
  styleHeader(s2.getRow(1));
  const subMap = new Map(payload.submissions.map((s) => [`${s.assignment_id}:${s.student_id}`, s]));
  for (const st of payload.students) {
    const row: any[] = [st.number ?? "", st.code ?? "", opts.fullName(st)];
    for (const a of payload.assignments) {
      const sub = subMap.get(`${a.id}:${st.id}`);
      if (!sub || sub.status === "void") row.push(a.due_date && model.today > a.due_date ? "ไม่ส่ง" : "");
      else if (sub.status === "excused") row.push("ลา");
      else if (sub.score == null) row.push("รอตรวจ");
      else row.push(sub.score);
    }
    s2.addRow(row);
  }

  // ---- Sheet 3: attendance ----
  // One column per session: a school day (daily mode) or a day+period (per-subject mode).
  // A day with two periods therefore gets two columns — nothing is collapsed — and the
  // totals add up to exactly what the Reports page counts.
  const bySubject = payload.range?.att === "subject";
  const sessions = [...payload.attendanceSessions].sort(
    (x, y) => x.date.localeCompare(y.date) || (x.period ?? 0) - (y.period ?? 0),
  );
  const s3 = wb.addWorksheet(bySubject ? "เช็คชื่อรายคาบ" : "เช็คชื่อรายวัน", { views: [{ state: "frozen", ySplit: 1, xSplit: 3 }] });
  const attMap = new Map<string, string>(); // `${sessionId}:${studentId}` -> status
  for (const a of payload.attendance) attMap.set(`${a.session_id}:${a.student_id}`, a.status);
  s3.columns = [
    { header: "เลขที่", width: 8 },
    { header: "รหัสนักเรียน", width: 14 },
    { header: "ชื่อ - สกุล", width: 26 },
    ...sessions.map((x) => ({ header: bySubject ? `${dayMonth(x.date)} ค${x.period ?? "-"}` : dayMonth(x.date), width: bySubject ? 9 : 6 })),
    { header: "มา", width: 6 }, { header: "สาย", width: 6 }, { header: "ลา", width: 6 }, { header: "ป่วย", width: 6 }, { header: "ขาด", width: 6 },
    { header: "% มา", width: 8 },
  ] as any;
  styleHeader(s3.getRow(1));
  for (const st of payload.students) {
    const row: any[] = [st.number ?? "", st.code ?? "", opts.fullName(st)];
    const tally: Record<string, number> = { present: 0, late: 0, leave: 0, sick: 0, absent: 0 };
    for (const x of sessions) {
      const status = attMap.get(`${x.id}:${st.id}`) ?? "";
      if (status in tally) tally[status]++;
      row.push(status ? SHORT[status] : "");
    }
    const marked = tally.present + tally.late + tally.leave + tally.sick + tally.absent;
    // nothing checked is "no data", not 0%
    const pct = marked > 0 ? Math.round(((tally.present + tally.late) / marked) * 100) + "%" : "—";
    row.push(tally.present, tally.late, tally.leave, tally.sick, tally.absent, pct);
    s3.addRow(row);
  }

  // ---- Sheet 4: ภาพรวมห้อง ----
  const s4 = wb.addWorksheet("ภาพรวมห้อง", { views: [{ state: "frozen", ySplit: 1 }] });
  s4.columns = [
    { header: "งาน", width: 32 },
    { header: "ประเภท", width: 14 },
    { header: "เต็ม", width: 8 },
    { header: "ส่ง", width: 10 },
    { header: "% ส่ง", width: 9 },
    { header: "เฉลี่ย", width: 9 },
  ];
  styleHeader(s4.getRow(1));
  for (const a of model.assignments) {
    s4.addRow([
      a.assignment.title,
      opts.workTypeName(a.assignment.type_id),
      a.assignment.full_score,
      `${a.submitted}/${a.total}`,
      a.rate + "%",
      a.average,
    ]);
  }

  return wb.xlsx.writeBuffer();
}

/** The download's file name: no spaces, and no characters a file name cannot hold (“/” in ป.6/1 and 1/2569 most of all). */
export function excelFileName(opts: { className: string; subjectName: string; periodLabel: string }): string {
  const name = `สรุปงาน_${opts.className}_${opts.subjectName}_${opts.periodLabel}`.replace(/\s+/g, "").replace(/[\\/:*?"<>|]+/g, "-");
  return name + ".xlsx";
}

export async function exportExcel(model: ReportModel, payload: ReportPayload, opts: ExcelOpts) {
  const buf = await buildWorkbookBuffer(model, payload, opts);
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  // a class like ป.6/1 or a term like 1/2569 has a "/" in it, which a file name cannot have (the browser dropped the whole name)
  a.download = excelFileName(opts);
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
