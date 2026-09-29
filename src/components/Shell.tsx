import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import { route, routeName } from "../router";
import { Icon } from "./Icon";
import { Toasts, ReloginOverlay, FailedPanel, EpochBanner, StartTermHost } from "./Overlays";
import { SyncBadge, TermPicker } from "./ui";
import { logout } from "../store";
import { pendingCount, failedCount } from "../lib/outbox";
import { attDraftCount } from "../lib/attSync";

const NAV = [
  { key: "home", label: "หน้าหลัก", icon: "home" },
  { key: "scan", label: "สแกน", icon: "scan" },
  { key: "gradebook", label: "คะแนน", icon: "table" },
  { key: "attendance", label: "เช็คชื่อ", icon: "user-check" },
  { key: "random", label: "สุ่มชื่อ", icon: "arrows-shuffle" },
  { key: "reports", label: "รายงาน", icon: "chart-bar" },
  { key: "students", label: "นักเรียน", icon: "id-badge-2" },
  { key: "settings", label: "ตั้งค่า", icon: "settings" },
];

// phone bottom bar: home · attendance · scan(center) · gradebook · more
const TABS = ["home", "attendance", "scan", "gradebook", "more"];
// pages reached through the "more" sheet
const SHEET = ["random", "reports", "students", "settings"];

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
        <div class="rail-logo"><Icon name="checks" size={22} /></div>
        {NAV.map((n) => (
          <a
            class={"rail-item" + (active === n.key ? " on" : "")}
            href={"#/" + n.key}
            aria-current={active === n.key ? "page" : undefined}
          >
            <Icon name={n.icon} size={20} />
            {n.label}
          </a>
        ))}
        <div class="rail-spacer" />
        <div class="rail-sync"><SyncBadge /></div>
        <button class="rail-item" onClick={doLogout}><Icon name="logout" size={20} /> ออกระบบ</button>
      </nav>

      <main class="main"><EpochBanner />{children}</main>

      <nav class="bottom-tabs" aria-label="เมนู">
        {TABS.map((t) => {
          if (t === "more") {
            return (
              <button class={"tab-item" + (SHEET.includes(active) ? " on" : "")} onClick={() => setSheet(true)}>
                <Icon name="menu-2" size={22} />
                เมนู
              </button>
            );
          }
          if (t === "scan") {
            return (
              <a class={"tab-item tab-scan" + (active === "scan" ? " on" : "")} href="#/scan">
                <span class="tab-scan-btn"><Icon name="scan" size={24} /></span>
                สแกน
              </a>
            );
          }
          const n = NAV.find((x) => x.key === t)!;
          return (
            <a class={"tab-item" + (active === t ? " on" : "")} href={"#/" + t}>
              <Icon name={n.icon} size={22} />
              {n.label}
            </a>
          );
        })}
      </nav>

      {sheet && (
        <div class="sheet-overlay" onClick={(e) => { if (e.target === e.currentTarget) setSheet(false); }}>
          <div class="menu-sheet" role="dialog" aria-label="เมนู">
            <div class="sheet-grab" />
            <div class="sheet-term">
              <TermPicker />
              <SyncBadge />
            </div>
            {SHEET.map((k) => {
              const n = NAV.find((x) => x.key === k)!;
              return (
                <a class={"sheet-item" + (active === k ? " on" : "")} href={"#/" + k} onClick={() => setSheet(false)}>
                  <Icon name={n.icon} size={20} /> {n.label}
                </a>
              );
            })}
            <button class="sheet-item" style="color:var(--text-danger)" onClick={() => { setSheet(false); doLogout(); }}>
              <Icon name="logout" size={20} /> ออกจากระบบ
            </button>
          </div>
        </div>
      )}

      <FailedPanel />
      <StartTermHost />
      <Toasts />
      <ReloginOverlay />
    </div>
  );
}
