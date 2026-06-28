import {
  CURRENT_SCHEMA_VERSION,
  type CalqoArtboard,
  type CalqoLayer,
  type CalqoProject,
  type Fill,
} from './schema';
import type { ArtboardPresetId } from './presets';

/** Bundled editable alpha sample. Offered from the empty state and only
 * persisted once the user opens it. It ships as a three-format campaign —
 * square, story and landscape — sharing one design and multilingual copy, so it
 * doubles as a live demo of Calqo's two differentiators: multiple workspaces
 * (the "see all" overview) and per-locale content with instant translation. */

const FONT = 'Inter';

/** Per-locale text (en / fr / tr) used by every copy layer. */
type Loc = { en: string; fr: string; tr: string };

interface TextStyleOverrides {
  fontSize: number;
  fontWeight?: number;
  color?: string;
  align?: 'left' | 'center' | 'right' | 'justify';
  lineHeight?: number;
  letterSpacing?: number;
}

function style(over: TextStyleOverrides) {
  return {
    fontFamily: FONT,
    fontSize: over.fontSize,
    fontWeight: over.fontWeight ?? 600,
    fontStyle: 'normal' as const,
    textDecoration: 'none' as const,
    color: over.color ?? '#FFFFFF',
    align: over.align ?? 'left',
    lineHeight: over.lineHeight ?? 1.1,
    letterSpacing: over.letterSpacing ?? 0,
  };
}

const base = { rotation: 0, opacity: 1, visible: true, locked: false } as const;

function text(
  id: string,
  name: string,
  box: [number, number, number, number],
  value: Loc,
  over: TextStyleOverrides,
): CalqoLayer {
  return {
    id,
    name,
    type: 'text',
    ...base,
    x: box[0],
    y: box[1],
    w: box[2],
    h: box[3],
    text: value,
    style: style(over),
  };
}

function rect(
  id: string,
  name: string,
  box: [number, number, number, number],
  fill: Fill,
  cornerRadius = 0,
  opacity = 1,
): CalqoLayer {
  return {
    id,
    name,
    type: 'shape',
    shape: 'rect',
    ...base,
    opacity,
    x: box[0],
    y: box[1],
    w: box[2],
    h: box[3],
    fill,
    cornerRadius,
  };
}

function oval(
  id: string,
  name: string,
  box: [number, number, number, number],
  fill: Fill,
  opacity = 1,
): CalqoLayer {
  return {
    id,
    name,
    type: 'shape',
    shape: 'ellipse',
    ...base,
    opacity,
    x: box[0],
    y: box[1],
    w: box[2],
    h: box[3],
    fill,
  };
}

// Shared brand palette.
const INK = '#0B1233';
const AMBER = '#F5B833';
const SOFT = '#C9D6FF';
const WHITE = '#FFFFFF';

/** Radial glow fill that fades from `color` to transparent. */
function glow(color: string): { type: 'radial'; stops: { offset: number; color: string }[] } {
  return { type: 'radial', stops: [
    { offset: 0, color },
    { offset: 1, color: color.replace(/[\d.]+\)$/, '0)') },
  ] };
}

const AMBER_GLOW = glow('rgba(245,184,51,0.50)');
const CYAN_GLOW = glow('rgba(56,189,248,0.42)');

// Shared multilingual copy.
const EYEBROW: Loc = { en: 'PUBLIC ALPHA', fr: 'ALPHA PUBLIQUE', tr: 'AÇIK ALFA' };
const HEADLINE: Loc = {
  en: 'Make the post.\nKeep the layers.',
  fr: 'Créez le post.\nGardez les calques.',
  tr: 'Gönderiyi yap.\nKatmanları koru.',
};
const BODY: Loc = {
  en: 'One design, every format — and every word translated to English, French & Turkish in a click.',
  fr: 'Un seul design, tous les formats — et chaque mot traduit en anglais, français et turc en un clic.',
  tr: 'Tek tasarım, her format — ve her kelime tek tıkla İngilizce, Fransızca ve Türkçeye çevrilir.',
};
const CTA: Loc = { en: 'Open the sample →', fr: 'Ouvrir l’exemple →', tr: 'Örneği aç →' };
const FOOTER: Loc = {
  en: 'Calqo · local-first social-visual maker',
  fr: 'Calqo · éditeur visuel local-first',
  tr: 'Calqo · yerel öncelikli görsel aracı',
};

interface ArtboardLook {
  id: string;
  name: string;
  preset: ArtboardPresetId;
  width: number;
  height: number;
  angle: number;
}

/** Build one campaign artboard with the shared brand applied to its size. */
function campaignArtboard(look: ArtboardLook, layers: CalqoLayer[]): CalqoArtboard {
  return {
    id: look.id,
    name: look.name,
    preset: look.preset,
    width: look.width,
    height: look.height,
    background: {
      type: 'linear',
      angle: look.angle,
      stops: [
        { offset: 0, color: INK },
        { offset: 0.52, color: '#2A1A63' },
        { offset: 1, color: '#123C8C' },
      ],
    },
    layers,
  };
}

