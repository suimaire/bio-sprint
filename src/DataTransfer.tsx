import { useState } from 'react';
import { emptyData, type StudyData } from './model';
import { mergeStudyData, parseJSON, validateQuestionBank, validateStudyData } from './validation';
import { isQFPackage, validateQFPackage } from './qfImport';
import { downloadJSON } from './storage';
import { type Save } from './ui';

function additions(before: StudyData, after: StudyData) {
  return '문제 ' + (after.questions.length - before.questions.length) + '개 · 세션 ' + (after.sessions.length - before.sessions.length) + '개 · 응답 ' + (after.responses.length - before.responses.length) + '개' +
    ' · QF 세트 ' + ((after.qfPackages?.length ?? 0) - (before.qfPackages?.length ?? 0)) + '개 · QF 풀이 ' + ((after.qfSessions?.length ?? 0) - (before.qfSessions?.length ?? 0)) + '회 · QF 응답 ' + ((after.qfResponses?.length ?? 0) - (before.qfResponses?.length ?? 0)) + '개 추가';
}
export function DataTransfer({ data, onSave, bank = false, qf = false, busy }: { data: StudyData; onSave: Save; bank?: boolean; qf?: boolean; busy: boolean }) {
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
      if (file.size > 50 * 1024 * 1024) throw new Error('파일은 50 MB 이내로 가져와 주세요.');
      const json = parseJSON(await file.text());
      let candidate: StudyData;
      let label = '';
      if (isQFPackage(json)) {
        const p = validateQFPackage(json);
        candidate = { ...emptyData(), qfPackages: [p] };
        label = (p.preset === 'daily15' ? 'DAILY-15' : p.preset.toUpperCase()) + ' · ' + p.questions.length + '문항 · AI_REVIEWED · ' + p.run_id + '\n' + Object.entries(p.format_counts).map(([k,v]) => k + ' ' + v).join(' · ') + '\n' + (p.preset === 'daily15' ? '예상 시간 30분 (1800초)' : '보관 전용 · 이 세트의 풀이 모드는 지원하지 않습니다.') + '\n';
      } else {
        if (qf) throw new Error('biosprint-export-1.0.0 QF 패키지 파일을 선택해 주세요. 학습 백업은 Import Study Data에서 가져옵니다.');
        candidate = bank ? { ...emptyData(), questions: validateQuestionBank(json) } : validateStudyData(json);
      }
      const merged = mergeStudyData(data, candidate);
      setIncoming(candidate); setSummary(label + additions(data, merged.data));
    } catch (e) { setError(String(e instanceof Error ? e.message : e)); }
    finally { setReading(false); }
  }
  async function apply() {
    if (!incoming) return;
    try {
      const result = mergeStudyData(data, incoming);
      if (await onSave(result.data)) { setMessage('가져오기 완료: ' + additions(data, result.data) + '. 기존 기록은 보존했습니다.'); setIncoming(null); }
    } catch (e) { setError((e as Error).message); }
  }
  return <section className="transfer" aria-label={qf ? 'QF 패키지 가져오기' : bank ? '문제 데이터 관리' : '학습 데이터 백업'}>
    <div className="transfer-row">
      <div><strong>{qf ? 'Question Factory JSON 가져오기' : bank ? 'JSON으로 문제 관리' : '학습 기록은 이 브라우저에 저장됩니다'}</strong><p className="muted small">{qf ? '이 기기의 파일을 직접 읽습니다. 서버 업로드 없이 원본과 출처를 보존합니다.' : bank ? '기존 BIO SPRINT 배열과 QF v1 패키지를 지원합니다. QF 세트는 전용 화면에서 풉니다.' : 'Study Data 백업에 QF 원본 세트·풀이·자기 채점이 모두 포함됩니다.'}</p></div>
      <div className="button-row">
        {!qf && <button className="button secondary" disabled={busy} onClick={() => downloadJSON(bank ? data.questions : data, 'bio-sprint-' + (bank ? 'questions' : 'study') + '-' + new Date().toISOString().slice(0, 10) + '.json')}>{bank ? 'Export Question Bank' : 'Export Study Data'}</button>}
        <label className={`button secondary file-button ${busy || reading ? 'disabled' : ''}`}>{qf ? 'QF JSON 가져오기' : bank ? 'Import Question Bank' : 'Import Study Data'}<input type="file" accept=".json,application/json" aria-label={qf ? 'QF JSON 파일' : bank ? '문제 JSON 파일' : '학습 데이터 JSON 파일'} disabled={busy || reading} onChange={e => { void read(e.target.files?.[0]); e.target.value = ''; }}/></label>
      </div>
    </div>
    {bank && !!data.qfPackages?.length && <p className="small muted">Question Bank 내보내기는 기존 선택형 문제용입니다. QF 세트와 풀이 기록은 대시보드의 Export Study Data로 백업하세요.</p>}
    {error && <pre className="alert" role="alert">{error}</pre>}
    {incoming && <div className="import-preview"><div><strong>가져오기 미리보기</strong><p className="qf-preserve">{summary}</p><p className="small muted">동일한 레코드는 중복 저장하지 않습니다. 같은 ID의 내용 또는 digest가 다르면 전체 가져오기를 거절합니다.</p></div><div className="button-row"><button className="button primary" onClick={() => void apply()} disabled={busy}>가져오기 적용</button><button className="button secondary" onClick={() => setIncoming(null)} disabled={busy}>취소</button></div></div>}
    {message && <p className="success-message" role="status">{message}</p>}
  </section>;
}
