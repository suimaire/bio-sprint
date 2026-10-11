import type { ReactNode } from 'react';
import type { QFQuestion } from './qfModel';

export function QFPrompt({ q, wrapInk = (_, content) => content }: { q: QFQuestion; wrapInk?: (surface: 'stem' | 'statement', content: ReactNode) => ReactNode }) {
  return <><p className="small muted">Stage {q.stage} · {q.level} · {q.macro_domain} · {q.topic}<br/>지식 깊이 {q.knowledge_depth} · 추론 부담 {q.reasoning_load} · 언어 부담 {q.language_load}</p>
    <div className="tags"><span className="badge">{q.format}</span><span className="badge qf-review-badge">AI_REVIEWED</span>{q.hypothetical_context && <span className="badge">학습용 가정</span>}{q.synthetic_data && <span className="badge">합성 자료</span>}</div>
    {wrapInk('stem', <h2 id="qf-question-heading" tabIndex={-1} className="question-text">{q.stem}</h2>)}
    {q.format === 'COMBINATION' && wrapInk('statement', <dl className="qf-statements">{Object.entries(q.statements!).map(([key, statement]) => <div key={key}><dt>{key}</dt><dd>{statement}</dd></div>)}</dl>)}
  </>;
}
