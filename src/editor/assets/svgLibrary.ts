/** A bundled library of clean SVG marks commonly used in social-media posts.
 * Each entry renders on a 24×24 viewBox with a consistent visual weight
 * (2px round strokes for outline marks, solid fills for filled marks) so they
 * sit together neatly in the picker and on the canvas. Inserting an item stores
 * it as an SVG asset (see SvgLibraryDialog). */
export type SvgCategory = 'engagement' | 'actions' | 'commerce' | 'content' | 'decor';

export interface SvgLibraryItem {
  id: string;
  /** Translation key under `svgLibrary.items.*` for the display name. */
  nameKey: string;
  /** Section the mark is grouped under in the picker. */
  category: SvgCategory;
  /** Keywords (English) used for client-side search filtering. */
  keywords: string;
  svg: string;
}

/** Display order of the picker sections. */
export const SVG_CATEGORY_ORDER: SvgCategory[] = [
  'engagement',
  'actions',
  'commerce',
  'content',
  'decor',
];

function icon(body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#111827" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
}

function solid(body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="#111827">${body}</svg>`;
}

export const SVG_LIBRARY: SvgLibraryItem[] = [
  // — Engagement ————————————————————————————————————————————————
  {
    id: 'heart',
    nameKey: 'heart',
    category: 'engagement',
    keywords: 'heart like love favourite react',
    svg: solid('<path d="M12 21s-7.5-4.6-10-9.2C.2 8.6 1.8 5 5.2 5c2 0 3.3 1.1 4 2.1.7-1 2-2.1 4-2.1 3.4 0 5 3.6 3.2 6.8C19.5 16.4 12 21 12 21z"/>'),
  },
  {
    id: 'thumbsUp',
    nameKey: 'thumbsUp',
    category: 'engagement',
    keywords: 'like thumbs up approve react vote',
    svg: icon('<path d="M7 10v10H4a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1z"/><path d="M7 10l3.6-6.4a2 2 0 0 1 2.8 1.8V8h5.2a2 2 0 0 1 2 2.4l-1.3 7.2A2 2 0 0 1 19 19H7"/>'),
  },
  {
    id: 'speech',
    nameKey: 'speech',
    category: 'engagement',
    keywords: 'comment chat speech bubble message reply',
    svg: icon('<path d="M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-6.4A8 8 0 1 1 21 12z"/>'),
  },
  {
    id: 'share',
    nameKey: 'share',
    category: 'engagement',
    keywords: 'share send forward network',
    svg: icon('<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.2 10.8l7.6-3.6M8.2 13.2l7.6 3.6"/>'),
  },
  {
    id: 'bookmark',
    nameKey: 'bookmark',
    category: 'engagement',
    keywords: 'bookmark save collection later',
    svg: icon('<path d="M7 4h10a1 1 0 0 1 1 1v15l-6-4-6 4V5a1 1 0 0 1 1-1z"/>'),
  },
  {
    id: 'repost',
    nameKey: 'repost',
    category: 'engagement',
    keywords: 'repost retweet share recycle loop',
    svg: icon('<path d="M17 4l3 3-3 3"/><path d="M20 7H8a4 4 0 0 0-4 4v1"/><path d="M7 20l-3-3 3-3"/><path d="M4 17h12a4 4 0 0 0 4-4v-1"/>'),
  },
  {
    id: 'send',
    nameKey: 'send',
    category: 'engagement',
    keywords: 'send share dm message paper plane',
    svg: icon('<path d="M21 3L10.5 13.5"/><path d="M21 3l-6.4 18-4.1-8.1L2.4 8.8 21 3z"/>'),
  },
  {
    id: 'eye',
    nameKey: 'eye',
    category: 'engagement',
    keywords: 'eye views impressions reach seen',
    svg: icon('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>'),
  },
  {
    id: 'bell',
    nameKey: 'bell',
    category: 'engagement',
    keywords: 'bell notification alert follow subscribe',
    svg: icon('<path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6z"/><path d="M10 20a2 2 0 0 0 4 0"/>'),
  },

  // — Actions ———————————————————————————————————————————————————
  {
    id: 'play',
    nameKey: 'play',
    category: 'actions',
    keywords: 'play video reel button media',
    svg: solid('<circle cx="12" cy="12" r="10" fill="#111827"/><path d="M10 8.5l6 3.5-6 3.5z" fill="#FFFFFF"/>'),
  },
  {
    id: 'plus',
    nameKey: 'plus',
    category: 'actions',
    keywords: 'plus add follow new create',
    svg: icon('<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>'),
  },
  {
    id: 'check',
    nameKey: 'check',
    category: 'actions',
    keywords: 'check tick done success ok',
    svg: icon('<circle cx="12" cy="12" r="9"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/>'),
  },
  {
    id: 'close',
    nameKey: 'close',
    category: 'actions',
    keywords: 'close cancel x remove delete',
    svg: icon('<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>'),
  },
  {
    id: 'link',
    nameKey: 'link',
    category: 'actions',
    keywords: 'link url bio website chain',
    svg: icon('<path d="M9 15l6-6"/><path d="M10.5 6.5l1.8-1.8a4 4 0 0 1 5.7 5.7l-1.8 1.8"/><path d="M13.5 17.5l-1.8 1.8a4 4 0 0 1-5.7-5.7l1.8-1.8"/>'),
  },
  {
    id: 'download',
    nameKey: 'download',
    category: 'actions',
    keywords: 'download save get install',
    svg: icon('<path d="M12 3v12"/><path d="M7 11l5 5 5-5"/><path d="M5 20h14"/>'),
  },
  {
    id: 'search',
    nameKey: 'search',
    category: 'actions',
    keywords: 'search find explore discover',
    svg: icon('<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>'),
  },
  {
    id: 'arrow',
    nameKey: 'arrow',
    category: 'actions',
    keywords: 'arrow direction next swipe',
    svg: icon('<path d="M5 12h14M13 6l6 6-6 6"/>'),
  },

  // — Commerce ——————————————————————————————————————————————————
  {
    id: 'tag',
    nameKey: 'tag',
    category: 'commerce',
    keywords: 'tag sale price discount label offer',
    svg: icon('<path d="M3 12l8.6-8.6a2 2 0 0 1 1.4-.6H20a1 1 0 0 1 1 1v6.9a2 2 0 0 1-.6 1.4L12 21z"/><circle cx="16.5" cy="7.5" r="1.4"/>'),
  },
  {
    id: 'cart',
    nameKey: 'cart',
    category: 'commerce',
    keywords: 'cart shop buy store checkout',
    svg: icon('<circle cx="9.5" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M3 4h2l2.2 11h11l1.8-8H6"/>'),
  },
  {
    id: 'gift',
    nameKey: 'gift',
    category: 'commerce',
    keywords: 'gift present giveaway reward bonus',
    svg: icon('<rect x="4" y="10" width="16" height="10" rx="1"/><path d="M3 7h18v3H3z"/><path d="M12 7v13"/><path d="M12 7C12 7 11 4 9 4a2 2 0 0 0 0 3zM12 7c0 0 1-3 3-3a2 2 0 0 1 0 3z"/>'),
  },
  {
    id: 'percent',
    nameKey: 'percent',
    category: 'commerce',
    keywords: 'percent discount sale deal off',
    svg: icon('<path d="M19 5L5 19"/><circle cx="7.5" cy="7.5" r="2"/><circle cx="16.5" cy="16.5" r="2"/>'),
  },
  {
    id: 'star',
    nameKey: 'star',
    category: 'commerce',
    keywords: 'star rating favourite review',
    svg: solid('<path d="M12 2l2.95 6.18 6.8.78-5 4.62 1.34 6.7L12 17.77 5.91 21.1l1.34-6.7-5-4.62 6.8-.78L12 2z"/>'),
  },
  {
    id: 'crown',
    nameKey: 'crown',
    category: 'commerce',
    keywords: 'crown premium pro vip best',
    svg: icon('<path d="M3 8l4 4 5-7 5 7 4-4-1.6 10.4a1 1 0 0 1-1 .8H5.6a1 1 0 0 1-1-.8z"/>'),
  },
  {
    id: 'verified',
    nameKey: 'verified',
    category: 'commerce',
    keywords: 'verified badge trust check approved',
    svg: solid('<path d="M12 2l2.4 1.8 3-.3 1 2.8 2.5 1.6-.8 2.9.8 2.9-2.5 1.6-1 2.8-3-.3L12 22l-2.4-1.9-3 .3-1-2.8-2.5-1.6.8-2.9-.8-2.9 2.5-1.6 1-2.8 3 .3z" fill="#111827"/><path d="M8.5 12l2.3 2.3 4.7-5" stroke="#FFFFFF" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'),
  },

  // — Content ———————————————————————————————————————————————————
  {
    id: 'camera',
    nameKey: 'camera',
    category: 'content',
    keywords: 'camera photo picture image post',
    svg: icon('<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7l1.5-2.5h5L16 7"/><circle cx="12" cy="13.5" r="3.5"/>'),
  },
  {
    id: 'gallery',
    nameKey: 'gallery',
    category: 'content',
    keywords: 'gallery image photo album carousel',
    svg: icon('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="M4 18l5-5 3 3 2-2 5 5"/>'),
  },
  {
    id: 'video',
    nameKey: 'video',
    category: 'content',
    keywords: 'video reel clip movie record',
    svg: icon('<rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3z"/>'),
  },
  {
    id: 'music',
    nameKey: 'music',
    category: 'content',
    keywords: 'music audio song sound playlist',
    svg: icon('<path d="M9 18V6l11-2v12"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>'),
  },
  {
    id: 'mic',
    nameKey: 'mic',
    category: 'content',
    keywords: 'mic microphone podcast voice live',
    svg: icon('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3"/>'),
  },
  {
    id: 'calendar',
    nameKey: 'calendar',
    category: 'content',
    keywords: 'calendar date event schedule day',
    svg: icon('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/>'),
  },
  {
    id: 'clock',
    nameKey: 'clock',
    category: 'content',
    keywords: 'clock time hour soon countdown',
    svg: icon('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>'),
  },
  {
    id: 'pin',
    nameKey: 'pin',
    category: 'content',
    keywords: 'location map place pin marker',
    svg: icon('<path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>'),
  },
  {
    id: 'globe',
    nameKey: 'globe',
    category: 'content',
    keywords: 'globe world web international language',
    svg: icon('<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c3 3.5 3 14 0 18-3-4-3-14 0-18z"/>'),
  },
  {
    id: 'mail',
    nameKey: 'mail',
    category: 'content',
    keywords: 'mail email newsletter contact message',
    svg: icon('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M4 7l8 6 8-6"/>'),
  },
  {
    id: 'phone',
    nameKey: 'phone',
    category: 'content',
    keywords: 'phone call contact mobile',
    svg: icon('<path d="M5 4h3l2 5-2.5 1.5a11 11 0 0 0 5 5L14 14l5 2v3a1 1 0 0 1-1 1A16 16 0 0 1 3 5a1 1 0 0 1 1-1z"/>'),
  },

  // — Decoration ————————————————————————————————————————————————
  {
    id: 'sparkle',
    nameKey: 'sparkle',
    category: 'decor',
    keywords: 'sparkle ai shine new magic',
    svg: solid('<path d="M12 2l1.6 6.4L20 10l-6.4 1.6L12 18l-1.6-6.4L4 10l6.4-1.6z"/><path d="M19 3l.7 2.3L22 6l-2.3.7L19 9l-.7-2.3L16 6l2.3-.7z"/>'),
  },
  {
    id: 'bolt',
    nameKey: 'bolt',
    category: 'decor',
    keywords: 'bolt lightning flash energy fast',
    svg: solid('<path d="M13 2L4 14h6l-1 8 9-12h-6z"/>'),
  },
  {
    id: 'fire',
    nameKey: 'fire',
    category: 'decor',
    keywords: 'fire flame hot trending viral',
    svg: solid('<path d="M12 2c1.2 3.2 4.4 4.6 4.4 8.8a4.4 4.4 0 0 1-8.8.2c0-1.5.6-2.6 1.3-3.5.3 1 1.1 1.6 1.9 1.6 0-2.4.3-4.7 1.2-7.1z"/>'),
  },
  {
    id: 'sun',
    nameKey: 'sun',
    category: 'decor',
    keywords: 'sun summer weather bright day',
    svg: icon('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19"/>'),
  },
  {
    id: 'hashtag',
    nameKey: 'hashtag',
    category: 'decor',
    keywords: 'hashtag tag trend social',
    svg: icon('<path d="M5 9h14M5 15h14M10 4l-2 16M16 4l-2 16"/>'),
  },
  {
    id: 'quote',
    nameKey: 'quote',
    category: 'decor',
    keywords: 'quote testimonial review caption',
    svg: solid('<path d="M7 6h4v6a4 4 0 0 1-4 4v-2a2 2 0 0 0 2-2H7zM15 6h4v6a4 4 0 0 1-4 4v-2a2 2 0 0 0 2-2h-2z"/>'),
  },
  {
    id: 'trophy',
    nameKey: 'trophy',
    category: 'decor',
    keywords: 'trophy win award winner prize contest',
    svg: icon('<path d="M7 4h10v4a5 5 0 0 1-10 0z"/><path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3"/><path d="M12 13v4M9 21h6M10 17h4"/>'),
  },
];
