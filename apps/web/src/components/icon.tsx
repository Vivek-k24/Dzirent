import type {CSSProperties} from 'react';
const paths:Record<string,string> = {
  search:'m21 21-4.4-4.4M19 10.5a8.5 8.5 0 1 1-17 0 8.5 8.5 0 0 1 17 0Z',
  menu:'M4 6h16M4 12h16M4 18h16', close:'m6 6 12 12M6 18 18 6',
  pin:'M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0ZM15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
  calendar:'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2Z',
  arrow:'M4 12h16m-6-6 6 6-6 6', chevron:'m9 5 7 7-7 7',
  bookmark:'M6 3h12v19l-6-4-6 4V3Z',
  home:'m3 10 9-8 9 8v11h-7v-7h-4v7H3V10Z',
  message:'M21 11.5a9 9 0 0 1-9 9 11 11 0 0 1-4-.8L2 22l1.5-6A9 9 0 1 1 21 11.5Z',
  closet:'M3 3h18v18H3V3Zm9 0v18M8 11v2m8-2v2',
  user:'M20 21a8 8 0 0 0-16 0M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
  filter:'M4 7h16M4 17h16M8 4v6M16 14v6',
  sparkle:'m12 2 2.6 7.4L22 12l-7.4 2.6L12 22l-2.6-7.4L2 12l7.4-2.6L12 2Z',
  hanger:'M9 6a3 3 0 1 1 3 3v3L2 18v3h20v-3l-10-6',
  check:'m5 12 4 4L19 6', plus:'M12 4v16M4 12h16',
  compass:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-6-3-2 5-4 1 2-5 4-1Z',
  more:'M5 12h.01M12 12h.01M19 12h.01',
};
export function Icon({name,className='',style}:{name:string;className?:string;style?:CSSProperties}) {
  return <svg className={'icon '+className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name] || paths.arrow}/></svg>;
}
