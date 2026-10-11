# BIO SPRINT v0.2

2026 생물학 시험을 위한 개인용 시간제한 훈련 도구. Korean UI, Vite + React + TypeScript, native IndexedDB. No backend or account.

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
# BIO SPRINT 프로젝트 폴더에서 실행
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

## Question Factory DAILY-15 (Phase 5B)

메뉴의 **DAILY-15 · QF**에서 `biosprint-export-1.0.0` JSON 파일을 선택하고 가져오기를 적용합니다. 완성된 READY / AI_REVIEWED 패키지만 지원합니다. 동일 ID·내용은 중복 저장하지 않고, 내용 또는 검토 기록이 충돌하면 전체 가져오기를 거절합니다.

- DAILY-15: 15문항, q01–q15 순서, 30분. 자유 이동, Later/Skip 표시, 입력 자동 저장과 새로고침 복구를 지원합니다. 화면 상단의 고정 이동 버튼은 긴 답안을 작성할 때도 접근할 수 있습니다. 기기 잠금·탭 전환 중에도 시간이 경과하고, 다시 열면 원래 마감 시각으로 종료합니다.
- MCQ / COMBINATION은 종료 후 자동 채점합니다. 합답형 진술과 조합 배열 순서를 보존합니다.
- SHORT / CONSTRUCTED_RESPONSE는 입력 원문을 보존하며 제출 전 수정할 수 있습니다. 종료 후 원본 expected_answer와 scoring_points를 보고 정답 / 부분 정답 / 오답 / 판단 보류로 자기 채점합니다. 채점 기준별 충족/미충족/미확인도 저장합니다. 문자열 일치 자동 채점과 임의 배점은 없습니다.
- AI_REVIEWED는 사람 검증이 아닙니다. 원본 근거·출처·페이지·검토 기록과 Stage 3 영어 검토는 결과에서 확인합니다. 원본 파일 경로는 웹 링크로 열지 않습니다.
- 실패 유형 L(영어 독해 오류)을 K(개념/지식 부족)와 구분합니다. 누적 분석의 QF 영역에서 자동 채점, 자기 채점, 부분 정답, 미채점과 실패 유형을 구분합니다. 자동 정답률은 응답한 선택형 중 정답 비율이며, 자기 채점 정답률은 정답/(정답+부분 정답+오답)입니다. 미응답·미채점·판단 보류는 두 정답률의 분모에서 제외합니다.
- STANDARD-50과 smoke2는 보관만 지원합니다. STANDARD-50 권장 시간 오류가 수정되기 전에는 시작하지 않습니다.
- IndexedDB `bio-sprint` 버전 1 및 StudyData `schemaVersion: 1`을 유지합니다. 선택 필드 `qfPackages`, `qfSessions`, `qfResponses`가 추가되며 v0.2 백업과 기존 기록은 유지됩니다. REAL EXAM은 90분 그대로입니다.
- **Export Study Data / Import Study Data**는 QF 원본 세트·풀이·자기 채점까지 보존합니다. Export Question Bank는 기존 선택형 배열 전용입니다. 오래된 백업과 변경된 기록이 동일 ID로 충돌하면 덮어쓰지 않고 거절합니다.
- 입력은 IndexedDB에 저장하고 파일을 서버/API에 업로드하지 않습니다. 새로고침 전에 답안 저장됨 표시를 확인하세요. 저장 실패 시 임시 기록을 내보낼 수 있습니다.

### 로컬 미리보기와 iPad

프로젝트 폴더에서 `npm ci` 후 `npm run dev`를 실행하면 PC의 `http://127.0.0.1:5173`에서 확인할 수 있습니다. 같은 Wi-Fi의 iPad에서는 `npm run dev -- --host 0.0.0.0`로 실행한 PC의 LAN 주소와 5173 포트로 접속합니다. QF 파일은 iPad 파일 앱에서 직접 선택합니다. 기기·브라우저·접속 주소별 저장소는 별개이므로 옮길 때 Study Data 백업을 사용합니다.

### 최소 검증

`npm test` 및 `npm run typecheck`로 계약·충돌·기존 기록 호환성과 타입을 검사합니다. 실제 패키지를 로컬에서 읽기 전용으로 검증하려면 환경 변수 `QF_EXPORT_PATH`에 export 경로를 설정하고 `npm test -- src/qf.test.ts`를 실행합니다. 경로를 지정하지 않으면 해당 실제 파일 검사만 건너뜁니다.

