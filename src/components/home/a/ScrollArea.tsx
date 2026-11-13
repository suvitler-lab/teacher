// Layout ก on a wide, short screen (คอม 1536×729, iPad นอน): the page itself does not scroll, so the long lists scroll inside their
// card. This box is that scroll region: focusable with the keyboard only while it really scrolls, named for screen readers, and
// with a visible 44px cue under it ("เลื่อนดูต่อ" / "กลับขึ้นบนสุด") that is there whenever the content is taller than the box.
// On narrow screens nothing is taller than the box (the CSS lets it grow), so there is no cue and the page scrolls as before.
import { useEffect, useRef, useState } from "preact/hooks";
import type { ComponentChildren } from "preact";
import { Icon } from "../../Icon";

interface Props {
  /** "aside" keeps the side cards a landmark; "div" gets role=region */
  tag?: "div" | "aside";
  wrap: string;
  class: string;
  label: string;
  children: ComponentChildren;
}

export function ScrollArea({ tag = "div", wrap, class: cls, label, children }: Props) {
  const ref = useRef<HTMLElement>(null);
  const [scrolls, setScrolls] = useState(false);
  const [atEnd, setAtEnd] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => {
      const over = el.scrollHeight - el.clientHeight > 4;
      setScrolls(over);
      setAtEnd(over && el.scrollTop + el.clientHeight >= el.scrollHeight - 4);
    };
    check();
    el.addEventListener("scroll", check, { passive: true });
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(check) : null;
    ro?.observe(el);
    const watched = new Set<Element>();
    const watch = () => {
      const now = new Set<Element>(Array.from(el.children));
      for (const c of watched) if (!now.has(c)) { ro?.unobserve(c); watched.delete(c); }
      for (const c of now) if (!watched.has(c)) { ro?.observe(c); watched.add(c); }
    };
    watch();
    // cards added or removed after mount: observe the new ones and measure again (R-18)
    const mo = typeof MutationObserver !== "undefined" ? new MutationObserver(() => { watch(); check(); }) : null;
    mo?.observe(el, { childList: true });
    return () => { el.removeEventListener("scroll", check); ro?.disconnect(); mo?.disconnect(); };
  }, []);

  // no smooth scrolling: the app has no motion (the jump is one box-height minus a little, so a row is never skipped)
  const go = () => {
    const el = ref.current;
    if (!el) return;
    if (atEnd) el.scrollTo({ top: 0 });
    else el.scrollBy({ top: Math.max(80, el.clientHeight - 64) });
  };

  const Tag = tag;
  const role = tag === "div" ? ("region" as const) : undefined;
  return (
    <div class={wrap} data-scrolls={scrolls ? "1" : undefined}>
      <Tag ref={ref as never} class={cls} aria-label={label} tabIndex={scrolls ? 0 : undefined} role={role}>{children}</Tag>
      {scrolls && (
        <button type="button" class="hma-more" onClick={go} aria-label={atEnd ? `${label} · กลับขึ้นบนสุด` : `${label} · เลื่อนดูต่อ`}>
          <Icon name={atEnd ? "chevron-up" : "chevron-down"} size={20} />{atEnd ? "กลับขึ้นบนสุด" : "เลื่อนดูต่อ"}
        </button>
      )}
    </div>
  );
}
