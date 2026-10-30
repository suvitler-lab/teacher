# AC-05 re-measure on final code (dist built 2026-10-30 18:10, fresh fixture server 127.0.0.1:5194, fictional data, SW unregistered + caches cleared)
Same method as q01 (8 pages x font 14/18/24 x density compact/normal/roomy = 72 combos per width; also rail overflow count).
| width | text <13px | page h-scroll | rail/sidebar overflow | buttons <44 (touch) |
|---|---|---|---|---|
| 390 real touch (pointer:coarse true) | 0 | 0 | 0 | attendance prev/next 40x44 and students "เพิ่มเติม" 40x44 (font 14 only); everything else 0 |
| 820 (not touch; coarse media rules rewritten in page to simulate) | 0 | 0 | 0 (B-01 fixed) | same two (40x44 at font 14); gradebook/home/settings now 0, hs-eye 0 |
| 1180 (fine pointer) | 0 | 0 | 0 | n/a on mouse (13-41 per page, by design) |
| 1440 (fine pointer) | 0 | 0 | 0 | n/a on mouse |
Mobile menu sheet (390, 14/18/24): overflow 0, tap<44 0 (B-04 fixed).
Desktop button.primary height by size (all densities identical): 14px=35, 18px=46, 24px=61 (buttons scale with rem; density affects rows only).
Not covered in this run: scan in-progress cells (.sc-cell, B-03 known issue, needs a scan session), modals/drawer, Dialog confirmations.
AC-01 no flash: main.tsx calls applyStoredDisplay() synchronously before render() (code read). Could not observe before-first-paint in browser (window.open blocked, iframe blocked, script cannot attach before document starts) -> not measured.
