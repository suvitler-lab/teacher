import { computed, type ReadonlySignal } from "@preact/signals";
import { settings } from "../store";
import { api } from "./api";
import { err } from "./notify";
import { defaultLayout, parseLayout, serializeLayout, type CardDef, type CardLayout } from "./cardLayout";
import type { Settings } from "@shared/types";

// The cards of the scan, attendance and random-name pages (the home page keeps its own copy of the same idea in
// homeCards.ts / homePrefs.ts). Each page is one setting, so the layout follows the teacher to every device.

export type PageKey = "scan" | "attendance" | "random";
type SettingKey = "scan_cards" | "attendance_cards" | "random_cards";
const SETTING: Record<PageKey, SettingKey> = { scan: "scan_cards", attendance: "attendance_cards", random: "random_cards" };

export const SCAN_CARDS = ["recent", "hid", "hint"] as const;
export const ATT_CARDS = ["sum", "week", "scans", "todo", "away"] as const;
export const RANDOM_CARDS = ["hist", "opts", "timer", "pass", "range", "pair", "gopts"] as const;
export type ScanCard = (typeof SCAN_CARDS)[number];
export type AttCard = (typeof ATT_CARDS)[number];
export type RandomCard = (typeof RANDOM_CARDS)[number];

export const PAGE_DEFS = {
  scan: { keys: SCAN_CARDS, off: ["hint"] } as CardDef<ScanCard>,
  attendance: { keys: ATT_CARDS, off: ["todo", "away"] } as CardDef<AttCard>,
  random: { keys: RANDOM_CARDS, off: ["timer", "pass", "range", "pair", "gopts"] } as CardDef<RandomCard>,
};

type Def<P extends PageKey> = (typeof PAGE_DEFS)[P];
type KeyOf<P extends PageKey> = Def<P> extends CardDef<infer K> ? K : never;

/** The layout the teacher chose for one page (the same on every device). */
export function pageLayout<P extends PageKey>(page: P): ReadonlySignal<CardLayout<KeyOf<P>>> {
  const def = PAGE_DEFS[page] as unknown as CardDef<KeyOf<P>>;
  return computed(() => parseLayout(def, settings.value?.[SETTING[page]]));
}

export const scanLayout = pageLayout("scan");
export const attendanceLayout = pageLayout("attendance");
export const randomLayout = pageLayout("random");

export const defaultPageLayout = <P extends PageKey>(page: P) => defaultLayout(PAGE_DEFS[page] as unknown as CardDef<KeyOf<P>>);

// One save at a time, in the order the teacher tapped: two fast taps must not reach the server swapped.
let chain: Promise<unknown> = Promise.resolve();

/**
 * Show the new layout at once, save it in the background. If the save fails (offline, server down) the page goes
 * back to what it was and says why, so the screen never claims a layout the other devices will not see.
 */
export function savePageLayout<P extends PageKey>(page: P, next: CardLayout<KeyOf<P>>): Promise<boolean> {
  const before = settings.value;
  if (!before) return Promise.resolve(false);
  const key = SETTING[page];
  const text = serializeLayout(next);
  const was = before[key];
  settings.value = { ...before, [key]: text } as Settings;
  const run = async (): Promise<boolean> => {
    try {
      await api.put("/api/settings", { [key]: text });
      return true;
    } catch {
      // only undo our own change: a later tap has already replaced it
      if (settings.value && settings.value[key] === text) settings.value = { ...settings.value, [key]: was } as Settings;
      err(navigator.onLine ? "บันทึกการปรับการ์ดไม่สำเร็จ" : "ออฟไลน์ — ปรับการ์ดได้เมื่อออนไลน์");
      return false;
    }
  };
  const p = chain.then(run, run);
  chain = p;
  return p;
}
