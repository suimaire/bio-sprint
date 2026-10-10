import { useState } from 'react';
import { FAILURES, type FailureType, type StudyData } from './model';
import { hasQFAnswer, SELF_GRADES, type QFSession, type SelfGrade } from './qfModel';
import { gradeQF } from './qfEngine';
import { QFPrompt } from './QFTraining';
import { QFStats } from './QFSummary';
import { Link, seconds, type Save } from './ui';

function OriginalRecord({ label, value }: { label: string; value: unknown }) {
  const [open, setOpen] = useState(false);
  return <details className="explanation" onToggle={e => setOpen(e.currentTarget.open)}><summary>{label}</summary>{open && <pre className="qf-original">{JSON.stringify(value, null, 2)}</pre>}</details>;
}
export function QFReport({ data, session: s, onSave, busy }: { data: StudyData; session: QFSession; onSave: Save; busy: boolean }) {
  const [index, setIndex] = useState(0), [error, setError] = useState('');
  if (s.status !== 'COMPLETED') return <p>풀이 종료 후 결과를 확인할 수 있습니다.</p>;
  const p = data.qfPackages!.find(p => p.run_id === s.runId)!;
  const w = p.questions[index], q = w.question;
  const r = data.qfResponses!.find(r => r.sessionId === s.id && r.questionId === w.id)!;
  async function record(patch: Parameters<typeof gradeQF>[3]) {
    try { if (await onSave(gradeQF(data, s.id, w.id, patch))) setError(''); } catch (e) { setError((e as Error).message); }
  }
  const label = (qid: string) => {
    const row = data.qfResponses!.find(r => r.sessionId === s.id && r.questionId === qid)!;
    return !hasQFAnswer(row) ? '미응답' : row.gradingMode === 'SELF' ? row.selfGrade ? SELF_GRADES[row.selfGrade] : '미채점' : row.correct ? '정답' : '오답';
  };
  return <><header className="page-heading"><div><span className="eyebrow">QUESTION FACTORY</span><h1>DAILY-15 결과</h1><p className="qf-preserve">{s.runId} · {s.endReason === 'EXPIRED' ? '시간 종료' : '제출 완료'} · 풀이 시간 {seconds(s.endedAt! - s.startedAt)}</p></div><Link className="button secondary" href="/question-factory">세트 목록</Link></header>
    <QFStats data={data} sessionId={s.id}/>
    <nav className="qf-result-nav button-row" aria-label="QF 결과 문항">{s.questionIds.map((id, i) => <button className={`button ${i === index ? 'primary' : 'secondary'}`} key={id} onClick={() => setIndex(i)} aria-current={i === index ? 'step' : undefined}>{i + 1}번 · {label(id)}</button>)}</nav>
    <section className="question-stage" key={w.id}><h2>{index + 1}번 · {label(w.id)} · {r.gradingMode === 'AUTO' ? '자동 채점' : '자기 채점'}</h2><QFPrompt q={q}/>
      {q.options && <ol className="qf-review-options">{Object.entries(q.options).map(([key,v]) => <li key={key}><strong>{key}.</strong> {Array.isArray(v) ? v.join(', ') : v}</li>)}</ol>}
      <h3>내 답안</h3><pre className="qf-original">{r.gradingMode === 'AUTO' ? r.selectedOption ?? '미응답' : hasQFAnswer(r) ? r.textAnswer : '미응답'}</pre>
      <p className="small muted">풀이 {seconds(r.responseTimeMs)} · 방문 {r.visitCount}회{r.revisited ? ' · 재방문' : ''} · 답안 변경 {r.answerChangeCount}회</p>
      <div className="feedback"><h3>{r.gradingMode === 'AUTO' ? '정답' : '예시 정답 · expected_answer'}</h3><p className="qf-preserve">{q.correct_answer ?? q.expected_answer}</p>
        {q.scoring_points && <section aria-label="원본 채점 기준"><h3>원본 rubric · scoring_points</h3>{q.scoring_points.map((point,i) => <article className="qf-rubric" key={i}><h4>{i + 1}. {point.point}</h4><label className="qf-rubric-check">기준 {i + 1} 충족 여부<select aria-label={'채점 기준 ' + (i + 1) + ' 충족 여부'} value={r.rubricChecks?.[i] == null ? '' : String(r.rubricChecks[i])} disabled={busy || !hasQFAnswer(r)} onChange={e => { const values = q.scoring_points!.map((_, j) => r.rubricChecks?.[j] ?? null); values[i] = e.target.value === '' ? null : e.target.value === 'true'; void record({ rubricChecks: values }); }}><option value="">미확인</option><option value="true">충족</option><option value="false">미충족</option></select></label><p>허용 답안 · acceptable</p><ul>{point.acceptable.map((v,j) => <li key={j}>{v}</li>)}</ul><p>필수 개념 · required_concepts</p><ul>{point.required_concepts.map((v,j) => <li key={j}>{v}</li>)}</ul><p>요구하지 않는 내용 · not_required</p><ul>{point.not_required.map((v,j) => <li key={j}>{v}</li>)}</ul></article>)}<p className="small muted">번호는 채점 기준의 순서입니다. 기준별 확인과 최종 자기 채점은 별도로 저장하며 배점이나 자동 점수를 만들지 않습니다.</p></section>}
        <h3>해설</h3><p className="qf-preserve">{q.explanation}</p>
        {q.distractor_rationales && <dl>{Object.entries(q.distractor_rationales).map(([k,v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>}
      </div>
      {r.gradingMode === 'SELF' && <fieldset className="qf-confidence"><legend>사용자 자기 채점</legend><p className="small muted">입력 문자열을 정답과 비교해 자동 채점하지 않습니다. 위 기준을 읽고 판정하세요.</p><div className="button-row">{Object.entries(SELF_GRADES).map(([key,label]) => <button key={key} className={`button ${r.selfGrade === key ? 'primary' : 'secondary'}`} aria-pressed={r.selfGrade === key} disabled={busy || !hasQFAnswer(r)} onClick={() => void record({ selfGrade: key as SelfGrade })}>{label}</button>)}</div></fieldset>}
      <div className="setup-fields"><label>풀이 확신도<select value={r.confidence ?? ''} disabled={busy || r.shownAt === null} onChange={e => void record({ confidence: e.target.value ? Number(e.target.value) as 1|2|3|4|5 : null })}><option value="">미기록</option>{[1,2,3,4,5].map(n => <option key={n} value={n}>{n}</option>)}</select></label>
        <label>실패 유형<select value={r.failureType ?? ''} disabled={busy || r.correct === true} onChange={e => void record({ failureType: e.target.value as FailureType || null })}><option value="">미기록</option>{Object.entries(FAILURES).map(([key,label]) => <option key={key} value={key}>{key} · {label}</option>)}</select></label></div>
      {error && <p className="alert" role="alert">{error}</p>}
      {q.stage === 3 && <section className="qf-english"><h3>Stage 3 English Review</h3><OriginalRecord label="원본 영어 읽기 도움과 검토 기록" value={w.provenance.review.english}/><OriginalRecord label="원본 영어 QA" value={w.provenance.review.english_qa}/></section>}
      <details className="explanation"><summary>출처 · PDF 페이지 · evidence refs</summary><p className="small">원본 파일 경로는 출처 기록입니다. iPad에서 열 수 있는 웹 주소가 아닙니다.</p><p className="qf-preserve">{q.evidence_refs.join('\n')}</p>{w.provenance.evidence_packet.evidence.map((e,i) => <div key={i}><p>출처 {String(e.source_id)} · PDF {String(e.pdf_page_number)}페이지 (인덱스 {String(e.pdf_page_index)})</p><p className="qf-preserve">{String(e.source_file)}<br/>{String(e.source_path)}</p></div>)}</details>
      <OriginalRecord label="문항 provenance · 검토 기록" value={{ source_file: w.provenance.source_file, content_digest: w.provenance.content_digest, blueprint: w.provenance.blueprint, review: w.provenance.review, blind: w.provenance.blind }}/><p className="small muted">원본 근거 packet과 교재 원문은 Study Data 백업에 보존됩니다. 이 화면에서는 필요한 출처와 검토 기록만 표시합니다.</p>
      <OriginalRecord label="세트 원본 provenance" value={p.provenance}/>
    </section>
  </>;
}
