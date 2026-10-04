# BIO SPRINT v0.2 완료 보고서

검증일: 2026-10-04 (Asia/Seoul). 작업 위치: `E:\BIOSPRINT\bio-sprint`.

## Implemented

- `REAL EXAM — 90 MIN`: 최대 100개의 서로 다른 적격 문항, 부족하면 보유 수만 사용.
- 답안 즉시 저장·변경·지우기, Later/Skip, 이전/다음, 직접 문항 이동, 숫자/L/S/방향키.
- 접근 가능한 문항 상태 표시와 고정 카운트다운. 00:00 자동 제출, 답안 보존, 새로고침 복원.
- 시험 중 채점·해설·확신도·진단·복습·분석 차단. 다른 주소 및 이미 열린 같은 origin의 탭도 시험 화면으로 전환.
- 최초 표시/답안, 최종 응답, 판단 이력, 재방문/답안 변경, 누적 문항 시간 기록.
- 전용 결과, SCORE LEAK, 실패한 시간 투자 순위, 문항 검토, 선택적인 확신도와 K/R/T/C/S.
- 선택적 언어/자극/맥락 메타데이터 검증과 집계. v0.1 질문·세션 데이터 호환.
- 실패한 저장의 임시 기록 보존/재시도/내보내기. 다른 탭의 최신 답안을 오래된 재시도가 덮어쓰는 것 방지.

커밋·푸시·배포 없음. 새 의존성·백엔드·AI API·Question Factory 없음. 두 사본 모두 Git 메타데이터가 없어 Git 작업은 수행하지 않았다.

## Behavior differences: Training vs REAL EXAM

| 항목 | Training | REAL EXAM |
|---|---|---|
| 채점/해설 | 제출 직후 | 시험 전체 제출/만료 후 |
| 확신도/실패 분류 | 기존 다음 단계 조건 유지 | 종료 후 선택 사항 |
| 답안 | 기존 제출 동작 유지 | 선택 즉시 저장, 변경/지우기 가능 |
| 이동 | 기존 순서·MIXED 재방문 | 자유 이동·반복 재방문 |
| Later/Skip | 기존 규칙 유지 | 표시 후 다음 문항; 기존 답안 유지 |
| 만료 | 기존 제출 답안 분류 처리 유지 | 즉시 최종화, 마감 이후 입력 불허 |

## Diagnostic definitions

- **EASY_MISS**: 난이도 <= 2이고 최종 답안이 오답.
- **LONG_WRONG**: 최종 오답이고 누적 문항 시간이 목표 시간의 **1.5배 초과**.
- **BAD_INVESTMENT**: 최종 결과가 **오답 또는 미응답**이고 누적 문항 시간이 목표 시간의 **2배 초과**. REAL EXAM에서는 정답 문항 제외. Training의 기존 규칙은 보존.
- **KNOWN_BUT_LOST**: **시간 만료로 종료**한 시험에서 **최종 미응답**이며, (a) 난이도 <= 2 또는 (b) **시험 시작 이전에 완료한 Training의 동일 문항 마지막 제출 답안이 정답**. 직접 제출, 이전 REAL EXAM, 이후 기록, 다른 문항/주제 성적은 근거에서 제외.

훈련용 휴리스틱이며 지식 보유나 회복 가능 점수의 확정값이 아니다. 플래그는 중복될 수 있다. 점수 예측/회복 점수 추정은 추가하지 않았다. 상세 시간 및 데이터 의미는 [REAL_EXAM.md](REAL_EXAM.md)에 기록했다.

## Files changed

새 파일:

- `src/Exam.tsx` — 시험 진행 화면, 키보드, 만료 및 저장 실패 복구.
- `src/ExamReport.tsx` — 보고서와 시험 후 검토/분류.
- `src/examMetrics.ts` — 시험 진단, 시간 집계, 메타데이터 집계.
- `src/exam.test.ts` — 13개 시험 단위 테스트.
- `tests/exam.spec.ts` — 7개 시험 브라우저 시나리오.
- `docs/REAL_EXAM.md` — 동작·진단·호환성·한계.
- `docs/REAL_EXAM_PLAN.md` — 구현/검증 기록.
- `docs/REAL_EXAM_VERIFICATION.md` — 이 완료 보고서.

수정 파일:

- `src/model.ts` — 호환 가능한 시험 타입/메타데이터.
- `src/sessionEngine.ts` — 시험 전용 상태 전환 및 사후 분류.
- `src/validation.ts` — 기존 규칙 보존, 시험 레코드 검증.
- `src/Training.tsx` — REAL EXAM 프리셋.
- `src/App.tsx` — 시험 경로 제한, 탭 변경 알림, 저장 기준 스냅샷 검사.
- `src/ui.tsx` — 저장 함수에 선택적 기준 스냅샷 전달.
- `src/styles.css` — 시험 및 보고서 반응형 레이아웃.
- `tests/app.spec.ts` — 기존 복원 검사의 origin을 실행 중인 서버에서 가져오도록 수정.
- `playwright.config.ts` — 전용 5174 포트, 기존 서버 재사용 방지.
- `package.json`, `package-lock.json` — 앱 버전만 0.2.0으로 변경, 의존성 동일.
- `README.md`, `docs/SPEC.md`, `docs/QUESTION_SCHEMA.md` — 실행·사용·호환성 문서.

