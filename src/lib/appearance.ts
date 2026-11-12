// Look of the app: skin (มืออาชีพ / อบอุ่น / สดใส) and home layout (ก / ข / ค). D41 / EP-07 (v10).
// Kept in the existing setting `accent` as JSON, copied on this device (ngankrob-skin / ngankrob-layout) so a reload
// paints the right colours at once. The server's value is adopted once, when the app opens (AC-03: nothing changes
// under the teacher's hands). An app that starts from the copy saved on this device (offline) does NOT adopt that copy's
// look: it may be older than what the teacher chose here; the server's value is adopted when it first answers (AC-04).
// Light / dark stays the old `theme` setting (A2).
import { signal, type ReadonlySignal } from "@preact/signals";
import type { Bootstrap, Settings } from "@shared/types";
import { settings } from "../store";
import { api } from "./api";
import { kvUpdate } from "./idb";
import { err, ok } from "./notify";
import { setThemeAttr, saveThemeLocal, type ThemeChoice } from "./theme";
import { loadSkinAssets } from "./fonts";

export type Skin = "pro" | "warm" | "playful";
export type Layout = "a" | "b" | "c";
export interface Appearance { skin: Skin; layout: Layout }

export const SKINS: readonly Skin[] = ["pro", "warm", "playful"];
export const LAYOUTS: readonly Layout[] = ["a", "b", "c"];
export const DEFAULT_APPEARANCE: Appearance = { skin: "warm", layout: "a" };

export const SKIN_KEY = "ngankrob-skin";
export const LAYOUT_KEY = "ngankrob-layout";

const asSkin = (v: unknown): Skin => (SKINS as readonly unknown[]).includes(v) ? (v as Skin) : DEFAULT_APPEARANCE.skin;
const asLayout = (v: unknown): Layout => (LAYOUTS as readonly unknown[]).includes(v) ? (v as Layout) : DEFAULT_APPEARANCE.layout;

/** Saved `accent` text -> a valid look. Each field falls back alone ("blue", "", not JSON, `luxe` ... -> defaults). */
export function parseAppearance(raw: string | null | undefined): Appearance {
  if (!raw || !raw.trim()) return { ...DEFAULT_APPEARANCE };
  let j: unknown;
  try { j = JSON.parse(raw); } catch { return { ...DEFAULT_APPEARANCE }; }
  if (!j || typeof j !== "object" || Array.isArray(j)) return { ...DEFAULT_APPEARANCE };
  const o = j as { skin?: unknown; layout?: unknown };
  return { skin: asSkin(o.skin), layout: asLayout(o.layout) };
}

export function serializeAppearance(a: Appearance): string {
  return JSON.stringify({ v: 1, skin: a.skin, layout: a.layout });
}

const state = signal<Appearance>({ ...DEFAULT_APPEARANCE });
/** The look on screen right now. */
export const appearance: ReadonlySignal<Appearance> = state;

/** The skin whose icon font has arrived: icons keep that weight until the new skin's font is ready, so they never blank out (R-04). */
const iconsReady = signal<Skin | null>(null);
export const iconSkin: ReadonlySignal<Skin | null> = iconsReady;

function show(a: Appearance) {
  const root = document.documentElement;
  root.setAttribute("data-skin", a.skin);
  root.setAttribute("data-layout", a.layout);
  state.value = a;
  void loadSkinAssets(a.skin).then(() => { if (state.peek().skin === a.skin) iconsReady.value = a.skin; });
}

function remember(a: Appearance) {
  try { localStorage.setItem(SKIN_KEY, a.skin); localStorage.setItem(LAYOUT_KEY, a.layout); } catch { /* private window */ }
}

function readStored(): Appearance {
  try {
    return { skin: asSkin(localStorage.getItem(SKIN_KEY)), layout: asLayout(localStorage.getItem(LAYOUT_KEY)) };
  } catch { return { ...DEFAULT_APPEARANCE }; }
}

let adopted = false;
let watching = false;
let deferred = false;
let unwatch: (() => void) | null = null;

/**
 * Call before the first render: paints the remembered look (or the default), then waits for the first settings that
 * arrive and adopts their `accent` once.
 */
export function applyStoredAppearance(): void {
  show(readStored());
  if (watching) return;
  watching = true;
  unwatch = settings.subscribe((s) => { if (!deferred) adoptFrom(s); });
}

function adoptFrom(s: Settings | null) {
  if (adopted || !s) return;
  adopted = true;
  const a = parseAppearance(s.accent);
  remember(a);
  const cur = state.peek();
  if (a.skin !== cur.skin || a.layout !== cur.layout) show(a);
}

/** The app is about to start from the copy saved on this device: do not take its look as the server's (R-01). */
export function deferAppearanceAdoption(): void { if (!adopted) deferred = true; }