`npx playwright test --config playwright.qf.config.ts`는 합성 fixture만 사용한 핵심 흐름 및 저장 충돌 회귀 검사입니다. 네 형식 입력, Later/Skip, 새로고침, 제출, 기준별 자기 채점, 기존 기록 보존, 백업 복원과 시간 만료를 확인합니다. 다른 탭에서 종료할 때 저장 실패 답안의 복구 파일도 검증합니다. 실제 JSON이나 교재 원문을 저장소에 복사하지 않으며 스크린샷·영상·trace도 저장하지 않습니다.

## Mac mini READY 세트 가져오기 (Phase 5C-C)

DAILY-15 · QF 화면에서 Mac mini 서버 주소를 입력하고 **새 세트 불러오기 → 가져오기 미리보기 → 가져오기 적용 → DAILY-15 시작**을 선택합니다. 기본 주소는 같은 Mac에서 사용하는 `http://127.0.0.1:8765`입니다. 주소 설정은 이 브라우저에만 저장됩니다.

서버는 Question Factory의 `biosprint_api.py`를 실행합니다. 전체 READY 검증을 통과한 DAILY-15만 제공하며 기존 `biosprint-export-1.0.0`을 사용합니다. UI는 기존 검증·병합·IndexedDB 저장 경로를 재사용합니다. 같은 세트는 중복 저장하지 않고 같은 ID의 내용 충돌은 거절합니다. API에 연결되지 않아도 이 origin에 저장된 세트는 계속 풀 수 있습니다. 기존 학습 기록은 보존됩니다.

서버 주소에는 `/api/v1`을 붙이지 않습니다. iPad에서는 설정한 Tailscale Serve HTTPS 기본 주소를 입력합니다. `127.0.0.1`은 iPad 자신이므로 Mac mini에 연결되지 않습니다. API의 허용 origin은 `https://suimaire.github.io`이며 경로 `/bio-sprint/`는 origin에 포함하지 않습니다. 개인 주소·토큰은 코드나 학습 백업에 넣지 않습니다. API는 Tailscale 내부에서만 접근하며 Funnel을 사용하지 않습니다.

수동 파일 가져오기에는 선택 파일명·진행·검증 오류를 표시합니다. 창으로 돌아올 때의 동기화가 가져오기 화면을 제거하던 문제를 수정하여 미리보기와 오류가 유지됩니다.

전달 기능 최소 검사: `npm test -- src/qfApi.test.ts src/qf.test.ts`, `npm run build`, `npx playwright test -c playwright.delivery.config.ts tests/qfDelivery.spec.ts`. 마지막 명령은 기본 Chrome을 사용하며 `PLAYWRIGHT_CHANNEL`로 변경할 수 있습니다. 실제 로컬 API 검사는 `QF_API_URL`과 `QF_READY_RUN_ID`를 함께 지정할 때만 실행합니다. 실제 원본 파일은 저장소에 복사하지 않습니다. 실데이터 검사에서 trace/스크린샷/비디오를 활성화하지 마세요.

### 공개 사이트와 iPad 확인

기존 `main` 배포 workflow로 배포하며 공개 QF 주소는 `https://suimaire.github.io/bio-sprint/#/question-factory`입니다. IndexedDB 이름·버전과 공개 origin을 유지하여 기존 기록을 보존합니다. 수동 JSON 가져오기도 계속 사용할 수 있습니다.

1. Mac mini의 전원·Tailscale·READY API 실행을 유지하고, iPad의 Tailscale을 연결합니다. API 자동 시작은 별도 설정이므로 Mac 재부팅 후 실행 상태를 확인합니다.
2. iPad Safari에서 공개 사이트의 **DAILY-15 · QF**를 열고 HTTPS 기본 주소를 입력한 뒤 **새 세트 불러오기**를 누릅니다.
3. READY 목록에서 세트를 선택하여 **가져오기 미리보기**의 15문항·AI_REVIEWED를 확인하고 **가져오기 적용**을 누릅니다. 미리보기는 세트 요약이며 실제 문항은 훈련 시작 후 표시합니다.
4. **DAILY-15 시작 · 30분**을 누르고 첫 문항의 답안을 선택한 뒤 저장됨 표시를 확인합니다.
5. 인터넷은 유지한 채 Tailscale만 끄고 저장된 세트와 풀이에 계속 접근되는지 확인합니다. API가 끊겨도 이 Safari에 저장된 데이터는 사용할 수 있습니다.

인터넷까지 끊은 상태에서 사이트를 새로 여는 것은 별개입니다. 현재 앱에는 오프라인 서비스 워커가 없으므로 완전한 오프라인 재실행을 보장하지 않습니다. Mac 브라우저 검증만으로 실제 iPad Safari 통합이 확인된 것으로 간주하지 않습니다.
