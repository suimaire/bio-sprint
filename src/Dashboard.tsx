import { daysUntilExam, groupStats, reviewQueue, seoulDate, aggregate } from './metrics';
import { EXAM_DATE, TAXONOMY, type BiologyDomain, type StudyData } from './model';
import { DataTransfer } from './DataTransfer';
import { LeakList, Stats } from './Analytics';
import { Empty, Icon, Link, type Save, percent } from './ui';

export function ReviewList({ data, full = false }: { data: StudyData; full?: boolean }) {
  const queue = reviewQueue(data);
  const displayed = full ? queue : queue.slice(0, 3);
  return <section className="panel review-panel"><div className="section-heading"><div><span className="eyebrow">PRACTICE NEXT</span><h2>다음에 복습할 문제 <span className="count">{queue.length}</span></h2></div>{queue.length > 0 && <Link href="/training?review=1" className="text-link">복습 시작 <Icon name="arrow"/></Link>}</div>
    {displayed.length ? <ol className="review-list">{displayed.map(({ question: q, priority }) => <li key={q.id}><div><span className="small muted">{TAXONOMY[q.domain]} · {q.mode} · {q.sourceType}</span><p>{q.question.split('\n')[0]}</p></div><span className="priority">우선도 <strong>{priority}</strong></span></li>)}</ol> : <Empty>첫 훈련이 다음 복습의 출발점입니다.<br/>오답, 확신이 높았던 오답, 느린 정답을 우선 추천합니다.</Empty>}
    {full && <p className="panel-note">최근 답이 오답 +5 · 확신도 4–5 오답 +7 · 최근 14일의 추가 오답마다 +3 · 최근 답이 느린 정답 +2. 빠른/보통 정답은 큐에서 해제됩니다. 검증된 기억 모형이 아닌 실용적 우선순위입니다.</p>}
  </section>;
}
export function Dashboard({ data, onSave, busy }: { data: StudyData; onSave: Save; busy: boolean }) {
  const dday = daysUntilExam();
  const today = data.responses.filter(r => r.answeredAt !== null && seoulDate(new Date(r.answeredAt)) === seoulDate());
  const weak = groupStats(data, 'domain').filter(g => g.attempted && g.accuracy < 100).slice(0, 4);
  const active = data.sessions.find(s => s.status === 'ACTIVE');
  const history = [...data.sessions].filter(s => s.status === 'COMPLETED').sort((a, b) => b.startedAt - a.startedAt);
  return <>
    <header className="page-heading dashboard-heading"><div><span className="eyebrow">FOCUSED BIOLOGY TRAINING</span><h1>오늘의 훈련, 한 걸음 더.</h1><p>제한된 시간 안에 더 많이, 더 정확하게.</p></div><div className="exam-date"><span>생물학 시험 · {EXAM_DATE.replaceAll('-', '.')}</span><strong>{dday > 0 ? `D−${dday}` : dday === 0 ? 'D-DAY' : `D+${-dday}`}</strong></div></header>
    <section className="training-banner"><div><span className="eyebrow">SCORE PER MINUTE</span><h2>{active ? '진행 중인 훈련을 이어가세요' : '빠른 회상부터, 정확한 판단까지'}</h2><p>{active ? '새로고침해도 기록과 제한 시간은 유지됩니다.' : 'Recall · Interpret · Deep — 오늘의 훈련에 집중하세요.'}</p></div><Link href="/training" className="button banner-button">{active ? '훈련 이어하기' : '훈련 시작하기'}<Icon name="arrow"/></Link></section>
    <section className="today-row" aria-label="오늘의 활동"><div className="today-label"><span className="eyebrow">TODAY</span><strong>{today.length}<small>문항 완료</small></strong></div>{(['RECALL', 'INTERPRET', 'DEEP', 'MIXED'] as const).map(mode => { const count = today.filter(r => data.sessions.find(s => s.id === r.sessionId)?.mode === mode).length; return <div className="today-mode" key={mode}><span>{mode}</span><strong>{count}<small>문항</small></strong></div>; })}</section>
    <div className="section-caption"><h2>누적 훈련 지표</h2><Link href="/analytics" className="text-link">전체 분석 <span aria-hidden="true">↗</span></Link></div>
    <Stats data={data} compact/>
    <div className="two-column"><section className="panel"><div className="section-heading"><div><span className="eyebrow">WEAK AREAS</span><h2>먼저 점검할 영역</h2></div><span className="small muted">정확도 낮은 순</span></div>{weak.length ? <ol className="rank-list">{weak.map((g, i) => <li key={g.label}><span className="rank">{String(i + 1).padStart(2, '0')}</span><div><Link href={`/training?domain=${encodeURIComponent(g.label)}`}>{TAXONOMY[g.label as BiologyDomain]}</Link><p className="small muted">시도 {g.attempted}문항 · 쉬운 오답 {g.easyMisses}</p></div><span className="weak-value">{percent(g.accuracy)}</span></li>)}</ol> : <Empty>아직 확인된 취약 영역이 없습니다.<br/>훈련 후 영역별 정확도를 바탕으로 추천합니다.</Empty>}<p className="panel-note">적은 표본의 정확도는 참고용으로 해석하세요.</p></section><LeakList data={data}/></div>
    <ReviewList data={data}/>
    <section className="panel" data-testid="history"><div className="section-heading"><div><span className="eyebrow">TRAINING LOG</span><h2>최근 훈련</h2></div><span className="small muted">{history.length}회 완료</span></div>{history.length ? <ul className="history-list">{history.slice(0, 10).map(s => { const a = aggregate(data, data.responses.filter(r => r.sessionId === s.id)); return <li key={s.id}><Link href={`/session/${encodeURIComponent(s.id)}`}><span className="history-mode">{s.mode}</span><span>{new Date(s.startedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span><span>{s.questionIds.length}문항 · {a.attempted}시도</span><strong>{a.attempted ? percent(a.accuracy) : '미응답'}</strong><span aria-hidden="true">↗</span></Link></li>; })}</ul> : <Empty>아직 완료한 훈련이 없습니다. 짧은 세션부터 시작하세요.</Empty>}</section>
    <DataTransfer data={data} onSave={onSave} busy={busy}/>
  </>;
}
