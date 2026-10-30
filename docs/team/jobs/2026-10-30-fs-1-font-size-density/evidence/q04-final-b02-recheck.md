# Final re-check (build 2026-10-30 18:18, SW + caches cleared, fresh fixture server, fictional data)
390x844 real touch (pointer:coarse true), 8 pages x font 14/18/24 x density 3 = 72 combos per page:
- buttons/inputs < 44px: 0 on every page (attendance prev/next and students "เพิ่มเติม" now >= 44 wide; B-02 fixed)
- visible text < 13px: 0; page horizontal scroll: 0
Reused from q03 (final-code run, build 18:10; the only change since is touch CSS min-width on button.icon, ui.css): 820 touch-simulated, 1180, 1440 results (text <13 = 0, h-scroll = 0, sidebar overflow 0), menu sheet 390.
Exceptions per brief AC-05 note: .sc-cell / scan step heading -> scan-1; hs-eye -> gb-1. After exceptions nothing fails.
AC-01 no-flash: not measurable in the pane (window.open and iframe blocked); code read: main.tsx calls applyStoredDisplay() before render() -> NOT RUN (needs PM decision).
