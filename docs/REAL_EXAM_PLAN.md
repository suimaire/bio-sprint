# REAL EXAM v0.2 implementation and verification ledger

Goal: preserve Training and add a credible 90-minute exam session with deferred feedback, durable answers, navigation and an actionable report. The user's pasted 23-section brief is the governing specification. No commits, pushes, deployments, backend or dependencies.

Architecture: add REAL_EXAM to the existing session mode. Keep active exam responses PENDING with selected answers and null correctness until finalization. Reuse the existing IndexedDB revision/atomic-save mechanism, question records, timing helpers and aggregates. A dedicated exam player and report keep Training UI unchanged. App routing gates all other screens during an active exam.

Working location: E:\BIOSPRINT\bio-sprint (current writable workspace; D:\CODEX\bio-sprint is an older matching copy). Neither directory contains Git metadata, so no worktree/branch or commit operations apply.

## Tasks
- [x] 1. Write failing domain tests for the 90-minute preset, null feedback, navigation/triage, answer edits, deadline boundary, refresh, completion, metadata and legacy validation; implement model/session/validation changes.
- [x] 2. Write failing diagnostics tests, then implement `examFlags`, `examReport` and metadata grouping. BAD_INVESTMENT = unsuccessful and total question time strictly >2× target. KNOWN_BUT_LOST = expired, unanswered, and either difficulty <=2 or last completed pre-exam Training answer to that same question was correct. Test manual submission, prior wrong/exam/future evidence exclusions and strict thresholds.
- [x] 3. Write browser tests for the complete exam lifecycle and feedback-blocked routes, then implement setup, exam player, navigator and report/review. Save each action before reflecting success, retain failed actions for explicit retry. No exam-submit shortcut.
- [x] 4. Run unit tests, typecheck, production build, all E2E; inspect desktop and tablet screenshots; document exact semantics, schema, limitations and commands.

## Review focus
- Answer arriving at/after the deadline cannot replace the last timely saved answer.
- Refresh while on a different route cannot reveal analytics or answer keys during an exam.
- Multiple answer edits, clear, Later/Skip and >2 revisits survive schema validation and export/import.
- Storage failure and expiration cannot silently drop input or unlock the report early.
- Legacy metadata stays unknown in aggregates rather than fabricating KO/DIRECT/STANDARD labels.

## Progress
- Baseline: `npm test` 29 passed; `npm run typecheck` passed.
- Ruling: requested implementation is already authorized; perform reversible work directly. No additional approval stages or commits.
- Review: fixed already-open-tab feedback leak with same-origin revision notifications, preserved imported question numbering, and tested stale failed-save retries against newer cross-tab answers.
- Verification environment: port 5173 was serving an older checkout, so E2E now exclusively starts port 5174. In this Windows sandbox, Vite teardown required stopping the specific test-owned server process after all tests finished; test assertions and runner exit codes were inspected.
- Final: 42 unit tests, typecheck, production build and 14 browser tests pass. Desktop/tablet exam and report/review screenshots inspected. See REAL_EXAM_VERIFICATION.md.
