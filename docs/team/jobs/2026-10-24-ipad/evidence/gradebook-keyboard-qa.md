# Gradebook keyboard QA — 2026-10-24

The PM observed a browser defect at 1024 px: after entering 7 for student 1 and pressing Enter, the editor remained on student 1; entering 8 then overwrote student 1 instead of recording student 2. This agent did not drive the browser.

Changes are limited to the desktop cell keyboard activation guard and CellInput keyboard event containment in `src/pages/Gradebook.tsx`, plus the new `test/unit/gradebook-enter.test.tsx`.

- A grid cell handles Enter/Space only when the cell itself is the event target.
- The score editor prevents the Enter/Escape default and propagation before commit/cancel.
- Four behavior tests cover Enter advancing and saving two different students, a synchronous render schedule, Escape cancelling without reopen/save, and blur saving once.

The four new jsdom tests also passed before the source change. They provide behavior coverage but do **not** reproduce the reported browser defect or independently establish its root cause. The observed browser symptom is consistent with event propagation/render timing; the PM must repeat that browser scenario after rebuilding to accept this fix.

Validation after the change:

- `npx vitest run --project dom test/unit/gradebook-enter.test.tsx test/unit/gradebook-visibility.test.tsx test/unit/logic.test.ts --reporter=dot`: 3 files, 19 tests passed, exit 0. Log: `gradebook-enter-green.txt`.
- `npm run typecheck`: passed, exit 0. Log: `gradebook-enter-typecheck.txt`.

The historical log named `gradebook-enter-red.txt` contains passing tests; its filename does not indicate a reproduced failure. No browser, server, production state, or physical iPad was used by this agent.
