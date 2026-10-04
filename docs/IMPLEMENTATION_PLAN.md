# BIO SPRINT v0.1 Implementation Plan

Goal: daily Korean biology training that improves score per minute before 2026-11-14.
Architecture: React screens over pure TypeScript domain functions; one versioned IndexedDB document with atomic revision checks; no backend. Runtime dependencies are React and React DOM only.
Spec: the supplied BIO SPRINT v0.1 brief, summarized in SPEC.md.

The user explicitly requested implementation after a short plan, and no commits, pushes, or deployment. Implement inline; retain this plan and verification record. Stage in E:/BIOSPRINT/bio-sprint, deliver to D:/CODEX/bio-sprint.

- [x] Domain and fixtures: model.ts, metrics.ts, validation.ts, sessionEngine.ts, seed.ts. Vitest covers validation, timing thresholds, flags, adaptive priority, D-day, aggregation, trust filters, and triage transitions.
- [x] Persistence and transfer: storage.ts and validation.ts. Native IndexedDB with atomic revision checking; append-only conflict-aware import preview; round-trip, corrupt data, and concurrent-save checks.
- [x] Korean interface: App.tsx, Dashboard.tsx, Training.tsx, QuestionBank.tsx, Analytics.tsx, styles.css. Dashboard, three modes plus MIXED, countdown, keyboard shortcuts, confidence/failure tags, Later/Skip/revisit, resumable session, review queue, question-bank filters and JSON controls.
- [x] Verification and docs: Playwright browser smoke includes wrong-answer tagging, triage, timer expiry, reload, imports/exports and desktop/tablet/phone layout; npm test, npm run typecheck, npm run build, npm run test:e2e. SPEC.md, QUESTION_SCHEMA.md and README.md written.

Review focus: duplicate or conflicting imports must not overwrite history; reloading an active question must not reset its timer; Later must preserve original triage and accumulated time; deadline expiry must not lose a submitted answer; a second tab must not silently overwrite newer data.

Explicit defaults: fixture questions are all DRAFT; trusted bank initially empty. Opt-in required every new setup. Session duration defaults to 5 minutes. FAST <0.75x target, SLOW >1.5x; LONG_WRONG >1.5x; BAD_INVESTMENT >2x and either incorrect/unanswered or difficulty >=4. Review repeated mistakes use the preceding 14 days.

## Execution record
- Dependencies installed with explicit network escalation after the sandbox denied registry access. Runtime dependencies remain React and React DOM.
- Initial unit run failed because domain modules did not yet exist; implementation then passed 24 cases. Browser smoke initially failed because the UI entry was not implemented.
- Windows resolver chose training.ts for Training.tsx imports; renamed the domain file sessionEngine.ts. Typecheck passed.
- Initial full browser run: 5/6 passed; remaining test had an ambiguous title/detail locator. Scoped it to the visible summary; all six then passed.
- Added seed coverage, maximum-length question-ID regression, and known slow/wrong browser diagnostics. Long IDs initially failed response-ID validation; fixed response IDs to allow the composed maximum of 257 characters.
- Independent fresh code review found two important import-lifecycle consistency holes (open visit without shownAt; missing deferred queue item) and a valid-session-ID URL encoding issue. Wrote failing regressions before fixes. Validator now checks open visits, visits against queue progress, cumulative time bounds, and exact one-time deferred queue suffix. Session URLs encode/decode IDs.
- Final checks and remaining limitations are recorded in VERIFICATION.md. No commits, pushes, deployments, or unrelated repository changes.
