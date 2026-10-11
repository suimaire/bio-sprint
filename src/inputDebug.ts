// Opt-in, local development only. Never retain answer text or arbitrary typed keys.
export const inputDebug = import.meta.env.DEV && new URLSearchParams(location.search).get('inputDebug') === '1';
export const safeKey = (key: string) => /^(?:[a-eA-E1-5]|ArrowLeft|ArrowRight)$/.test(key) ? key : 'other';
export const safeCode = (code: string) => /^(?:Key[A-E]|Digit[1-5]|Numpad[1-5]|ArrowLeft|ArrowRight)$/.test(code) ? code : code ? 'other' : 'unavailable';
