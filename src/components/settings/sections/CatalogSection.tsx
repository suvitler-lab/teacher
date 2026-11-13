import { Icon } from "../../Icon";
import { CatalogEditor } from "../../CatalogEditor";
import type { CatalogTab } from "./registry";

/** ห้องเรียน วิชา ภาคเรียน. `tab` (from `?tab=`) opens that tab of the editor; work types are their own section (WorktypesSection). */
export function CatalogSection({ tab }: { tab?: CatalogTab }) {
  return (
    <section class="card" aria-labelledby="se-ch">
      <h2 id="se-ch" class="set-section-title"><Icon name="books" /> ห้องเรียน วิชา ภาคเรียน</h2>
      <CatalogEditor initialTab={tab} />
    </section>
  );
}
