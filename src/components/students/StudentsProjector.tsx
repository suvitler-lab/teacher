import { useEffect, useRef, useState } from "preact/hooks";
import "../../styles/projector.css";
import { Icon } from "../Icon";
import { pjTheme, pjSize, pjHint, exitProjector, PJ_HOLD_MS } from "../../lib/projector";
import type { HeroNumbers } from "./studentsLogic";

/**
 * AC-197: the TV frame of the students page. Same look and exit as ProjectorShell (hold × for 1 s, or Esc, focus returns to the opener,
 * everything behind is `inert`). NOTE for PM: Projector.tsx has no "students" page yet — when it does, swap this frame for
 * `<ProjectorShell page="students">` (see dev-notes/T-51.md). The body carries NO name, code or per-child number, whatever the switches say.
 */
function ProjectorFrame({ children }: { children: preact.ComponentChildren }) {
  const [p, setP] = useState(0);
  const hold = useRef<number | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const stop = (short: boolean) => {
    if (hold.current == null) return;
    cancelAnimationFrame(hold.current); hold.current = null; setP(0);
    if (short) { pjHint.value = true; setTimeout(() => { pjHint.value = false; }, 3000); }
  };
  const begin = () => {
    stop(false);
    const t0 = performance.now();
    const step = () => {
      const pct = Math.min(100, ((performance.now() - t0) / PJ_HOLD_MS) * 100);
      setP(pct);
      if (pct >= 100) { hold.current = null; exitProjector(); return; }
      hold.current = requestAnimationFrame(step);
    };
    hold.current = requestAnimationFrame(step);
  };
  useEffect(() => {
    const me = root.current;
    if (!me) return;
    const opener = document.activeElement as HTMLElement | null;
    const marked: Element[] = [];
    for (let node: Element = me; node.parentElement; node = node.parentElement) {
      for (const sib of Array.from(node.parentElement.children)) {
        if (sib !== node && !sib.hasAttribute("inert") && sib.tagName !== "SCRIPT") { sib.setAttribute("inert", ""); sib.setAttribute("aria-hidden", "true"); marked.push(sib); }
      }
    }
    me.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") exitProjector(); };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      for (const el of marked) { el.removeAttribute("inert"); el.removeAttribute("aria-hidden"); }
      if (opener && opener !== document.body && opener.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);
  return (
    <div class="pj" ref={root} tabIndex={-1} data-th={pjTheme.value} data-sz={pjSize.value} role="region" aria-label="โหมดฉายจอ: นักเรียน">
      <div class="pjbar">
        <h1><Icon name="id-badge-2" size={44} />นักเรียน</h1>
        <div class="row" style="gap:16px">
          <span class="live" role="status"><i />กำลังฉายจอ</span>
          <button class="exit" aria-label="ออกจากโหมดฉายจอ — กดค้าง 1 วินาที" style={`--p:${p}`}
            onPointerDown={begin} onPointerUp={() => stop(true)} onPointerCancel={() => stop(false)} onPointerLeave={() => stop(false)}
            onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && !e.repeat) { e.preventDefault(); begin(); } }}
            onKeyUp={(e) => { if (e.key === "Enter" || e.key === " ") stop(true); }}>
            <Icon name="x" size={34} />
          </button>
        </div>
      </div>
      {pjHint.value && <div class="hint" role="status">กดค้างเพื่อออกจากโหมดฉายจอ</div>}
      <div class="body">{children}</div>
    </div>
  );
}

export function StudentsProjector({ className, n, ready }: { className: string; n: HeroNumbers; ready: boolean }) {
  const dash = "—";
  return (
    <ProjectorFrame>
      <div class="s2" style="font-size:calc(var(--pj-u)*34);color:var(--pj-t1);font-weight:600;flex:none">{className} · ทุกวิชา · ทั้งเทอม</div>
      <div class="stu-pj-nums">
        <div><div class="stat">{n.total}</div><div class="s2">นักเรียน</div></div>
        <div><div class="stat">{ready ? n.done : dash}</div><div class="s2">ส่งงานครบ</div></div>
        <div><div class="stat">{ready ? n.withMissing : dash}</div><div class="s2">มีงานค้าง</div></div>
        <div><div class="stat">{ready && n.avgAtt != null ? n.avgAtt + "%" : dash}</div><div class="s2">มาเรียนเฉลี่ย</div></div>
      </div>
      <div class="s2" style="flex:none;font-size:calc(var(--pj-u)*22)">ไม่มีชื่อนักเรียนบนจอนี้</div>
      <div class="s2" style="flex:none;font-size:calc(var(--pj-u)*22)">ปิดอยู่ตอนฉายจอ: เพิ่ม · นำเข้า · แก้ไข · บัตร QR · พิมพ์ · คัดลอก — ตัวเลขรายคนไม่แสดงบนจอนี้</div>
    </ProjectorFrame>
  );
}
