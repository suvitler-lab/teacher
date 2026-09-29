import { useEffect, useState } from "preact/hooks";
import { Icon } from "./Icon";
import { activeClasses, studentsByClass, settings, qrRotatedAt } from "../store";
import { fullName } from "../lib/names";
import { qrDataUrl } from "../lib/qr";

// A4 sticker layouts. cols/rows describe the print grid; label sizes are the
// common Thai A4 sticker stocks. The teacher should test-print on real paper.
const LAYOUTS = {
  card: { label: "บัตร 10 ดวง", cols: 2, note: "ตัดแปะ", qr: 92 },
  s21: { label: "21 ดวง", cols: 3, note: "70×42.3 มม.", qr: 68 },
  s40: { label: "40 ดวง", cols: 4, note: "52.5×29.7 มม.", qr: 52 },
} as const;
type LayoutKey = keyof typeof LAYOUTS;

export function StickerSheet({ classId, onClose }: { classId: string; onClose: () => void }) {
  const all = studentsByClass.value.get(classId) ?? [];
  const cls = activeClasses.value.find((c) => c.id === classId);
  const school = settings.value?.school_name ?? "";
  const [layout, setLayout] = useState<LayoutKey>("s21");
  const [scope, setScope] = useState<"all" | "rotated">("all");
  const [qrs, setQrs] = useState<Record<string, string>>({});

  const rotatedSet = qrRotatedAt.value;
  const students = scope === "rotated" ? all.filter((s) => rotatedSet[s.id]) : all;

  useEffect(() => {
    let alive = true;
    const size = LAYOUTS[layout].qr * 2;
    Promise.all(students.map((s) => qrDataUrl(s.qr_token, size).then((u) => [s.id, u] as const))).then((pairs) => { if (alive) setQrs(Object.fromEntries(pairs)); });
    return () => { alive = false; };
  }, [classId, layout, scope]);

  const ready = students.length > 0 && students.every((s) => qrs[s.id]);

  useEffect(() => {
    const on = () => document.body.classList.add("print-cards");
    const off = () => document.body.classList.remove("print-cards");
    window.addEventListener("beforeprint", on);
    window.addEventListener("afterprint", off);
    return () => { off(); window.removeEventListener("beforeprint", on); window.removeEventListener("afterprint", off); };
  }, []);

  function print() { document.body.classList.add("print-cards"); window.print(); document.body.classList.remove("print-cards"); }

  const L = LAYOUTS[layout];
  const perPage = { card: 10, s21: 21, s40: 40 }[layout];
  const pages = Math.max(1, Math.ceil(students.length / perPage));

  return (
    <div>
      <div class="print-toolbar no-print">
        <button onClick={onClose}><Icon name="arrow-left" size={16} /> กลับ</button>
        <span class="grow" />
        <div class="seg">
          {(Object.keys(LAYOUTS) as LayoutKey[]).map((k) => <button class={k === layout ? "on" : ""} onClick={() => setLayout(k)}>{LAYOUTS[k].label}</button>)}
        </div>
        <div class="seg">
          <button class={scope === "all" ? "on" : ""} onClick={() => setScope("all")}>ทั้งห้อง</button>
          <button class={scope === "rotated" ? "on" : ""} onClick={() => setScope("rotated")}>เฉพาะ QR ใหม่</button>
        </div>
        <span class="page-sub">{students.length} ดวง · {pages} แผ่น</span>
        <button class="primary" onClick={print} disabled={!ready}>{ready ? <Icon name="printer" size={16} /> : <Icon name="loader-2" class="spin" size={16} />} พิมพ์</button>
      </div>
      {students.length === 0 ? (
        <div class="card empty">ไม่มีบัตรให้พิมพ์ในเงื่อนไขนี้</div>
      ) : (
        <div class="sheet">
          <div class={"sticker-grid cols-" + L.cols}>
            {students.map((s) => (
              <div class="qr-card">
                <div class="info">
                  <div class="school"><Icon name="school" size={11} /> {school}</div>
                  <div class="sname">{fullName(s)}</div>
                  <div class="meta">ชั้น {cls?.name} · เลขที่ {s.number ?? "-"}</div>
                  <div class="code">{s.code}</div>
                </div>
                {qrs[s.id] && <img src={qrs[s.id]} alt={`QR ${s.code}`} style={`width:${L.qr}px;height:${L.qr}px`} />}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
