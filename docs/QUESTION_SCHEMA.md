# Question and study JSON

Files must be UTF-8 JSON, at most 20 MB. Validation rejects malformed JSON and reports indexed field paths; no partial imports. Only schema version 1 is supported.

## Question-bank file
Top level is an array. Required fields:

| Field | Rule |
|---|---|
| `id` | Unique string, 1–128 characters, no leading/trailing whitespace |
| `mode` | RECALL, INTERPRET, DEEP |
| `domain` | An exact key of `TAXONOMY` in model.ts |
| `subdomain` | Nonempty string, at most 200 characters |
| `difficulty` | Integer 1–5 |
| `sourceType` | VERIFIED, REVIEWED, DRAFT |
| `question` | Nonempty text, max 20,000 characters; newlines supported |
| `choices` | 2–9 nonempty strings, each max 5,000 characters |
| `answer` | Zero-based integer within choices |
| `explanation` | Nonempty text, max 20,000 characters |
| `tags` | String array, max 50 tags, each nonempty and max 200 characters |
| `targetTimeSec` | Integer 1–3600 |
| `fixture` | Optional boolean; marks development/test content |
| `language` | Optional KO / EN; absent values remain unknown |
| `stimulusType` | Optional DIRECT / PASSAGE / GRAPH / TABLE / EXPERIMENT / PEDIGREE / CALCULATION |
| `contextNovelty` | Optional STANDARD / TRANSFER |

Allowed domains: Biochemistry, Cell Biology, Molecular Biology, Genetics, Physiology, Immunology, Evolution, Ecology, Plant Biology, Developmental Biology, Experimental Biology.

```json
[
  {
    "id": "my-genetics-001",
    "mode": "RECALL",
    "domain": "Genetics",
    "subdomain": "멘델 유전",
    "difficulty": 1,
    "sourceType": "DRAFT",
    "question": "Aa × Aa에서 aa 자손의 기대 비율은?",
    "choices": ["1/4", "1/2", "3/4", "1"],
    "answer": 0,
    "explanation": "각 부모가 a를 전달할 확률은 1/2이다. 곱하면 1/4이다.",
    "tags": ["분리 법칙"],
    "targetTimeSec": 15
  }
]
```

## Source status
- VERIFIED: provider has verified the answer and source.
- REVIEWED: human reviewed, without implying full independent verification.
- DRAFT: unreviewed, excluded by default.

The importer preserves status exactly; it does not verify scientific truth. All built-in fixtures have `sourceType: "DRAFT"` and `fixture: true`. Inspect scientific content before using it as a real exam bank.

## Study backup
Use **Export Study Data** on the dashboard. The output is:

```json
{
  "schemaVersion": 1,
  "questions": [],
  "sessions": [],
  "responses": []
}
```

Real exports contain full records, including active sessions. Types are defined in `src/model.ts` and validation is in `src/validation.ts`. Epoch timestamps are integer milliseconds. Null is required for absent response values. Every session question must have exactly one response. Question/session references, source eligibility, mode, queue/cursor, selected answer, correctness, confidence, failure codes and timestamp ranges are validated. Complete sessions cannot contain pending responses. Training can defer each question at most once; the original IDs form the queue prefix. There can be at most one active session.

v0.2 adds `Session.mode: REAL_EXAM` and completed-exam `endReason: SUBMITTED | EXPIRED`. Exams use a fixed queue equal to unique question IDs and allow arbitrary repeat visits. Active exam responses remain PENDING with an optional selected answer and null correctness/confidence/failure. Exam responses add `firstAnsweredAt`, `finalResponseAt` (timestamp or null), and `answerChangeCount` (nonnegative integer). Finalized unanswered exam responses may have optional post-exam confidence/failure tags. These extensions do not change v0.1 record requirements. Missing question metadata is grouped as 미지정; no migration fabricates labels. See [REAL_EXAM.md](REAL_EXAM.md) for exact timing/triage and diagnostic semantics. Backups containing REAL_EXAM require v0.2 or later.

## Import rules
1. Question bank import accepts a question array; study import accepts the versioned object. Entire payload is checked before showing a preview.
2. The preview reports new question/session/response counts. Apply is explicit. Exact duplicate records are ignored; key order does not matter.
3. Conflicting IDs reject the entire file and preserve stored data. To revise a question, create a new ID; this prevents historical results from silently changing. Import into a fresh browser profile to restore a backup that conflicts with an older active-session copy. Do not clear existing data before exporting it.
4. Application rechecks the merge on apply, then writes in a single IndexedDB transaction. A changed revision in another tab causes a clear error and asks for reload.
5. The data belongs to the browser origin (scheme, host, port). Keep using `http://127.0.0.1:5173`; `localhost` is a different storage origin. To transfer devices, export on the old device and import on the new one.
6. Raw recovery export contains the internal `{revision,data}` envelope and is for repair, not direct study import. Once repaired, import the `data` member through the regular validation flow.
