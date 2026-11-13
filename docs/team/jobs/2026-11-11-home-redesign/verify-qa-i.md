# Verify QA-I (T-85) - re-record on final snapshot
status: in progress · snapshot tree:2df7c74d2598 (verified) · build = frozen copy scratchpad/dist-i (from dist/client/client) · scripts copied to evidence/verify-i/ with ports remapped to 4240-4246 (originals untouched)
## progress
- [round 3] setup done; launching typecheck/test/audit/offline-e2e/qa-sweep/qa-flows
- [round ~22] DONE+recorded: Q-8002 typecheck exit 0 · Q-8003 npm test 207 files/2461 pass (0 fail) · Q-8004/7202 audit 0 vuln · Q-8005/7301 offline-e2e 32/32 · Q-8006/7302/7307 sweep P1-P3=0 · Q-8007/7803 flows 49/49 (lateAfter 00:00) · Q-8008/74 shots 48/48 viewed + sheet --diff PASS · Q-7101
- next: build (Q-8009), 41 regression ids covered by whole-suite, m-*.cjs measures (7001/7601/7602-7605/7007-7010/7102/7106/7107/7304/7305/7308), verify-f md/gb/lock (7801/7802/7804)
## final (T-85) · snapshot tree:2df7c74d2598 · build dist-i frozen
status: done
| group | result | evidence ids |
|---|---|---|
| typecheck / npm test / audit / build | exit 0 / 207 files 2461/2461 pass (no timeouts) / 0 vuln / ok | Q-8002, 8003, 8004+7202, 8009, 7101 |
| offline-e2e 32/32 · qa-sweep P1-P3=0 · qa-flows 49/49 (lateAfter 00:00) | PASS | Q-8005/7301 · 8006/7302/7307 · 8007/7803 |
| shots 12 pages x 4 devices = 48 viewed (thumb each) + visual-check.json + shots-sheet --diff PASS | PASS (real iPad = NOT RUN D09) | Q-8008, Q-74 |
| B-H1 gradebook --layout (4 task types): iPad P 18 / L 10 / desk 11 rows, toolbar 50 | FIXED, PASS | Q-7001, 7601 |
| B-H2 200-char names: clamp 2 lines on home a/b/c + scan (h<=58 @375) | FIXED, PASS | Q-7604 |
| B-H3 .stu-tile:disabled contrast incl opacity min 12.56 (opacity now 1) | FIXED, PASS | Q-7605 |
| contrast 60 combos (skins x light/dark x home a/b/c, settings, scan x desk/phone) min 4.65, 0 fails; home-b light now measurable (parser fix for color(srgb) in verify-i/m-con.cjs) | PASS (was BLOCKED) | Q-7010 |
| reports/students rows, random, tap targets (0 small on touch), scan name | PASS | Q-7602, 7603, 7007, 7008, 7009 |
| xlsx offline, clear-prefs, hide-names, print, projector (flag ngankrob-projector in sessionStorage; opener disabled, control enabled) | PASS (7107/7304 caveat: 1 residual name hit on scan/gradebook/reports/students, same as QA-H, unidentified) | Q-7102, 7106, 7107, 7304, 7305 |
| multi-device / offline-replay / lock a11y | PASS (md 23/24: 1 script-expectation item, same as QA-F) | Q-7801, 7802, 7804 |
| 41 suite-covered regression ids | PASS via whole suite | Q-3xxx..6801 |
| Q-7308 (TC-702/710-712/720/721/800/801) | BLOCKED: scripts gone, not rewritten | Q-7308 |
quality-gate: FAIL (4) = Q-7901/7902/7903 (security) + Q-8001 (PM owner-approved). No QA FAIL. Servers 4240-4246 all closed.