/** The server has answered (live bootstrap): take its look now if nothing has been adopted yet (R-01, AC-04). */
export function adoptServerAppearance(): void {
  deferred = false;
  adoptFrom(settings.peek());
}

// One save at a time, in the order the teacher tapped (two quick taps must not reach the server swapped).
let chain: Promise<unknown> = Promise.resolve();

// What the server last confirmed, and the changes still on their way. What is on screen is always
// `confirmed + pending`, and every request carries `confirmed + its own change` only: a save that failed never
// rides along in the next request, and a failed save puts the screen back to what the server really has (R-03, R-3205).
interface Saved { accent: string; theme: Settings["theme"] }
interface Change { skin?: Skin; layout?: Layout; theme?: ThemeChoice }
let confirmed: Saved | null = null;
let pending: Change[] = [];

function applyChange(base: Saved, c: Change): Saved {
  const touchesLook = c.skin !== undefined || c.layout !== undefined;
  const cur = parseAppearance(base.accent);
  return {
    accent: touchesLook ? serializeAppearance({ skin: c.skin ?? cur.skin, layout: c.layout ?? cur.layout }) : base.accent,
    theme: c.theme ?? base.theme,
  };
}

/** Put on screen (and on this device) what `confirmed + pending` says. */
function paint(): void {
  const cur = settings.value;
  if (!cur || !confirmed) return;
  const want = pending.reduce(applyChange, confirmed);
  const look = parseAppearance(want.accent);
  const shown = state.peek();
  const themeWas = cur.theme;
  if (cur.accent !== want.accent || cur.theme !== want.theme) settings.value = { ...cur, accent: want.accent, theme: want.theme };
  if (look.skin !== shown.skin || look.layout !== shown.layout) { show(look); remember(look); }
  if (want.theme !== themeWas) { setThemeAttr(want.theme); saveThemeLocal(want.theme); }
}

export interface SaveOptions {
  /** The caller shows the result itself (a status line): no toast from here. */
  silent?: boolean;
}

/**
 * Change the look: the screen changes at once, one PUT /api/settings carries every key that changed (`accent`, `theme`).
 * If it fails or the device is offline the screen goes back to what the server has and says why (D38: nothing is queued).
 */
export function saveAppearance(next: Partial<Appearance> & { theme?: ThemeChoice }, opts: SaveOptions = {}): Promise<boolean> {
  const say = { ok: (m: string) => { if (!opts.silent) ok(m); }, err: (m: string) => { if (!opts.silent) err(m); } };
  const before = settings.value;
  if (!before) return Promise.resolve(false);
  const prev = state.value;
  const change: Change = {};
  if (next.skin !== undefined && next.skin !== prev.skin) change.skin = next.skin;
  if (next.layout !== undefined && next.layout !== prev.layout) change.layout = next.layout;
  if (next.theme !== undefined && next.theme !== before.theme) change.theme = next.theme;
  if (change.skin === undefined && change.layout === undefined && change.theme === undefined) return Promise.resolve(true);
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    say.err("ออฟไลน์ — เปลี่ยนหน้าตาได้เมื่อออนไลน์");
    return Promise.resolve(false);
  }
  if (pending.length === 0 || !confirmed) confirmed = { accent: before.accent, theme: before.theme }; // nothing pending: what is shown is what the server has
  pending.push(change);
  paint();
  const run = async (): Promise<boolean> => {
    const base = confirmed as Saved;
    const sent = applyChange(base, change);
    const body: Record<string, string> = {};
    if (change.skin !== undefined || change.layout !== undefined) body.accent = sent.accent;
    if (change.theme !== undefined) body.theme = sent.theme;
    const done = () => { pending = pending.filter((c) => c !== change); };
    try {
      await api.put("/api/settings", body);
      confirmed = sent;
      done();
      // the copy this device keeps for an offline start must carry the new look too (else it paints the old one, R-01)
      void kvUpdate<Bootstrap | null>("bootstrap", (b) => (b ? { ...b, settings: { ...b.settings, ...body } } : b));
      say.ok("บันทึกแล้ว · ใช้กับทุกเครื่อง");
      return true;
    } catch {
      done();
      paint(); // back to what the server has, plus the taps still waiting
      say.err(typeof navigator !== "undefined" && navigator.onLine === false ? "ออฟไลน์ — เปลี่ยนหน้าตาได้เมื่อออนไลน์" : "บันทึกหน้าตาไม่สำเร็จ");
      return false;
    }
  };
  const p = chain.then(run, run);
  chain = p;
  return p;
}

/** Test helper: forget that the server's value was adopted (a new app start). */
export function resetAppearanceForTests(): void {
  unwatch?.(); unwatch = null;
  adopted = false; watching = false; deferred = false;
  confirmed = null; pending = []; iconsReady.value = null;
  state.value = { ...DEFAULT_APPEARANCE };
}
