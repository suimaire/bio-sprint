# BIO SPRINT v0.1

This document records the preserved Training behavior. v0.2 adds REAL EXAM with separate timing, feedback, navigation and diagnostic rules documented in [REAL_EXAM.md](REAL_EXAM.md).

## Purpose and scope
Personal Korean biology exam training for **2026-11-14**. Train rapid recall, experimental reasoning, problem selection and error diagnosis to improve expected score under time pressure. Desktop/tablet first, phone supported. All data stays in this browser; no accounts or services.

## Model
- `Question`: stable unique ID, mode (RECALL / INTERPRET / DEEP), domain/subdomain, difficulty 1–5, source status, stem, 2–9 choices, zero-based answer, explanation, tags, target seconds, optional fixture flag.
- `TAXONOMY` in `src/model.ts`: Biochemistry, Cell Biology, Molecular Biology, Genetics, Physiology, Immunology, Evolution, Ecology, Plant Biology, Developmental Biology, Experimental Biology. Subdomains are nonempty user-maintained strings.
- `Session`: mode (including MIXED), original question IDs, deferred queue, cursor, start/end timestamps, time limit, source inclusion, ACTIVE/COMPLETED.
- `Response`: one per session/question; PENDING / ANSWERED / SKIPPED / UNREACHED, selected index, correctness, confidence 1–5, failure K/R/T/C/S, timing, first triage, timestamped triage history, visit count/revisited.

## Flow and timing
Choose mode, domain, 1–100 questions, 1–120 minutes (default 10 questions / 5 minutes). New ordinary sessions prefer least recently seen questions; MIXED begins with each available mode. Review uses descending priority. Available questions cap the count. No question repeats within a session except a deferred question's revisit.

Questions automatically start a timer. Number keys select an answer, Enter submits. Submission reveals correctness; then 1–5 selects confidence and K/R/T/C/S classifies a wrong answer. Space continues only when required tags exist. Controls expose visible keyboard focus and readable labels. Shortcuts ignore text inputs, links, selects, modifiers, IME and held keys. Early finish requires an explicit confirmation.

MIXED supports SOLVE, LATER and SKIP. Each question can be deferred once and returns after the initial pass. First decision never changes; all subsequent decisions are recorded. Submitting implies SOLVE if needed. SKIP is final. Pending questions at completion become SKIPPED if ever shown or UNREACHED if never shown; these automatic outcomes do not fabricate a user triage decision.

Question time sums visits and stops at submission/deferral/skip. Feedback time is excluded. `shownAt` is the first display, `lastShownAt` the open visit, `answeredAt` the submission. The wall-clock session timer includes feedback and time away; refreshing neither resets nor pauses it. Expiry clamps time to the deadline. Already submitted answers remain available for tagging after the bell, then the session ends. An active session resumes at `/training`; only one may be active. Unsubmitted choice selection is transient; durable submissions and tags survive refresh.

## Metrics and transparent heuristics
Defined in `src/metrics.ts`, independent of the UI:
- Accuracy = correct / attempted. Attempt = submitted answer. Attempt rate = attempted / finalized question count. Skip rate = (SKIPPED + UNREACHED) / finalized count. Active PENDING questions are excluded from aggregates; after completion every planned question is included.
- Median response time includes answered questions only, across all visits. Empty values display as no data rather than claiming 0% accuracy.
- FAST: time <0.75× target. NORMAL: 0.75–1.5× inclusive. SLOW: >1.5×.
- EASY_MISS: wrong and difficulty ≤2.
- SLOW_CORRECT: correct and time >1.5× target.
- LONG_WRONG: wrong and time >1.5× target.
- MISCONCEPTION_CANDIDATE: wrong and confidence ≥4. Confidence is requested after correctness per the brief; it is a retrospective judgment, not a calibrated prospective measure.
- BAD_INVESTMENT: time >2× target, and either not correct or difficulty ≥4.
- TIME LEAK: include finalized responses exceeding 1.5× target, sum `(time − target)` by domain/subdomain/tag. Rank by descending excess, then count, then label. Duplicate tags count once per response; tag totals overlap, so do not sum them as independent totals.
- Review priority: latest wrong +5; latest high-confidence wrong +7; additional wrongs in preceding 14 days +3 each. Latest slow correct =2; latest normal/fast correct =0. Ties use question ID. Skips alone do not enter the review queue.
- D-day and today's activity use the Asia/Seoul calendar; completion after the exam displays D+N. Today's counts are by session mode, using the answer submission date.

These are pragmatic training heuristics, not scientifically validated diagnosis or memory models. Aggregation supports domain, subdomain, mode and failure type. Failure groups include classified wrong answers only.

## Persistence and source trust
Native IndexedDB `bio-sprint`, database version 1, object store `study`, key `current`. Envelope `{ revision, data }`; exported StudyData has `schemaVersion: 1`. Every save is an atomic transaction with a revision comparison, preventing silent overwrites from another tab. Failed writes retain the last persisted state and show a recovery message. Invalid existing data is never automatically reset; raw export is offered.

27 seed questions cover all 11 domains and all three modes. They are explicitly unverified **DRAFT development fixtures**, not an authoritative question bank. VERIFIED/REVIEWED only by default; DRAFT requires deliberate opt-in for each fresh setup. The app never promotes source status.

Study JSON includes questions, sessions, responses, timing, confidence and triage. Import validates shape and relationships, previews additions, and merges atomically. Identical IDs/content deduplicate; differing content under an existing ID rejects the entire import. Existing questions and history are not overwritten. See QUESTION_SCHEMA.md.

## Non-goals and limits
No backend, cloud sync, authentication, AI APIs/questions/chat, social features, leaderboard, gamification, complex spaced repetition, notifications, 3D or deployment. No graphical question editor. No service worker or installable offline app: the local Vite server serves the application; study data is local. Storage is origin-specific and may be cleared/evicted by the browser, so export regularly. Single-document persistence intentionally targets a personal six-week history; split IndexedDB stores only if measured volume requires it. Physical Mac/iPad devices are not part of automated verification.
