# BIO SPRINT v0.2

2026-11-14 생물학 시험을 위한 개인용 시간제한 훈련 도구. Korean UI, Vite + React + TypeScript, native IndexedDB. No backend or account.

## GitHub Pages

Public app: **https://suimaire.github.io/bio-sprint/** — open in iPad Safari without running a local server.

Pushes to `main` run `.github/workflows/deploy-pages.yml`: Node 24, `npm ci`, unit tests, typechecked Vite build, then the official GitHub Pages artifact/deployment actions. Repository Pages source is **GitHub Actions**. The workflow builds with `/bio-sprint/`; local development keeps `/`.

Pages uses hash routes such as `/bio-sprint/#/training`, so direct links, reload and back/forward stay on the published document. Local development retains its existing paths. IndexedDB records belong to each browser origin: move existing localhost history with **Export Study Data / Import Study Data**. The schema and all 27 DRAFT fixtures are unchanged. Safari data also remains local to that browser; export backups regularly.

Run the deployment smoke check against the public app (it uses an isolated browser profile):

```powershell
$env:PAGES_URL = 'https://suimaire.github.io/bio-sprint/'
npm.cmd run test:e2e
Remove-Item Env:PAGES_URL
```

For a local Pages preview, run `npm.cmd run build -- --base=/bio-sprint/`, then `npm.cmd run preview -- --port 5177 --base=/bio-sprint/`, and use `http://127.0.0.1:5177/bio-sprint/` as `PAGES_URL`. If the normal E2E port 5174 is occupied, set `E2E_PORT` to a free port. The original 14 browser checks run when `PAGES_URL` is unset.

## Local development

```powershell
cd E:\BIOSPRINT\bio-sprint
npm ci
npm run dev
```

Open http://127.0.0.1:5173. Keep the same host and port to use the same local history. Node.js 22.12+ or 24+ is recommended; this project was built with Node 24.20.0. The package lock records exact dependencies. If dependencies are already installed, run `npm run dev` directly.

1. Open **문제 은행** to inspect/import questions.
2. Open **집중 훈련** and choose mode, question count and duration.
3. Initially no trusted questions exist: either import REVIEWED/VERIFIED content, or explicitly include **DRAFT 개발용 문제 포함** to try the 27 unverified development fixtures.
4. Submit an answer, choose confidence and (if wrong) a failure type, then continue.
5. Review results, TIME LEAK, and the priority queue. Export study data regularly.

Shortcuts: 1–9 answer, Enter submit, 1–5 confidence, K/R/T/C/S failure, Space next; MIXED adds L Later / S Skip. Browser refresh resumes at `/training`, and the session clock continues during time away. The server only serves the UI; there are no study-data API calls.

**REAL EXAM — 90 MIN** is available alongside Training. It uses up to 100 distinct available questions, saves answer selections immediately, supports unrestricted question navigation and hides feedback/learning screens until submission or expiration. Shortcuts: 1–9 answer, L Later, S Skip, ←/→ navigation. Its report includes SCORE LEAK, unsuccessful time investments, metadata breakdowns and optional post-exam reflection. DRAFT remains an explicit development-only opt-in. See [REAL_EXAM.md](docs/REAL_EXAM.md) for exact heuristics, timing and persistence semantics.

## Checks

```powershell
npm test
npm run typecheck
npm run build
npm run test:e2e
```

Playwright uses installed Microsoft Edge (`channel: 'msedge'`). On a machine without Edge, install the Playwright Chromium browser (`npx playwright install chromium`) and remove the `channel` field in `playwright.config.ts`. Browser tests use isolated profiles and do not touch your normal study history. Responsive screenshots are written to `test-results/`.

E2E starts this checkout on a dedicated **5174** port and never reuses an existing server. This prevents an older preview at 5173 from being mistaken for the current code. Exam expiration uses Playwright's controllable clock, not a 90-minute wait.

`npm run preview` serves a production build on the same local port; stop the development server first.

## Project map

- `src/model.ts`, `src/sessionEngine.ts`: taxonomy, session state and triage.
- `src/metrics.ts`: testable timing, diagnostics, aggregation, TIME LEAK and review rules.
- `src/validation.ts`, `src/storage.ts`: strict imports and atomic local persistence.
- `src/seed.ts`: 27 DRAFT fixtures (9 per mode, all 11 domains).
- `src/App.tsx` and screen components: Korean study interface.
- `src/Exam.tsx`, `src/ExamReport.tsx`, `src/examMetrics.ts`: examination UI and conservative execution diagnostics.
- `src/domain.test.ts`, `tests/app.spec.ts`: unit and actual-browser checks.
- `docs/SPEC.md`, `docs/QUESTION_SCHEMA.md`: scope, formulas and JSON maintenance.

## Real limits

Seed questions are development fixtures, not a verified exam bank. Review/diagnosis is heuristic. No cloud synchronization, automatic backup, graphical editor, or offline service worker. The public Pages URL works without a local server; export JSON before clearing browser storage or changing origins. Imported conflicting IDs intentionally do not overwrite records. Long histories are stored as one document, appropriate for this personal study scope.
