import { useState } from 'react';
import type { StudyData } from './model';
import { FAILURES } from './model';
import { summarizeQF } from './qfEngine';
import { Link } from './ui';

export function QFStats({ data, sessionId }: { data: StudyData; sessionId?: string }) {
  const a = summarizeQF(data, sessionId);
  const ratio = (correct: number, total: number) => total ? `${correct}/${total} (${Math.round(correct / total * 100)}%)` : '— (채점된 응답 없음)';
  return <><div className="diagnostic-strip qf-stats" data-testid="qf-stats"><span>자동 채점 정답 <strong>{a.autoCorrect}</strong></span><span>자동 채점 오답 <strong>{a.autoWrong}</strong></span><span>자기 채점 정답 <strong>{a.selfCorrect}</strong></span><span>자기 채점 오답 <strong>{a.selfWrong}</strong></span><span>부분 정답 <strong>{a.partial}</strong></span><span>판단 보류 <strong>{a.deferred}</strong></span><span>미채점 <strong>{a.ungraded}</strong></span><span>미응답 <strong>{a.unanswered}</strong></span></div><p className="small muted">객관식 자동 채점과 주관식 자기 채점을 구분합니다. 부분 정답·판단 보류·미채점은 정답 합계에 넣지 않습니다.</p><p className="small" data-testid="qf-accuracy">자동 정답률 {ratio(a.autoCorrect, a.autoGraded)} · 자기 채점 정답률 {ratio(a.selfCorrect, a.selfGraded)}</p><p className="small muted">자동 정답률 = 선택형 정답 / 응답한 선택형. 자기 채점 정답률 = 정답 / (정답 + 부분 정답 + 오답). 미응답·미채점·판단 보류는 분모에서 제외하며, 기존 BIO SPRINT 통계에는 합산하지 않습니다.</p></>;
}
export function QFSummary({ data, detailed = false }: { data: StudyData; detailed?: boolean }) {
  const [by, setBy] = useState<'domain' | 'stage' | 'reasoning_load' | 'language_load'>('domain');
  const history = [...(data.qfSessions ?? [])].filter(s => s.status === 'COMPLETED').sort((a,b) => b.startedAt - a.startedAt);
  const complete = new Set(history.map(s => s.id));
  const rows = (data.qfResponses ?? []).filter(r => complete.has(r.sessionId));
  const groups = [...new Set(rows.map(r => String(r[by])))];
  return <section className="panel"><div className="section-heading"><h2>Question Factory · DAILY-15</h2><Link className="button secondary" href="/question-factory">QF 세트 가져오기 / 시작</Link></div>
    <QFStats data={data}/>
    {detailed && <><h3>실패 유형별 기록</h3><div className="diagnostic-strip">{Object.entries(FAILURES).map(([key,label]) => <span key={key}>{key} · {label} <strong>{rows.filter(r => r.failureType === key).length}</strong></span>)}</div>
      <label>QF 분석 분류<select value={by} onChange={e => setBy(e.target.value as typeof by)}><option value="domain">영역</option><option value="stage">Stage</option><option value="reasoning_load">추론 부담</option><option value="language_load">언어 부담</option></select></label>
      <div className="table-scroll"><table><thead><tr><th>분류</th><th>응답</th><th>자동 정답</th><th>자기 정답</th><th>부분 정답</th><th>K 개념</th><th>L 영어</th></tr></thead><tbody>{groups.map(label => { const group = rows.filter(r => String(r[by]) === label); return <tr key={label}><td>{label}</td><td>{group.filter(r => r.outcome === 'ANSWERED').length}/{group.length}</td><td>{group.filter(r => r.gradingMode === 'AUTO' && r.correct).length}</td><td>{group.filter(r => r.selfGrade === 'CORRECT').length}</td><td>{group.filter(r => r.selfGrade === 'PARTIAL').length}</td><td>{group.filter(r => r.failureType === 'K').length}</td><td>{group.filter(r => r.failureType === 'L').length}</td></tr>; })}</tbody></table></div></>}
    {history.length > 0 && <ul className="history-list">{history.slice(0, detailed ? 100 : 5).map(s => <li key={s.id}><Link href={'/qf-session/' + encodeURIComponent(s.id)}><strong>DAILY-15</strong><span>{new Date(s.startedAt).toLocaleString('ko-KR')}</span><span className="qf-run-id">{s.runId}</span><span>결과·자기 채점 →</span></Link></li>)}</ul>}
  </section>;
}
