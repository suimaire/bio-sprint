# BIO SPRINT v0.2 — REAL EXAM

## Purpose and preset

Train score maximization under time pressure for the biology examination on **2026-11-14**. A direct post-exam account from one administration two years earlier described a 90-minute exam with excess questions, mixed biology backgrounds/languages, and excessive time spent on membrane potential. This is historical evidence, not a guarantee of this year's duration or composition.

Choose **REAL EXAM — 90 MIN** in 집중 훈련. The preset uses 90 minutes and up to 100 distinct eligible questions across all domains/modes, capped by the available bank. Existing least-recently-seen ordering and initial mode coverage are reused. It does not duplicate questions or generate content. DRAFT requires explicit opt-in. All 27 bundled fixtures remain unverified DRAFT; they are development data and cannot represent a credible full overload bank.

## Training versus examination

| Behavior | Training | REAL EXAM |
|---|---|---|
| Answer | Select then submit | Select and save immediately; edit or clear |
| Feedback | Immediate correctness and learning feedback | Only after durable submission/expiration |
| Confidence/failure | Required before continuing where applicable | Optional in post-exam review, including unanswered items |
| Navigation | Existing sequence and MIXED deferred queue | Previous/Next, arbitrary question navigator, repeat visits |
| Later/Skip | Existing MIXED rules | Mark and advance; existing answer is retained |
| Expiration | Existing tagging behavior preserved | All responses finalize immediately at the deadline |
| Other screens | Existing behavior | Current exam replaces all routes; learning menu hidden |

Shortcuts: **1–9** select/save, **L** Later, **S** Skip, **←/→** navigate. No whole-exam submit shortcut. Ordinary navigation has no confirmation. Explicit early submission has a confirmation step. Text-entry targets, modifiers, repeated keys and IME composition do not invoke shortcuts. Buttons and saving indicators distinguish persisted state from work still saving.

Navigator combines answer state with final triage state: ✓ answered, L Later, S Skip, — seen/unanswered, ○ unseen, outlined current item. Textual ARIA labels include all states and the current item uses `aria-current`. An answer and a Later/Skip mark may coexist. Selecting a different answer changes triage to SOLVE; clearing removes the answer but preserves triage history. The final question does not auto-submit.

## Timing and response semantics

All timestamps are integer Unix milliseconds. The persisted start + time limit defines the deadline; refreshing never resets it. An action at or after the deadline finalizes first and cannot replace an earlier saved answer. Completion is saved before showing the report. A repeated expiration of a completed exam is a no-op.

- `shownAt`: first display, null if never reached.
- `firstAnsweredAt`: first non-null answer selection, retained after edits/clears.
- `answeredAt`: selection time of the currently retained answer; null when cleared/unanswered.
- `finalResponseAt`: most recent answer edit, clear, Later or Skip; navigation alone does not alter it.
- `selectedAnswer`: final/current answer; active exam responses remain PENDING and `correct` stays null until submission.
- `firstDecision` and `decisions`: first triage and full timestamped triage history. Final triage is the last decision, or none.
- `visitCount`: number of opens; revisit count is `max(0, visitCount - 1)`.
- `answerChangeCount`: changes after the first selection, including clearing and reselecting after clearing. Clicking the same selected answer is a no-op.
- `responseTimeMs`: sum of open visits. Time continues after selecting an answer until navigation/submission. The current question receives time during tab inactivity, refresh, and time away; this measures wall-clock allocation, not attention. Expiration caps the open visit at the original deadline.
- `endReason`: SUBMITTED or EXPIRED. EXPIRED ends exactly at the deadline.

An unsaved action is retained in memory if persistence fails; controls lock and offer retry or recovery export. If time expires before retry, finalization includes that retained answer. Persistent storage failure leaves recovery controls visible and does not pretend the report was saved. A failed in-memory save cannot survive a forced refresh or browser crash; export/retry first. Storage is browser-origin-specific and the existing revision check prevents silent concurrent-tab overwrites. Same-origin tabs receive revision notifications via BroadcastChannel and reload the existing IndexedDB snapshot; focus/visibility also refreshes the snapshot. Already-open learning screens lock when another tab starts an exam, and show the report when it completes. This is local-tab coordination, not cloud synchronization. Use one exam tab to avoid competing navigation. Retry retains its original source snapshot: if another tab has since saved, the stale retry is rejected instead of overwriting newer answers. Export its temporary record before reloading; conflicting histories are not automatically merged.

## Report and exact diagnostic rules

Report totals include every planned question, including unseen items. Attempted = non-null final answers. Accuracy = correct/attempted, attempt rate = attempted/total. Empty accuracy/median displays ‘—’. Median includes answered questions' total visit times. Times display rounded whole seconds.

- **EASY_MISS**: final answer incorrect and difficulty <= 2.
- **LONG_WRONG**: final answer incorrect and total question time **strictly greater than 1.5 × targetTimeSec**.
- **BAD_INVESTMENT (REAL EXAM)**: final answer not correct (incorrect or unanswered), and total question time **strictly greater than 2 × targetTimeSec**. Correct answers are excluded even if difficult; v0.1 Training's existing broader rule is preserved in its analytics.
- **KNOWN_BUT_LOST**: exam ended by **EXPIRED**, final answer is null, and either **difficulty <= 2**, or the **latest answered response to the same question in a Training session completed no later than exam start was correct**. Prior REAL EXAM, later sessions, topic performance, manually submitted exams and wrong submitted exam answers are excluded. A later pre-exam Training wrong answer cancels older correct evidence.

These are deterministic training heuristics, not scientifically validated psychometrics, proof of knowledge, or predicted points. SCORE LEAK counts overlap; do not sum them into predicted recoverable marks. No avoidable-score estimate is produced.

Correct/incorrect/unanswered time categories partition question time. Later/Skip/revisited time categories each include **all time on any question with that behavior**, not just time after the decision; they overlap and are explicitly labelled. BAD INVESTMENTS ranks the five largest unsuccessful investments with positive recorded time, whether or not they cross the diagnostic threshold. Actual domain/subdomain and outcomes are shown; clicking opens full question review.

## Compatible metadata and import boundary

Optional fields: `language: KO | EN`; `stimulusType: DIRECT | PASSAGE | GRAPH | TABLE | EXPERIMENT | PEDIGREE | CALCULATION`; `contextNovelty: STANDARD | TRANSFER`.

No inference or rewrite of old question files: missing metadata remains missing and report groups display **미지정**. This avoids silently presenting legacy questions as Korean/direct/standard without evidence and keeps identical legacy import IDs compatible. Defined fields are validated; unsupported enum values are rejected.

Existing schemaVersion 1, database version 1 and the same IndexedDB document are retained. New question fields and session/response fields are optional for v0.1 records; REAL_EXAM records validate their additional state separately. Import/export adaptation stays in `validation.ts` and existing `DataTransfer.tsx`. There is no Question Factory, generator, LLM API or assumed future factory schema. v0.1 releases cannot read backups containing the new REAL_EXAM mode.

## Limits

At most 100 distinct questions per session (existing engine limit); no exam builder, shuffle policy, question generator or score prediction. Missing metadata has no analytic meaning beyond an unknown group. No tab-attention correction or system-clock tamper resistance; use a stable device clock. Local answer keys remain in the bank because this is a personal simulator, not a secure testing/anti-cheating platform. Desktop/tablet layout is verified using Edge viewport emulation, not physical iPad Safari.

Future work: import a reviewed, metadata-tagged bank large enough to cause overload; validate scientific content independently; conduct one timed practice and a physical iPad check before relying on it for exam preparation.
