# AC-05 raw measurement (QA, final code, dist built 2026-10-30 18:01, fixture server 127.0.0.1:5194, fictional data)
Method: javascript_tool in browser pane. For each page x font 14/18/24 x density compact/normal/roomy (applied as app does: html font-size, --fs, --row-k, data-density).
Counts: visible text elements with computed font-size < 13px; button/a/input/select/[role=button|tab|switch] with w or h < 43.5px; documentElement.scrollWidth > clientWidth.
Service worker unregistered + caches cleared before the run.

## 390x844 (resize_window custom; real pointer:coarse = true)  72 combos
small text < 13px: 0 on all 8 pages. Horizontal page scroll: 0 on all 8 pages.
tap < 44 (all at font 14 only, i.e. 3 densities):
- home: button.lk "สมุดคะแนน ›" 96x35, "เช็คชื่อ ›" 70x35, "รายงาน ›" 77x35  (height 35 at 14px)
- attendance: button.icon prev/next day 40x44
- students: button.icon "เพิ่มเติม" 40x44
- settings: theme button "มืด" 42x44
- random: native checkbox 17/22/29px (inside label.rnd-opt 220x49, label is the target -> not counted as a defect)
- gradebook, scan(setup), reports: 0
Modals at 390 (create-assignment, start-term, student drawer): at 14 close button.icon 40x44; 18/24 clean; no h-overflow; no small text.
Menu sheet (mobile "เมนู") at 24px: content overflows sheet by 75px: span.sync.online right edge 465 > 390 (clipped).
Scan in-progress screen at 14/18/24: small 0, tap 0, h-overflow 0.

## 820x1180 (resize_window custom -> NOT touch; pointer:coarse = false. Coarse rules simulated by rewriting (pointer: coarse) media rules to (min-width:0px))
small 0, h-scroll 0 on all 8 pages. tap < 44 at 820 (simulated coarse):
- home: button.lk 35px high (font 14)
- gradebook: "ล้าง" 43x44, "จัดการงาน" 37x44 / 41x44 (font 14), button.hs-eye 17x37, 22x48, 29x64 (gb-1, declared excluded)
- scan (with an active scan session): button.sc-cell.scored width 28-29px (heights 44/46/61) at all sizes -> B-03
- attendance prev/next 40x44; students more 40x44; settings "มืด" 42x44 (font 14)
Not re-run on final code: 1180 and 1440 (earlier run on pre-fix build: small 0, h-scroll 0 on 8 pages; 1180 tap results identical to 820; 1440 fine pointer taps 24-35px by design).

## Row min-height at 390 touch, font 18 (computed min-height)  expected 47/58/70
.hm-follow, .stu-lrow, .att-week>button, .rp-follow: 46.8 / 57.6 / 70.2px  -> PASS (AC-03)
Rendered height is content-driven at 390 (70/76/89/67px) so density changes row height visibly only on .rp-follow(roomy) and .hm-follow(roomy).

## Layout seen in screenshots (820x18: scan, gradebook, attendance; 390x24: create modal, scan in progress, student drawer, menu sheet)
- Rail (64px wide at 820): "ออนไลน์" sync chip spans x -10..73 (clipped at left edge of viewport) at 14..24 px; "ออกระบบ" label wraps to 2 lines. -> B-01
- 390x24 scan setup: step title "1 เลือกงาน" wraps into a narrow column ("เลือก / งาน"). low
- 390x24 student drawer: "งานค้างส่ง 1 ชิ้น" and "คัดลอกไป LINE" wrap; readable. low
- Gradebook headers truncate with ellipsis at 820 (gb-1 out of scope).
No overlapping text found in the images checked.
Screenshots are shown inline by the browser tool only; the tool cannot write files, so no image files in evidence/.
