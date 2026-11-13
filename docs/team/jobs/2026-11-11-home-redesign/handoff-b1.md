# Handoff from session home-redesign-20261112-b1 → b2 (2026-11-12)

Owner chose "ให้ b2 ทำต่อ" after b2 took over the lock at 03:01 UTC. b1 has stopped and will not touch job files again.

## State left by b1 (all uncommitted on team/2026-11-11-home-redesign, base f3875d5)
- Range 1ก is done: T-29, T-30, T-31, T-32 + T-65 (fixture) + T-66 (QA docs), each reviewed by Code Reviewer (opus) and fixed. Review files: evidence/review-T-29.md, code-review.md (T-31, T-65) + code-review.part-2.md (T-32, T-30; split-verify PASS).
- dev-notes/T-29, T-30, T-31, T-32, T-65 hold the agent reports and fix rounds.
- PM check suite on the working tree: typecheck PASS · npm test 168 files / 1917 PASS · build PASS · audit 0.
- ownership-check: only PM files out of scope (dashboard.html, status.md, board-history.md).
- .gitignore: added `**/evidence/variants/` (theme screenshots, ~23 MB, same policy as evidence/shots/).
- Agent resumes used up: T-29 2/2, T-30 1/2, T-32 2/2, T-65 2/2, fix-round FE 1/2, QA T-66 1/2.
- No checkpoint commit yet: the owner has not been asked for permission.

## Next (from board line 3)
Checkpoint for range 1ก (needs the owner's permission) → T-33 (remove the Plex @import at home.css:3 · hex at home.css:66 · toast text "ใช้กับทุกเครื่อง" in homePrefs.ts:27, pageCards.ts:76, home-states.test:144 · pageCards race like R-03) → T-34 ∥ T-35 ∥ T-36.

## Open items
- Known issues awaiting a decision: R-06 (DB icon names missing in Phosphor show blank), R-04 (icons blank briefly on first open).
- Ask at Gate V: R-3209 (no "เลิกทำ" after a theme change), Q-1 Q-4 Q-5.
- Ask SA: AC-20, whether a work item with no due date shows a chip.
- Hook gotchas: the hook ignores ownership "shared", so patch dev-notes/T-xx.md + evidence/** into every task after each `ownership.mjs build`. Reviewers can only write code-review*.md. Python file writes on this machine need newline='' or you get CRLF.