export function createSampleProject(now = new Date().toISOString()): CalqoProject {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: 'proj_alpha_sample',
    name: 'Calqo alpha sample',
    createdAt: now,
    updatedAt: now,
    contentLocales: ['en', 'fr', 'tr'],
    activeContentLocale: 'en',
    palette: [INK, WHITE, AMBER, '#38BDF8', '#FB7185', '#2A1A63'],
    assets: [],
    glossary: [
      { source: 'Calqo', mode: 'do-not-translate', notes: 'Product name.' },
    ],
    artboards: [
      // ── Square (Instagram 1080×1080) ────────────────────────────────────
      campaignArtboard(
        { id: 'ab_alpha_square', name: 'Instagram square', preset: 'ig-square', width: 1080, height: 1080, angle: 145 },
        [
          oval('sq_glow_a', 'Amber glow', [440, 0, 640, 640], AMBER_GLOW),
          oval('sq_glow_b', 'Cyan glow', [0, 440, 640, 640], CYAN_GLOW),
          rect('sq_eyebrow', 'Eyebrow pill', [96, 104, 346, 58], { type: 'solid', color: AMBER }, 29),
          text('sq_eyebrow_text', 'Eyebrow', [96, 119, 346, 32], EYEBROW, { fontSize: 23, fontWeight: 800, color: INK, align: 'center', letterSpacing: 1.5 }),
          text('sq_headline', 'Headline', [96, 208, 660, 300], HEADLINE, { fontSize: 88, fontWeight: 800, color: WHITE, lineHeight: 1.02, letterSpacing: -1.5 }),
          text('sq_body', 'Body copy', [98, 560, 600, 160], BODY, { fontSize: 31, fontWeight: 500, color: SOFT, lineHeight: 1.25 }),
          rect('sq_cta', 'CTA card', [96, 838, 470, 108], { type: 'solid', color: WHITE }, 54),
          text('sq_cta_text', 'CTA text', [96, 872, 470, 46], CTA, { fontSize: 33, fontWeight: 700, color: INK, align: 'center' }),
          text('sq_footer', 'Footer', [98, 988, 640, 30], FOOTER, { fontSize: 20, fontWeight: 500, color: 'rgba(255,255,255,0.55)' }),
        ],
      ),
      // ── Story / Reel cover (1080×1920) ──────────────────────────────────
      campaignArtboard(
        { id: 'ab_alpha_story', name: 'Story / Reel cover', preset: 'story', width: 1080, height: 1920, angle: 160 },
        [
          oval('st_glow_a', 'Amber glow', [380, 0, 700, 700], AMBER_GLOW),
          oval('st_glow_b', 'Cyan glow', [0, 1220, 700, 700], CYAN_GLOW),
          rect('st_eyebrow', 'Eyebrow pill', [110, 300, 360, 62], { type: 'solid', color: AMBER }, 31),
          text('st_eyebrow_text', 'Eyebrow', [110, 316, 360, 34], EYEBROW, { fontSize: 24, fontWeight: 800, color: INK, align: 'center', letterSpacing: 1.5 }),
          text('st_headline', 'Headline', [110, 426, 880, 540], HEADLINE, { fontSize: 118, fontWeight: 800, color: WHITE, lineHeight: 1.02, letterSpacing: -2 }),
          text('st_body', 'Body copy', [112, 992, 820, 240], BODY, { fontSize: 40, fontWeight: 500, color: SOFT, lineHeight: 1.28 }),
          rect('st_cta', 'CTA card', [110, 1632, 580, 130], { type: 'solid', color: WHITE }, 65),
          text('st_cta_text', 'CTA text', [110, 1674, 580, 52], CTA, { fontSize: 42, fontWeight: 700, color: INK, align: 'center' }),
          text('st_footer', 'Footer', [112, 1822, 860, 36], FOOTER, { fontSize: 24, fontWeight: 500, color: 'rgba(255,255,255,0.55)' }),
        ],
      ),
      // ── X / Twitter post (1600×900) ─────────────────────────────────────
      campaignArtboard(
        { id: 'ab_alpha_post', name: 'X / Twitter post', preset: 'x-post', width: 1600, height: 900, angle: 120 },
        [
          oval('xp_glow_a', 'Amber glow', [900, 0, 700, 700], AMBER_GLOW),
          oval('xp_glow_b', 'Cyan glow', [0, 260, 640, 640], CYAN_GLOW),
          rect('xp_eyebrow', 'Eyebrow pill', [110, 132, 346, 58], { type: 'solid', color: AMBER }, 29),
          text('xp_eyebrow_text', 'Eyebrow', [110, 147, 346, 32], EYEBROW, { fontSize: 23, fontWeight: 800, color: INK, align: 'center', letterSpacing: 1.5 }),
          text('xp_headline', 'Headline', [110, 234, 1040, 340], HEADLINE, { fontSize: 100, fontWeight: 800, color: WHITE, lineHeight: 1.02, letterSpacing: -1.5 }),
          text('xp_body', 'Body copy', [112, 590, 920, 130], BODY, { fontSize: 33, fontWeight: 500, color: SOFT, lineHeight: 1.25 }),
          rect('xp_cta', 'CTA card', [110, 724, 460, 104], { type: 'solid', color: WHITE }, 52),
          text('xp_cta_text', 'CTA text', [110, 756, 460, 44], CTA, { fontSize: 32, fontWeight: 700, color: INK, align: 'center' }),
        ],
      ),
    ],
  };
}
