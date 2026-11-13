# verify-final-logic (tree 37d399095a29, src/worker/shared unchanged during run)

Commands: `npx tsc --noEmit` exit 0; `npm run build` OK; full `npx vitest run` = 223 files, 220 pass, 3 flaky under load
(sec-auth 'account has its own budget', fixture-datasets ECONNRESET, hr-st2-t52 timeout) -> all 3 PASS solo (85/85) = PASS solo / flaky under load.
Targeted `npx vitest run tt- backup restore` = 24 files, 468 tests pass.
Note: evidence is suite-level (file groups), not per-test-name mapping.

| AC | Evidence | Result |
|---|---|---|
| AC-01..08,10 (logic, clock K01-K26, labels) | Q-6001, Q-6002, Q-6003, Q-6008 | PASS |
| AC-02,41,42 idempotency / 409 / frame | Q-6004, Q-6010 | PASS |
| AC-09,17 server enforcement | Q-6009 | PASS |
| AC-13,14,15 atomicity | Q-6005 | PASS |
| AC-18,19,29 grapheme labels | Q-6012 | PASS |
| AC-37..40,60,62 store/logic | Q-6003 | PASS |
| AC-43,47 offline/replay | Q-6011 | PASS |
| AC-44 restore/backup v6, reconciliation | Q-6006, Q-6007 | PASS |
| AC-01,08 migration 0008 | Q-6008 | PASS |
| Visual entries (Q-1810, 9501, 9503 etc.), Q-5008/5208/5411 | not re-run (out of scope) | NOT RUN |

Old entries Q-5001..5011, 5201..5207, 5401..5410, 9401 etc. remain in evidence.json as stale; quality-gate still FAILs (65) on them (cannot be deleted by me).
