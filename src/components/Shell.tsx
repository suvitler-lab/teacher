import { Dialog } from "./Dialog";
import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import { route, routeName } from "../router";
import { Icon } from "./Icon";
import { Toasts, ReloginOverlay, FailedPanel, EpochBanner, UpdateBanner, StartTermHost } from "./Overlays";
import { SyncBadge, TermPicker } from "./ui";
import { logout } from "../store";
import { pendingCount, failedCount } from "../lib/outbox";
import { attDraftCount } from "../lib/attSync";

interface NavItem { key: string; label: string; icon: string }
// The eight pages (names kept, D22) in the order a teacher's day goes: today · in the room · after class · manage
export const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  { label: "วันนี้", items: [{ key: "home", label: "หน้าหลัก", icon: "home" }] },
  { label: "ในห้องเรียน", items: [
    { key: "scan", label: "สแกน", icon: "scan" },
    { key: "attendance", label: "เช็คชื่อ", icon: "user-check" },
    { key: "random", label: "สุ่มชื่อ", icon: "dice-3" },
  ] },
  { label: "ตรวจงาน", items: [
    { key: "gradebook", label: "คะแนน", icon: "notebook" },
    { key: "reports", label: "รายงาน", icon: "chart-bar" },
  ] },
  { label: "จัดการ", items: [
    { key: "students", label: "นักเรียน", icon: "users" },
    { key: "settings", label: "ตั้งค่า", icon: "settings" },
  ] },
];
const NAV: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

// phone bottom bar: home · attendance · scan(center) · gradebook · more
const TABS = ["home", "attendance", "scan", "gradebook", "more"];
// pages reached through the "more" sheet, under the same group headings as the rail
const SHEET_GROUPS = [
  { label: "ในห้องเรียน", keys: ["random"] },
  { label: "ตรวจงาน", keys: ["reports"] },
  { label: "จัดการ", keys: ["students", "settings"] },
];
const SHEET = SHEET_GROUPS.flatMap((g) => g.keys);

async function doLogout() {
  const parts = [
    pendingCount.value > 0 && `คะแนน/การส่งงานรอส่ง ${pendingCount.value} รายการ`,
    failedCount.value > 0 && `ส่งไม่สำเร็จ ${failedCount.value} รายการ`,
    attDraftCount.value > 0 && `เช็คชื่อที่ยังไม่ได้ส่ง ${attDraftCount.value} รายการ`,
  ].filter(Boolean);
  const list = parts.map((p) => "• " + p).join("\n");
  if (parts.length > 0 && !confirm("ยังมีข้อมูลค้างในเครื่องนี้:\n" + list + "\n\nจะเก็บไว้และส่งให้เมื่อเข้าสู่ระบบใหม่ ออกจากระบบเลยไหม?")) return;
  await logout();
}

export function Shell({ children }: { children: ComponentChildren }) {
  const active = routeName();
  const [sheet, setSheet] = useState(false);
  void route.value; // subscribe

  return (
    <div class="shell">
      <nav class="rail" aria-label="เมนูหลัก">
        <div class="rail-logo"><Icon name="checks" size={24} /></div>
        {NAV_GROUPS.map((g) => (
          <div class="rail-group" role="group" aria-label={g.label}>
            <div class="rail-gl" aria-hidden="true">{g.label}</div>
            {g.items.map((n) => (
              <a
                class={"rail-item" + (active === n.key ? " on" : "")}
                href={"#/" + n.key}
                aria-current={active === n.key ? "page" : undefined}
              >
                <Icon name={n.icon} size={24} />
                <span>{n.label}</span>
              </a>
            ))}
          </div>
        ))}
        <div class="rail-spacer" />
        <div class="rail-sync"><SyncBadge /></div>
        <button class="rail-item" onClick={doLogout}><Icon name="logout" size={24} /><span>ออกจากระบบ</span></button>
      </nav>

      <main class="main"><UpdateBanner /><EpochBanner />{children}</main>

      <nav class="bottom-tabs" aria-label="เมนู">
        {TABS.map((t) => {
          if (t === "more") {
            return (
              <button class={"tab-item" + (SHEET.includes(active) ? " on" : "")} onClick={() => setSheet(true)}
                aria-haspopup="dialog" aria-expanded={sheet} aria-controls="menu-sheet">
                <span class="tab-pip" aria-hidden="true" />
                <Icon name="menu-2" size={24} />
                เมนู
              </button>
            );
          }
          if (t === "scan") {
            return (
              <a class={"tab-item tab-scan" + (active === "scan" ? " on" : "")} href="#/scan" aria-current={active === "scan" ? "page" : undefined}>
                <span class="tab-scan-btn"><Icon name="scan" size={24} /></span>
                สแกน
              </a>
            );
          }
          const n = NAV.find((x) => x.key === t)!;
          return (
            <a class={"tab-item" + (active === t ? " on" : "")} href={"#/" + t} aria-current={active === t ? "page" : undefined}>
              <span class="tab-pip" aria-hidden="true" />
              <Icon name={n.icon} size={24} />
              {n.label}
            </a>
          );
        })}
      </nav>

      {sheet && (
        <div class="sheet-overlay" onClick={(e) => { if (e.target === e.currentTarget) setSheet(false); }}>
          <Dialog id="menu-sheet" class="menu-sheet" label="เมนู" onClose={() => setSheet(false)}>
            <div class="sheet-grab" />
            <div class="sheet-term">
              <TermPicker />
              <SyncBadge />
            </div>
            {SHEET_GROUPS.map((g) => (
              <>
                <div class="sheet-gl">{g.label}</div>
                <div class="sheet-grid">
                  {g.keys.map((k) => {
                    const n = NAV.find((x) => x.key === k)!;
                    return (
                      <a class={"sheet-item" + (active === k ? " on" : "")} href={"#/" + k} aria-current={active === k ? "page" : undefined} onClick={() => setSheet(false)}>
                        <Icon name={n.icon} size={24} /> {n.label}
                      </a>
                    );
                  })}
                </div>
              </>
            ))}
            <button class="sheet-item sheet-out" onClick={() => { setSheet(false); doLogout(); }}>
              <Icon name="logout" size={20} /> ออกจากระบบ
            </button>
          </Dialog>
        </div>
      )}

      <FailedPanel />
      <StartTermHost />
      <Toasts />
      <ReloginOverlay />
    </div>
  );
}
