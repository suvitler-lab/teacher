import { useRef } from "preact/hooks";
import { Icon } from "../Icon";
import { GROUPS, SECTIONS, sectionDef, type SectionKey, type GroupKey } from "./sections/registry";
import { WarnDot } from "./sections/shared";

export type NavLayout = "side" | "tablet" | "phone";

/** Up / Down move the focus between the buttons of a list (Tab enters it, Enter picks: AC-213). */
function arrowKeys(root: HTMLElement | null, e: KeyboardEvent) {
  if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
  const items = [...(root?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
  const at = items.indexOf(document.activeElement as HTMLButtonElement);
  if (at < 0) return;
  e.preventDefault();
  items[(at + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length]?.focus();
}

/**
 * The list of sections. ≥ 1024: a sticky 14rem list on the left, five groups with a text heading each (AC-207).
 * 721–1023: the groups as a bar on top, the sections of the open group as 44px pills (AC-208).
 * ≤ 720: one vertical list, rows 56px (AC-209).
 */
export function SettingsNav({ layout, section, onPick, backupDue }: { layout: NavLayout; section: SectionKey; onPick: (k: SectionKey) => void; backupDue: boolean }) {
  const ref = useRef<HTMLElement>(null);
  const dot = (k: SectionKey) => k === "backup" && backupDue ? <WarnDot /> : null;
  const btn = (s: (typeof SECTIONS)[number]) => (
    <button key={s.key} class={section === s.key ? "on" : ""} aria-current={section === s.key ? "page" : undefined} onClick={() => onPick(s.key)}>
      <Icon name={s.icon} size={20} /> <span>{s.label}</span>{dot(s.key)}
    </button>
  );

  if (layout === "tablet") {
    const g = sectionDef(section).group;
    const first = (k: GroupKey) => SECTIONS.find((s) => s.group === k)!.key;
    return (
      <nav class="set-tabnav" aria-label="หมวดตั้งค่า" ref={ref}>
        <div class="set-groupbar">
          {GROUPS.map((x) => {
            const hasDot = backupDue && x.key === "account";
            return (
              <button key={x.key} class={"pill" + (g === x.key ? " on" : "")} aria-pressed={g === x.key} onClick={() => g !== x.key && onPick(first(x.key))}>
                <Icon name={x.icon} size={20} /> {x.label}{hasDot && <WarnDot />}
              </button>
            );
          })}
        </div>
        <div class="set-pills">
          {SECTIONS.filter((s) => s.group === g).map((s) => (
            <button key={s.key} class={"pill" + (section === s.key ? " on" : "")} aria-current={section === s.key ? "page" : undefined} onClick={() => onPick(s.key)}>
              <Icon name={s.icon} size={20} /> {s.label}{dot(s.key)}
            </button>
          ))}
        </div>
      </nav>
    );
  }

  return (
    <nav class={layout === "phone" ? "set-nav set-nav-phone" : "set-nav"} aria-label="หมวดตั้งค่า" ref={ref} onKeyDown={(e) => arrowKeys(ref.current, e as unknown as KeyboardEvent)}>
      {GROUPS.map((g) => (
        <div class="set-nav-group" key={g.key}>
          <p class="set-nav-gh">{g.label}</p>
          {SECTIONS.filter((s) => s.group === g.key).map(btn)}
        </div>
      ))}
    </nav>
  );
}