`src/storage.ts`, 기존 Training 플레이어 로직, 기존 진단 함수, 기존 29개 단위 테스트 및 `src/seed.ts`는 보존했다. seed 파일은 D: 기준 사본과 SHA-256 일치를 확인했다. 생성 출력은 `dist/`와 `test-results/`에 있다.

## Verification

모든 명령은 `E:\BIOSPRINT\bio-sprint`에서 실행했다.

| 명령 | 최종 결과 |
|---|---|
| `npm test` | 2 files, **42 passed**, 0 failed; 기존 29 + 새 13 |
| `npm run typecheck` | **통과**, 종료 코드 0 |
| `npm run build` | **통과**, 31 modules; 종료 코드 0 |
| `npm run test:e2e` | **14 passed (47.4s)**; 기존 7 + 새 7, 종료 코드 0 |
| `npm run test:e2e -- --grep 'desktop and tablet exam'` | 화면 캡처 시 스크롤 위치를 초기화한 후 시각 검사 재실행, **1 passed**, 종료 코드 0 |

초기 단위 검사에서 누락된 새 모듈을 확인했고, 후속 재현 검사에서는 보고서의 잘못된 BAD_INVESTMENT 합계, 가져온 응답 순서, 열린 탭의 피드백 노출, 오래된 저장 재시도의 덮어쓰기를 실제 실패로 확인한 뒤 수정했다.

초기 E2E는 기존 5173 포트의 v0.1 서버를 재사용해 새 프리셋을 찾지 못했다. 현재 설정은 5174에서 이 작업 사본을 새로 시작하며, 기존 서버를 재사용하지 않는다. Windows 샌드박스에서 테스트 서버 종료가 대기한 경우, 모든 테스트 완료를 확인한 뒤 해당 실행이 만든 Vite 프로세스만 종료하여 테스트 실행기의 최종 종료 코드를 확인했다. 실행 중 Node의 NO_COLOR/FORCE_COLOR 환경 경고가 있었으며 기능/타입/빌드 오류는 없었다. 기존 5173 서버는 변경하지 않았다.

## Visual/browser checks

Microsoft Edge, 데스크톱 **1440×1000**, 태블릿 **820×1180**.

- 문제 영역 너비가 탐색기 너비의 2배 이상, 가로 넘침 없음.
- 탐색 버튼 44px 이상; 27번까지 전체 버튼이 보임. 태블릿 마지막 줄 잘림을 수정.
- 스크롤 후에도 타이머가 화면 안에 유지됨.
- 시험 중 정답/오답 표시·해설·진단·확신도·학습 메뉴 없음.
- 답변 → Later → Skip → 직접 재방문 → 새로고침 → 제출 → 결과 → 새로고침 → 사후 검토를 실제 UI로 확인.
- 원래 마감 시각을 넘겨 새로고침해도 저장 답안이 남고 90분으로 시간 제한됨.
- 저장 실패 후 만료 복구, 최신 다른 탭 답안 보존, 백업 내 응답 순서 변경 후 문항 번호 보존 확인.
- 오류 문항의 정답·해설·시간·진단·선택적 분류 컨트롤을 실제 렌더 화면에서 확인.

직접 확인한 캡처:

- [Desktop exam](../test-results/desktop-real-exam.png)
- [Tablet exam](../test-results/tablet-real-exam.png)
- [Desktop report and review](../test-results/desktop-real-exam-report.png)
- [Tablet report and review](../test-results/tablet-real-exam-report.png)

## Known limitations

- 27개 DRAFT는 과학적으로 검증된 실전 문제집이 아니며 과부하 시험을 충분히 재현하지 못한다. 자동 복제/승격 없음.
- 기존 문항의 메타데이터는 ‘미지정’이며 언어/유형/맥락별 의미 있는 비교에는 태깅된 실제 은행이 필요하다.
- 문항 시간은 탭 비활성·새로고침 시간을 포함한 벽시계 시간이다. 실제 주의 집중이나 시스템 시각 변경은 보정하지 않는다.
- 물리적 iPad/Safari 기기 검사는 수행하지 않았다. 이번 태블릿 검사는 Edge viewport에서 수행했다.
- IndexedDB는 origin별 로컬 저장이다. 저장 자체가 실패한 뒤 강제 새로고침하면 메모리 임시 기록은 사라질 수 있으므로 먼저 재시도/내보내기를 사용해야 한다. 충돌한 기록을 자동 병합하지 않는다.
- 기존 5173 서버는 이전 사본일 수 있으므로 새 코드를 실행할 때 E: 작업 경로를 사용해야 한다. 다른 포트는 별도 저장소이므로 기록 이동에는 JSON 백업/가져오기가 필요하다.

## Next recommended step

1. 내용 검토와 최소 메타데이터 태깅을 완료한 충분한 문항 은행을 가져온다.
2. 실제 iPad에서 한 차례 90분 모의시험과 결과 검토를 수행한다.
