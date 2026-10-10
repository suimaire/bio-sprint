# Phase 5B 구현 계획

목표: 로컬 파일로 가져온 READY / AI_REVIEWED DAILY-15를 30분 동안 풀고 답안·확신도·자기 채점 결과를 기기에 보존한다.

설계: 기존 schemaVersion 1과 IndexedDB 버전 1을 유지한다. 선택 필드 qfPackages, qfSessions, qfResponses에 원본 패키지와 별도 풀이 기록을 추가한다. 기존 문제·REAL EXAM의 데이터 모델과 정답률은 유지하고 QF 분석을 구별해 표시한다. 공개 저장소에는 합성 테스트 자료만 추가한다.

- [x] 계약: qfModel.ts, qfImport.ts. 버전/READY/AI_REVIEWED/목록/형식/원본 digest/검토 binding/출처 검증, 전량 원자적 병합과 충돌 거절.
- [x] 기록: qfEngine.ts, qfValidation.ts, model.ts, validation.ts. 15문항 원순서, 고정 1800초, 수정·이동·복구·만료·자기 채점. 기존 세션과 동시 시작 금지.
- [x] 화면: QFTraining.tsx, QFReport.tsx, QFSummary.tsx와 App/DataTransfer/Training/Dashboard/Analytics 연결. 제출 전 풀이 정보 분리, 종료 후 원본 rubric/영어 기록/출처 표시.
- [x] 검증: 합성 fixture 단위 테스트 실패 확인 후 구현; 전체 단위 테스트와 빌드 1회; 실제 파일 import→풀이→새로고침→제출→저장/백업 흐름 1회.

검토 초점: 같은 ID 내용 변경, 오래된 백업 병합, 앱 비활성 중 만료, 연속 텍스트 입력 저장, 부분 정답과 미채점의 분리.
제약: QF 읽기 전용, 모델 호출 0, 서버 업로드/새 백엔드/키/commit/push/배포 없음. STANDARD-50은 시작 차단.

검증 결과: 실제 export 포함 단위 테스트 50/50, 프로덕션 빌드, 공백 검사 통과. 단일 브라우저 흐름으로 기존 기록 보존·네 형식 입력·새로고침·자기 채점·백업 복원 확인. 실기기 iPad Safari 검증은 미실시.

변경 파일 (23개):
- 기존: .gitignore, README.md, src/Analytics.tsx, src/App.tsx, src/Dashboard.tsx, src/DataTransfer.tsx, src/Training.tsx, src/model.ts, src/sessionEngine.ts, src/styles.css, src/validation.ts
- 추가: src/qfModel.ts, src/qfDigest.ts, src/qfImport.ts, src/qfEngine.ts, src/qfValidation.ts, src/QFTraining.tsx, src/QFReport.tsx, src/QFSummary.tsx, src/qf.test.ts, tests/qf.spec.ts, playwright.qf.config.ts, docs/phase5b-plan.md

별도 코드 검토는 읽기 도구 실행 대기로 완료하지 못했다. 구현자 자체 점검 및 위 테스트 결과를 기준으로 사용자 확인을 기다린다. commit/push/배포는 수행하지 않았다.

## 후속 보완 · 2026-10-11

현재 working tree를 보존하고 이어서 작업하도록 승인받아 위 구현을 검토했다. Git 동기화·commit·push·배포는 실행하지 않았다.

- [x] DAILY-15 9/3/2/1 형식 수, 원본 파일 해시 목록, 검토 선택지/진술 판정, Stage 3 영어 기록, 미지원 구조 검증 보완.
- [x] 중복 JSON 키·비유한 숫자와 중복 선택지/조합을 저장 전에 거절. 원본 자료를 테스트 fixture로 복제하지 않음.
- [x] 답안을 유지하는 Later/Skip 표시·이동·해제, 원본 진술 순서, 상단 고정 이동 버튼과 지식 깊이 표시.
- [x] 기준별 충족/미충족/미확인 저장, 부분 정답을 포함한 자기 채점 분모 명시, 가져오기 예상 시간 표시. 근거 원문은 백업에 보존하고 결과 화면의 과도한 노출을 줄임.
- [x] 새 응답 필드는 선택 사항으로 두어 이전 QF 백업을 읽고, 기존 IndexedDB 버전과 학습 기록을 유지.
- [x] 다른 탭에서 종료할 때 저장 실패 답안을 상위 화면에 보존하여 복구 파일로 내보낼 수 있게 수정. 여러 세션에서 같은 상황이 반복되어도 앞선 복구 답안을 덮어쓰지 않도록 개별 보관하며, 두 세션 회귀 검사로 확인.

검증: QF 계약·충돌·답안·백업 테스트 19개(실제 로컬 export 검사 포함), 기존 domain/exam 호환성 테스트 42개, TypeScript 검사 통과. 합성 자료의 가져오기→네 형식 풀이→복구→제출/자기 채점→백업 복원→시간 만료 흐름 통과. 저장 실패 후 다른 탭 종료 회귀 검사는 수정 전 실패, 수정 후 통과했다. Windows 테스트 서버 종료 대기는 실행기를 중단하고 해당 회귀 검사만 서버 수명을 직접 관리하는 로컬 실행기로 검증했다. 스크린샷·영상·trace와 실제 자료 복사 없음.

실제 15문항은 전체 import 검증을 통과했다. 실제 iPad Safari의 가상 키보드·터치 동작은 아직 기기에서 검증하지 않았다.
