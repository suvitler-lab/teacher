import type { ComponentChildren } from "preact";
import { Icon } from "../Icon";

export type Tone = "danger" | "warning" | "muted" | "accent" | "success";

/** A status label: always an icon AND words, so the colour is never the only signal. */
export function Chip({ tone, icon, children }: { tone: Tone; icon?: string; children: ComponentChildren }) {
  return <span class={"hm-chip " + tone}>{icon && <Icon name={icon} size={16} />}{children}</span>;
}

/** The same label as a button (it goes somewhere). */
export function ChipButton({ tone = "muted", icon, onClick, children, label }: {
  tone?: Tone; icon?: string; onClick: () => void; children: ComponentChildren; label?: string;
}) {
  return <button type="button" class={"hm-chip hm-chipbtn " + tone} onClick={onClick} aria-label={label}>{icon && <Icon name={icon} size={16} />}{children}</button>;
}

/** The thin bar of a row ("30/44 handed in"): a real progressbar with words for a screen reader, not just a coloured strip. */
export function Bar({ pct, tone, label }: { pct: number; tone?: string; label: string }) {
  const v = Math.max(0, Math.min(100, pct));
  return (
    <div class="pbar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v)} aria-label={label}>
      <div style={`width:${v}%${tone ? `;background:${tone}` : ""}`} />
    </div>
  );
}

/** Title row of a card: heading, optional extra control, optional link to the page behind it. */
export function CardHead({ id, icon, title, link, onLink, extra }: {
  id: string; icon: string; title: string; link?: string; onLink?: () => void; extra?: ComponentChildren;
}) {
  return (
    <div class="hm-cardhead">
      <h2 id={id}><Icon name={icon} size={20} />{title}</h2>
      {extra}
      {link && <button class="lk" onClick={onLink}>{link}</button>}
    </div>
  );
}
