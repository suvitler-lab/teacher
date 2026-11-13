import { Icon } from "../../Icon";
import { TypeEditor } from "../../CatalogEditor";

/** ประเภทงาน — its own section in the teaching group (AC-234). Add, edit, order and keep; there is no delete. */
export function WorktypesSection() {
  return (
    <section class="card" aria-labelledby="se-wt">
      <h2 id="se-wt" class="set-section-title"><Icon name="file-text" /> ประเภทงาน</h2>
      <p class="page-sub" style="margin:0 0 8px">ใช้เลือกตอนสร้างงาน เช่น ใบงาน การบ้าน สอบ · แก้ที่นี่แล้วมีผลกับงานที่สร้างใหม่</p>
      <TypeEditor />
    </section>
  );
}
