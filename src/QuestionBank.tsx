import { useState } from 'react';
import { MODES, SOURCES, TAXONOMY, type StudyData } from './model';
import { DataTransfer } from './DataTransfer';
import { type Save, Empty } from './ui';

export function QuestionBank({ data, onSave, busy }: { data: StudyData; onSave: Save; busy: boolean }) {
  const [query, setQuery] = useState('');
  const [domain, setDomain] = useState('');
  const [mode, setMode] = useState('');
  const [source, setSource] = useState('');
  const rows = data.questions.filter(q => (!domain || q.domain === domain) && (!mode || q.mode === mode) && (!source || q.sourceType === source) && `${q.id} ${q.question} ${q.subdomain} ${q.tags.join(' ')}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  return <><header className="page-heading"><div><span className="eyebrow">QUESTION LIBRARY</span><h1>문제 은행</h1><p>문항의 출처 상태를 확인하고, 필요한 문제만 훈련하세요.</p></div><span className="total-count">{data.questions.length}<small>전체 문항</small></span></header>
    <aside className="fixture-notice"><span className="badge warning">개발용 FIXTURE</span><p>기본 제공 27문항은 동작 확인용이며 과학적 검증을 거치지 않았습니다. 모두 DRAFT로 유지되며 기본 훈련에서 제외됩니다.</p></aside>
    <div className="bank-filters"><label className="search-field"><span>문제 검색</span><input aria-label="문제 검색" value={query} onChange={e => setQuery(e.target.value)} placeholder="문제, 세부 영역, 태그 또는 ID" type="search"/></label><label>영역<select value={domain} onChange={e => setDomain(e.target.value)}><option value="">전체 영역</option>{Object.entries(TAXONOMY).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label><label>모드<select value={mode} onChange={e => setMode(e.target.value)}><option value="">전체 모드</option>{MODES.map(m => <option key={m}>{m}</option>)}</select></label><label>출처 상태<select value={source} onChange={e => setSource(e.target.value)}><option value="">전체 상태</option>{SOURCES.map(s => <option key={s}>{s}</option>)}</select></label></div>
    <div className="section-caption"><h2>{rows.length}개 문제</h2><span className="small muted">항목을 펼쳐 정답과 해설 확인</span></div>
    <section className="question-list">{rows.length ? rows.map(q => <details key={q.id}><summary><div className="question-index">{q.mode}<small>{q.targetTimeSec}초 · 난이도 {q.difficulty}</small></div><div className="bank-question"><span className="small muted">{TAXONOMY[q.domain]} / {q.subdomain}</span><strong>{q.question.split('\n')[0]}</strong><small className="muted">{q.id}</small></div><span className={`badge ${q.sourceType === 'DRAFT' ? 'warning' : ''}`}>{q.sourceType}{q.fixture ? ' · 개발용' : ''}</span></summary><div className="question-detail"><p className="question-text">{q.question}</p><ol>{q.choices.map((c, i) => <li key={i}>{c}{i === q.answer && <strong> — 정답</strong>}</li>)}</ol><p>{q.explanation}</p><div className="tags">{q.tags.map((tag, i) => <span className="badge" key={`${tag}-${i}`}>{tag}</span>)}</div></div></details>) : <Empty>조건에 맞는 문제가 없습니다.</Empty>}</section>
    <DataTransfer bank data={data} onSave={onSave} busy={busy}/>
    <p className="small muted">VERIFIED: 출처와 정답 검증 완료 · REVIEWED: 사람이 검토함 · DRAFT: 검토 전. 상태는 문제 제공자가 지정하며 앱이 진위를 보증하지 않습니다.</p>
  </>;
}
