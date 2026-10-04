# BIO SPRINT v0.1 verification

Verified on 2026-10-04, Windows, Node 24.20.0, npm 11.19.0, installed Microsoft Edge via Playwright. Initial development location: E:/BIOSPRINT/bio-sprint. Delivery location: D:/CODEX/bio-sprint.

| Command | Result |
|---|---|
| `npm test` | 29 unit tests passed |
| `npm run typecheck` | TypeScript passed with no errors |
| `npm run build` | Production build passed; JS ~292 kB / ~92 kB gzip |
| `npm run test:e2e` | 7 browser tests passed |

Browser coverage:
1. Import trusted questions → answer incorrectly → submit → confidence/failure → next → correct answer → complete → visible analytics → reload persisted history → export/import to a fresh browser context. Imported session IDs include Korean and URL delimiters.
2. DRAFT excluded by default, explicit inclusion, LATER/SKIP/revisit, timer/revisit persistence across reload.
3. Deadline expiry with an unanswered question; preservation of a submitted answer for post-deadline tagging.
4. Invalid JSON, duplicate IDs, out-of-range answer and conflicting imports rejected; original questions preserved after reload.
5. Stale IndexedDB revision rejected; corrupt existing data surfaces an error and raw recovery export instead of resetting storage.
6. Desktop 1440×1000, tablet 820×1180 and phone 390×844 have no horizontal page overflow. Dashboard and training screenshots inspected; result screens also captured and checked.
7. Known 25-second wrong answer on a 10-second target produces EASY_MISS, LONG_WRONG, MISCONCEPTION_CANDIDATE, BAD_INVESTMENT, a TIME LEAK entry, and review priority 12. Space and classification shortcuts exercised.

Unit cases cover all seed schemas, all 11 domains/three modes, malformed question fields, duplicates, round-trip history, foreign references, source trust, timing boundaries, diagnostic flags, Seoul D-day, medians/rates/grouping, review priorities, repeated mistakes, triage/timing/revisit transitions, expiration, duplicate submits, maximum-length IDs, invalid open visits, missing deferred queues and impossible response-time/visit counts.

One independent read-only code review was completed. Both important lifecycle-validation findings and the imported-ID routing finding were fixed with failing-then-passing regressions. An additional long-ID defect was likewise regression-tested and fixed. No remaining review findings were deferred.

Real limitations: automated browser verification is Edge on Windows with viewport emulation, not physical iPad/Mac or Safari/WebKit testing. No scientific verification of fixture biology or empirical validation of training heuristics was performed. Playwright prints an environment warning about both NO_COLOR and FORCE_COLOR being set; this does not affect the application or test results.
