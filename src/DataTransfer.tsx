import { useState } from 'react';
import { emptyData, type StudyData } from './model';
import { mergeStudyData, parseJSON, validateQuestionBank, validateStudyData } from './validation';
import { downloadJSON } from './storage';
import { type Save } from './ui';

export function DataTransfer({ data, onSave, bank = false, busy }: { data: StudyData; onSave: Save; bank?: boolean; busy: boolean }) {
  const [incoming, setIncoming] = useState<StudyData | null>(null);
  const [summary, setSummary] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [reading, setReading] = useState(false);
  async function read(file?: File) {
    setError(''); setMessage(''); setIncoming(null);
    if (!file) return;
    setReading(true);
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error('파일은 20 MB 이하로 나누어 가져와 주세요.');
      const json = parseJSON(await file.text());
      const candidate = bank ? { ...emptyData(), questions: validateQuestionBank(json) } : validateStudyData(json);
      const merged = mergeStudyData(data, candidate);
      setIncoming(candidate);
      setSummary(`문제 ${merged.summary.questions}개 · 세션 ${merged.summary.sessions}개 · 응답 ${merged.summary.responses}개 추가`);
    } catch (e) { setError(String(e instanceof Error ? e.message : e)); }
    finally { setReading(false); }
  }
  async function apply() {
    if (!incoming) return;
    try {
      const result = mergeStudyData(data, incoming);
      if (await onSave(result.data)) {
        setMessage(`가져오기 완료: 문제 ${result.summary.questions}개 · 세션 ${result.summary.sessions}개 · 응답 ${result.summary.responses}개 추가. 기존 기록은 보존했습니다.`);
        setIncoming(null);
      }
    } catch (e) { setError((e as Error).message); }
  }
  return <section className="transfer" aria-label={bank ? '문제 데이터 관리' : '학습 데이터 백업'}>
    <div className="transfer-row">
      <div><strong>{bank ? 'JSON으로 문제 관리' : '학습 기록은 이 브라우저에 저장됩니다'}</strong><p className="muted small">{bank ? '새 문제는 새 ID로 추가합니다. 상태는 자동 승격되지 않습니다.' : '다른 기기로 이동하거나 브라우저 데이터를 지우기 전에 백업하세요.'}</p></div>
      <div className="button-row">
        <button className="button secondary" disabled={busy} onClick={() => downloadJSON(bank ? data.questions : data, `bio-sprint-${bank ? 'questions' : 'study'}-${new Date().toISOString().slice(0, 10)}.json`)}>{bank ? 'Export Question Bank' : 'Export Study Data'}</button>
        <label className={`button secondary file-button ${busy || reading ? 'disabled' : ''}`}>{bank ? 'Import Question Bank' : 'Import Study Data'}<input type="file" accept=".json,application/json" aria-label={bank ? '문제 JSON 파일' : '학습 데이터 JSON 파일'} disabled={busy || reading} onChange={e => { void read(e.target.files?.[0]); e.target.value = ''; }}/></label>
      </div>
    </div>
    {error && <pre className="alert" role="alert">{error}</pre>}
    {incoming && <div className="import-preview"><div><strong>가져오기 미리보기</strong><p>{summary}</p><p className="small muted">동일한 레코드는 중복 저장하지 않습니다. 내용이 다른 동일 ID는 거부합니다.</p></div><div className="button-row"><button className="button primary" onClick={() => void apply()} disabled={busy}>가져오기 적용</button><button className="button secondary" onClick={() => setIncoming(null)} disabled={busy}>취소</button></div></div>}
    {message && <p className="success-message" role="status">{message}</p>}
  </section>;
}
