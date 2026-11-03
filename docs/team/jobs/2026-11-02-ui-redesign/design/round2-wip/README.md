# Round 2 mockup — work in progress

Unassembled parts of the unified mockup (home + scan + attendance + random).
Not yet runnable as a single file.

- r2-css.css: styles for scan, attendance, random, projector, card prefs
- r2-js-1.js: data, card definitions, state (ICONS placeholder `__ICONS__`)
- r2-js-2.js: shell, scan page
- r2-js-3.js: attendance and random pages
- r2-js-4.js: projector shell, prefs drawer, overlays, render, controls
- icons.js / icons2.js: Tabler icon maps (round 1 / round 2); icons.cjs generates them
- check.cjs: Playwright audit script (paths point at the old scratchpad)

Remaining: merge icon maps, wrap round-1 script from preview.html in an IIFE
exposing S/homeHtml/prefsHtml/listHtml, add event handlers + init + hash routing,
rename non-projector .pbar/.stack to .pbar2/.stack2, write design/preview-round2.html,
run the audit matrix, publish to the existing artifact URL.
Design spec: ../ux.md section "รอบ 2". Visual spec (round2-notes.md) was still being written.
