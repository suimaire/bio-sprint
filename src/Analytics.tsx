import { useState } from 'react';
import { aggregate, diagnosticFlags, FLAG_LABELS, groupStats, timeLeaks } from './metrics';
import { FAILURES, TAXONOMY, type BiologyDomain, type FailureType, type Response, type StudyData } from './model';
import { Empty, Link, percent, seconds } from './ui';

export function Stats({ data, responses, compact = false }: { data: StudyData; responses?: Response[]; compact?: boolean }) {
  const a = aggregate(data, responses);
  const values = [
    ['accuracy', '정확도', a.attempted ? percent(a.accuracy) : '—', '응답한 문제 기준'],
    ['medianMs', '중앙 응답 시간', a.attempted ? seconds(a.medianMs) : '—', '피드백 시간 제외'],
    ['easyMisses', '쉬운 문제 오답', a.easyMisses, '난이도 1–2'],
    ['skipRate', '미응답률', a.total ? percent(a.skipRate) : '—', '건너뜀 + 미도달'],
    ['attempted', '시도한 문제', a.attempted, `전체 ${a.total}문항`],
    ['attemptRate', '시도율', a.total ? percent(a.attemptRate) : '—', '시도 / 전체'],
    ['slowCorrect', '느린 정답', a.slowCorrect, '목표 시간의 1.5배 초과'],
    ['misconceptions', '오개념 후보', a.misconceptions, '확신도 4–5 오답'],
  ];
  return <div className={`stats ${compact ? 'compact' : ''}`}>{(compact ? values.slice(0, 4) : values).map(([id, label, value, hint]) => <div className="stat" key={id} data-testid={`stat-${id}`}><span className="stat-label">{label}</span><strong>{value}</strong><span className="small muted">{hint}</span></div>)}</div>;
}
export function LeakList({ data, responses }: { data: StudyData; responses?: Response[] }) {
  const [by, setBy] = useState<'domain' | 'subdomain' | 'tags'>('subdomain');
  const rows = timeLeaks(data, by, responses).slice(0, 5);
  return <section className="panel"><div className="section-heading"><div><span className="eyebrow orange">시간을 되찾을 곳</span><h2>TIME LEAK</h2></div><label className="sr-only" htmlFor="leak-group">시간 누수 분류</label><select id="leak-group" value={by} onChange={e => setBy(e.target.value as typeof by)}><option value="subdomain">세부 영역</option><option value="domain">영역</option><option value="tags">태그</option></select></div>
    {rows.length ? <ol className="rank-list">{rows.map((r, i) => <li key={r.label}><span className="rank">{String(i + 1).padStart(2, '0')}</span><div><strong>{by === 'domain' ? TAXONOMY[r.label as BiologyDomain] : r.label}</strong><p className="small muted">목표 초과 {r.count}회</p><div className="bar"><span style={{ width: `${r.excessMs / rows[0].excessMs * 100}%` }}/></div></div><span className="leak-value">+{seconds(r.excessMs)}</span></li>)}</ol> : <Empty>아직 시간 누수가 없습니다.<br/>목표 시간의 1.5배를 넘긴 풀이가 여기에 표시됩니다.</Empty>}
    <p className="panel-note">초과 풀이 시간 합계 순 · 학습을 돕는 실용적 지표</p>
  </section>;
}
export function Analytics({ data, sessionId }: { data: StudyData; sessionId?: string }) {
  const [by, setBy] = useState<'domain' | 'subdomain' | 'mode' | 'failureType'>('domain');
  const session = data.sessions.find(s => s.id === sessionId);
  if (sessionId && !session) return <div className="panel"><h1>세션을 찾을 수 없습니다</h1><Link href="/">대시보드로 이동</Link></div>;
  const rows = data.responses.filter(r => (!sessionId || r.sessionId === sessionId) && r.outcome !== 'PENDING');
  const groups = groupStats(data, by, rows);
  const a = aggregate(data, rows);
  return <>
    <header className="page-heading"><div><span className="eyebrow">SESSION DEBRIEF</span><h1>{sessionId ? '훈련 결과' : '누적 분석'}</h1><p>{session ? `${session.mode} · ${session.questionIds.length}문항 · ${new Date(session.startedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}` : '정답 여부와 시간을 함께 읽어 다음 훈련을 정하세요.'}</p></div><Link className="button primary" href="/training">다시 훈련하기 →</Link></header>
    <Stats data={data} responses={rows}/>
    <div className="diagnostic-strip"><span>장시간 오답 <strong>{a.longWrong}</strong></span><span>시간 투자 주의 <strong>{a.badInvestments}</strong></span><span>명시적 건너뜀 / 풀이 중 종료 <strong>{rows.filter(r => r.outcome === 'SKIPPED').length}</strong></span><span>미도달 <strong>{rows.filter(r => r.outcome === 'UNREACHED').length}</strong></span></div>
    <div className="two-column"><section className="panel"><div className="section-heading"><h2>영역별 진단</h2><label className="sr-only" htmlFor="analytics-group">분석 분류</label><select id="analytics-group" value={by} onChange={e => setBy(e.target.value as typeof by)}><option value="domain">영역</option><option value="subdomain">세부 영역</option><option value="mode">모드</option><option value="failureType">오답 원인</option></select></div>
      {groups.length ? <div className="table-scroll"><table><thead><tr><th>분류</th><th>시도</th><th>정확도</th><th>중앙 시간</th></tr></thead><tbody>{groups.map(g => <tr key={g.label}><td>{by === 'domain' ? TAXONOMY[g.label as BiologyDomain] : by === 'failureType' ? `${g.label} ${FAILURES[g.label as FailureType]}` : g.label}</td><td>{g.attempted}/{g.total}</td><td>{g.attempted ? percent(g.accuracy) : '—'}</td><td>{g.attempted ? seconds(g.medianMs) : '—'}</td></tr>)}</tbody></table></div> : <Empty>분석할 기록이 아직 없습니다.</Empty>}
    </section><LeakList data={data} responses={rows}/></div>
    <section className="panel"><div className="section-heading"><div><span className="eyebrow">QUESTION LOG</span><h2>문제별 기록</h2></div><span className="muted small">첫 판단 → 결과 → 진단</span></div>
      {rows.length ? <div className="response-list" data-testid="response-table">{rows.map(r => { const q = data.questions.find(q => q.id === r.questionId)!; const flags = diagnosticFlags(q, r); return <details key={r.id}><summary><span className={`result-mark ${r.correct ? 'good' : ''}`}>{r.outcome === 'ANSWERED' ? r.correct ? '정답' : '오답' : r.outcome === 'UNREACHED' ? '미도달' : '건너뜀'}</span><span className="response-title">{q.question.split('\n')[0]}<small>{TAXONOMY[q.domain]} · {q.subdomain} · {q.sourceType}{q.fixture ? ' / 개발용' : ''}</small></span><span className="response-meta">{r.firstDecision ?? '판단 없음'}{r.revisited ? ' · 재방문' : ''}<strong>{seconds(r.responseTimeMs)} / 목표 {q.targetTimeSec}초</strong></span></summary><div className="response-detail"><p>내 답: {r.selectedAnswer === null ? '미응답' : q.choices[r.selectedAnswer]} · 정답: {q.choices[q.answer]}</p><p>{q.explanation}</p><p>확신도: {r.confidence ?? '미기록'} · 오답 원인: {r.failureType ? `${r.failureType} ${FAILURES[r.failureType]}` : '—'}</p><p className="small muted">판단 이력: {r.decisions.map(d => d.decision).join(' → ') || '없음'} · 방문 {r.visitCount}회</p><div className="tags">{flags.map(f => <span className="badge warning" key={f}>{FLAG_LABELS[f]} · {f}</span>)}</div></div></details>; })}</div> : <Empty>훈련을 마치면 응답과 판단 기록을 확인할 수 있습니다.</Empty>}
    </section>
    <details className="method-note"><summary>지표 계산 기준</summary><p>정확도는 정답/시도, 시도율은 시도/전체, 미응답률은 (건너뜀+미도달)/전체입니다. 중앙 시간은 제출한 응답만 포함하며 재방문 시간을 합산합니다. FAST는 목표의 0.75배 미만, SLOW는 1.5배 초과입니다. LONG_WRONG은 오답이면서 1.5배 초과, BAD_INVESTMENT는 2배 초과이면서 미정답 또는 난이도 4–5입니다. 오개념 후보는 확신도 4–5의 오답입니다. 이 지표는 과학적으로 검증된 모델이 아닌 훈련용 휴리스틱입니다.</p></details>
  </>;
}
