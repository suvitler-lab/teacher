import { Icon } from "../../Icon";
import type { Settings } from "@shared/types";
import { currentTerm } from "../../../store";
import { SettingsCards } from "../SettingsCards";
import { Scope, SaveMode } from "./shared";
import { todoItems } from "./todo";
import type { SectionKey, CatalogTab } from "./registry";

type Go = (section: SectionKey, tab?: CatalogTab) => void;

/** ภาพรวม: the "ต้องทำ" strip (none = hidden) -> the five cards -> school / teacher name (AC-223). */
export function GeneralSection({ draft, set, lastBackup, onBackup, onRestore, go }: {
  draft: Settings; set: <K extends keyof Settings>(k: K, v: Settings[K]) => void;
  lastBackup: number; onBackup: () => void; onRestore: () => void; go: Go;
}) {
  const todo = todoItems(currentTerm.value, lastBackup);
  return (
    <div class="set-forms">
      <h2 class="sr-only" id="se-gt">ภาพรวม</h2>
      {todo.length > 0 && (
        <section class="set-todo" aria-labelledby="se-td">
          <h3 id="se-td" class="set-todo-h"><Icon name="alert-triangle" size={20} /> ต้องทำ {todo.length} เรื่อง</h3>
          <ul>
            {todo.map((t) => (
              <li key={t.id}>
                <span class="grow">{t.text}</span>
                <button onClick={() => go(t.go.section, t.go.tab)}>{t.cta} ›</button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <SettingsCards lastBackup={lastBackup} onBackup={onBackup} onRestore={onRestore} goSection={(x) => go(x)} goTerms={() => go("catalog", "terms")} />
      <section class="card" aria-labelledby="se-gh">
        <h2 id="se-gh" class="set-section-title"><Icon name="school" /> ข้อมูลโรงเรียน <Scope all /></h2>
        <div class="modal-grid2">
          <label class="field"><span>ชื่อโรงเรียน</span><input value={draft.school_name} placeholder="เช่น โรงเรียนบ้านตัวอย่าง" onInput={(e) => set("school_name", (e.target as HTMLInputElement).value)} /></label>
          <label class="field"><span>ชื่อครู</span><input value={draft.teacher_name} placeholder="เช่น ครูสมชาย" onInput={(e) => set("teacher_name", (e.target as HTMLInputElement).value)} /></label>
        </div>
        <SaveMode mode="form" />
      </section>
      <div class="set-row set-moved">
        <div class="set-l"><div class="set-label">หน้าตา: ธีม สว่าง/มืด ขนาดตัวอักษร</div><div class="page-sub">ย้ายไปอยู่ที่หมวด หน้าตา แล้ว</div></div>
        <div class="set-r"><button onClick={() => go("appearance")}>ย้ายไป หน้าตา ›</button></div>
      </div>
    </div>
  );
}
