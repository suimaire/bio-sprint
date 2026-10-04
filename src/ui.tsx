import { type ReactNode } from 'react';
import { type StudyData } from './model';

export type Save = (data: StudyData, expectedData?: StudyData) => Promise<boolean>;
export const percent = (n: number) => `${Math.round(n)}%`;
export const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}초`;
export function clockText(ms: number) {
  const sec = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
}
// Project Pages serves one document; hash routes keep every navigation on it.
const hashRouting = import.meta.env.BASE_URL !== '/';
export function routePath() { return hashRouting ? (location.hash.startsWith('#/') ? location.hash.slice(1) : '/') : location.pathname + location.search; }
function routeHref(path: string) { return hashRouting ? `${import.meta.env.BASE_URL}#${path}` : path; }
export function go(path: string) { history.pushState(null, '', routeHref(path)); window.dispatchEvent(new PopStateEvent('popstate')); window.scrollTo(0, 0); }
export function Link({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return <a className={className} href={routeHref(href)} onClick={e => { if (e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) { e.preventDefault(); go(href); } }}>{children}</a>;
}
export function Icon({ name }: { name: 'grid' | 'timer' | 'bank' | 'review' | 'arrow' | 'leaf' }) {
  const paths = {
    grid: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
    timer: 'M9 2h6 M12 5v2 M18 6l2 2 M12 10v5l3 2 M21 14a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
    bank: 'M4 3h6v18H4z M10 3h5v18h-5z M16 4l4-1 3 17-4 1z',
    review: 'M4 9a8 8 0 1 1 0 7 M4 3v6h6 M12 8v5l3 2',
    arrow: 'M4 12h15 M13 6l6 6-6 6',
    leaf: 'M20 3C7 2 2 8 5 15s14 5 15-12z M4 21L15 9 M9 16v-6 M9 16h7',
  };
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]}/></svg>;
}
export function Empty({ children }: { children: ReactNode }) { return <p className="empty">{children}</p>; }
