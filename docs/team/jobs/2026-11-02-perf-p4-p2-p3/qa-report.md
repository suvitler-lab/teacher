# QA report: perf P4/P2/P3 (no visual change)

Browser pane, fixture server http://localhost:5500 (fictional data), class ป.6/1 all subjects = 25 columns, viewport 820 px.
No source/test edited. Server was already running; not stopped by QA.

## Result
| Check | Result |
|---|---|
| 1a edge shadows can-l/can-r | PASS: start l=false r=true; middle l=true r=true; right end l=true r=false; back at left l=false r=true |
| 1b minimap window follows | PASS: left 0% -> 17.4% -> 85.4% (end) -> 0% |
| 1c jump buttons | PASS (clicked "สอบย่อย"): scrolled to x=2067, visible columns include "สอบย่อย บทที่ 2" |
| 1d column menu open/close | PASS: aria-expanded true then false on Esc, focus back on button |
| 1e DOM mutation while scrolling | PASS: no childList change, no row/cell attribute change. Only the .gb-frame class flips (2 per full sweep) plus .gb-nav minimap style. Tiny text-node touches (empty data, in .gb-page / .tot-col, ~8 per 6 wheel ticks) seen, no rows rebuilt |
| 2 class/subject memory | PASS: picked ป.6/2 + คณิตศาสตร์ in Gradebook -> Reports (ป.6/2) -> Students (ป.6/2) -> Gradebook (ป.6/2, คณิตศาสตร์). Deep link from Home `?class=cls_63&subject=sub_art` won (ป.6/3, ศิลปะ). Logout+login: back to ป.6/1 + วิทยาศาสตร์ |
| 3 outbox online path | PASS: scan "33" on #/scan -> tile green, 28/44, recent list shows 10/10; Gradebook cell for no.33 shows 10, total 10/20. Idle 17 s on scan page: 4 attribute mutations only (sync icon saving->online), list not rebuilt = no flicker |

## Could NOT check
- Offline/pending path (no DevTools offline in the Browser pane): pending cell state and the pending-count badge were not observed.
- Fine per-frame flicker of the 15 s tick (only DOM mutation counts, not video).
- Programmatic scrollLeft / smooth scrollTo do not fire scroll events or glide in this pane; used real wheel scroll and real clicks instead. The pane was reported hidden at start, so timing is unreliable.
- At 820 px the default fixture class (ป.6/1 + วิทยาศาสตร์) has only 2 work columns and fits, so the nav is not drawn: needed "ทุกวิชา" to get overflow.
- Pixel visual diff / before-after shots not done (not requested; no git stash).
- evidence.mjs entries not recorded.

## Notes
- First run of check 2 failed only because the open tab held a bundle loaded before the rebuild; after reload it passed. Not a bug.
- Side effect: scan of no.33 added a score to fixture data (disposable).

## Bugs
None found.
