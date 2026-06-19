/** A small bundled library of clean, single-path-ish SVG marks commonly used in
 * social-media posts. Each entry uses `currentColor` so it picks up a colour at
 * render time, and a 24×24 viewBox for consistent sizing. Inserting an item
 * stores it as an SVG asset (see SvgLibraryDialog). */
export interface SvgLibraryItem {
  id: string;
  /** Translation key under `svgLibrary.items.*` for the display name. */
  nameKey: string;
  /** Keywords (English) used for client-side search filtering. */
  keywords: string;
  svg: string;
}

function icon(body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#111827" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
}

function solid(body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="#111827">${body}</svg>`;
}

export const SVG_LIBRARY: SvgLibraryItem[] = [
  {
    id: 'heart',
    nameKey: 'heart',
    keywords: 'heart like love favourite',
    svg: solid('<path d="M12 21s-7.5-4.6-10-9.2C.2 8.6 1.8 5 5.2 5c2 0 3.3 1.1 4 2.1.7-1 2-2.1 4-2.1 3.4 0 5 3.6 3.2 6.8C19.5 16.4 12 21 12 21z"/>'),
  },
  {
    id: 'star',
    nameKey: 'star',
    keywords: 'star rating favourite review',
    svg: solid('<path d="M12 2l2.95 6.18 6.8.78-5 4.62 1.34 6.7L12 17.77 5.91 21.1l1.34-6.7-5-4.62 6.8-.78L12 2z"/>'),
  },
  {
    id: 'pin',
    nameKey: 'pin',
    keywords: 'location map place pin marker',
    svg: icon('<path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>'),
  },
  {
    id: 'play',
    nameKey: 'play',
    keywords: 'play video reel button media',
    svg: solid('<circle cx="12" cy="12" r="10" fill="#111827"/><path d="M10 8.5l6 3.5-6 3.5z" fill="#FFFFFF"/>'),
  },
  {
    id: 'check',
    nameKey: 'check',
    keywords: 'check tick done success ok',
    svg: icon('<circle cx="12" cy="12" r="9"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/>'),
  },
  {
    id: 'speech',
    nameKey: 'speech',
    keywords: 'comment chat speech bubble message',
    svg: icon('<path d="M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-6.4A8 8 0 1 1 21 12z"/>'),
  },
  {
    id: 'sparkle',
    nameKey: 'sparkle',
    keywords: 'sparkle ai shine new magic',
    svg: solid('<path d="M12 2l1.6 6.4L20 10l-6.4 1.6L12 18l-1.6-6.4L4 10l6.4-1.6z"/><path d="M19 3l.7 2.3L22 6l-2.3.7L19 9l-.7-2.3L16 6l2.3-.7z"/>'),
  },
  {
    id: 'bolt',
    nameKey: 'bolt',
    keywords: 'bolt lightning flash energy fast',
    svg: solid('<path d="M13 2L4 14h6l-1 8 9-12h-6z"/>'),
  },
  {
    id: 'tag',
    nameKey: 'tag',
    keywords: 'tag sale price discount label offer',
    svg: icon('<path d="M3 12l8.6-8.6a2 2 0 0 1 1.4-.6H20a1 1 0 0 1 1 1v6.9a2 2 0 0 1-.6 1.4L12 21z"/><circle cx="16.5" cy="7.5" r="1.4"/>'),
  },
  {
    id: 'hashtag',
    nameKey: 'hashtag',
    keywords: 'hashtag tag trend social',
    svg: icon('<path d="M5 9h14M5 15h14M10 4l-2 16M16 4l-2 16"/>'),
  },
  {
    id: 'camera',
    nameKey: 'camera',
    keywords: 'camera photo picture image',
    svg: icon('<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7l1.5-2.5h5L16 7"/><circle cx="12" cy="13.5" r="3.5"/>'),
  },
  {
    id: 'sun',
    nameKey: 'sun',
    keywords: 'sun summer weather bright',
    svg: icon('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19"/>'),
  },
  {
    id: 'arrow',
    nameKey: 'arrow',
    keywords: 'arrow direction next swipe',
    svg: icon('<path d="M5 12h14M13 6l6 6-6 6"/>'),
  },
  {
    id: 'verified',
    nameKey: 'verified',
    keywords: 'verified badge trust check approved',
    svg: solid('<path d="M12 2l2.4 1.8 3-.3 1 2.8 2.5 1.6-.8 2.9.8 2.9-2.5 1.6-1 2.8-3-.3L12 22l-2.4-1.9-3 .3-1-2.8-2.5-1.6.8-2.9-.8-2.9 2.5-1.6 1-2.8 3 .3z" fill="#111827"/><path d="M8.5 12l2.3 2.3 4.7-5" stroke="#FFFFFF" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'),
  },
];
