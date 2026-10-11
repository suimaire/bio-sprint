import { describe, expect, it } from 'vitest';
import { fixture } from '../tests/fixtures/qf';
import { emptyData } from './model';
import { validateQFPackage } from './qfImport';
import { actQF, startQF, summarizeQF, type QFAction } from './qfEngine';
import { validateStudyData } from './validation';
import { createSession } from './sessionEngine';

const start = () => startQF({ ...emptyData(), qfPackages: [validateQFPackage(fixture())] }, 'test-run', 1000, 'pause');
// These actions deliberately exercise the engine before the new API exists.
const pause = { type: 'pause' } as QFAction, resume = { type: 'resume' } as QFAction;

describe('DAILY-15 pause lifecycle', () => {
  it('freezes at 25 minutes, survives reload, and counts only eight active minutes after resume', () => {
    let d = actQF(start(), 'pause', { type: 'choice', value: 'A' }, 2000);
    d = actQF(d, 'pause', { type: 'confidence', value: 4 }, 3000);
    d = actQF(d, 'pause', pause, 301000);
    expect(d.qfSessions![0].status).toBe('PAUSED');
    expect(d.qfResponses![0]).toMatchObject({ responseTimeMs: 300000, lastShownAt: null, visitCount: 1, answerChangeCount: 0 });
    d = validateStudyData(JSON.parse(JSON.stringify(d)));
    expect(actQF(d, 'pause', { type: 'expire' }, 9001000)).toBe(d);
    d = actQF(d, 'pause', resume, 901000);
    d = actQF(d, 'pause', { type: 'finish' }, 1081000);
    expect(d.qfResponses![0]).toMatchObject({ selectedOption: 'A', confidence: 4, responseTimeMs: 480000, visitCount: 1, answerChangeCount: 0 });
    expect(d.qfSessions![0]).toMatchObject({ status: 'COMPLETED', pausedDurationMs: 600000, endedAt: 1081000 });
    expect(validateStudyData(d)).toEqual(d);
  });
  it('accumulates two pauses and expires exactly after thirty active minutes', () => {
    let d = actQF(start(), 'pause', pause, 301000);
    d = actQF(d, 'pause', resume, 901000);
    d = actQF(d, 'pause', pause, 1081000);
    d = actQF(d, 'pause', resume, 1201000);
    d = actQF(d, 'pause', { type: 'expire' }, 9999999);
    expect(d.qfSessions![0]).toMatchObject({ status: 'COMPLETED', endedAt: 2521000, pausedDurationMs: 720000, endReason: 'EXPIRED' });
    expect(d.qfResponses![0]).toMatchObject({ responseTimeMs: 1800000, visitCount: 1 });
    expect(validateStudyData(d)).toEqual(d);
  });
  it('blocks all paused inputs and concurrent sessions without counting paused work as completed', () => {
    const d = actQF(start(), 'pause', pause, 2000);
    for (const action of [{ type: 'choice', value: 'A' }, { type: 'text', value: 'answer' }, { type: 'confidence', value: 3 }, { type: 'triage', value: 'LATER' }, { type: 'navigate', index: 1 }, { type: 'finish' }] as QFAction[]) {
      expect(() => actQF(d, 'pause', action, 3000)).toThrow();
    }
    expect(summarizeQF(d).total).toBe(0);
    expect(() => startQF(d, 'test-run', 3000, 'another')).toThrow(/진행 중/);
    expect(() => createSession(d, { mode: 'REAL_EXAM', count: 1, timeLimitSec: 60, includeDrafts: true }, 3000, 'exam')).toThrow(/진행 중/);
  });
  it('preserves old completed records and rejects corrupt pause metadata', () => {
    const old = actQF(start(), 'pause', { type: 'finish' }, 2000);
    expect(validateStudyData(structuredClone(old))).toEqual(old);
    const paused = actQF(start(), 'pause', pause, 301000);
    for (const patch of [{ pausedAt: null }, { pausedDurationMs: -1 }, { pausedDurationMs: 400000 }, { pausedAt: 300999 }]) {
      const bad = structuredClone(paused); Object.assign(bad.qfSessions![0], patch);
      expect(() => validateStudyData(bad)).toThrow();
    }
  });
});
