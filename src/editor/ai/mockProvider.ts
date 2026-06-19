import { CURRENT_SCHEMA_VERSION } from '@/lib/schema';
import { createId } from '@/lib/utils/ids';
import type {
  AIProvider,
  SvgPromptInput,
  SvgPromptResult,
  TemplatePromptInput,
  TemplatePromptResult,
  TranslationJob,
  TranslationResult,
} from './AIProvider';

/** A tiny multilingual dictionary so mock translations look plausible in demos
 * and tests rather than being pure gibberish. */
const DICTIONARY: Record<string, Record<string, string>> = {
  hello: { fr: 'Bonjour', es: 'Hola', de: 'Hallo', tr: 'Merhaba', it: 'Ciao' },
  welcome: { fr: 'Bienvenue', es: 'Bienvenido', de: 'Willkommen', tr: 'Hoş geldiniz', it: 'Benvenuto' },
  'thank you': { fr: 'Merci', es: 'Gracias', de: 'Danke', tr: 'Teşekkürler', it: 'Grazie' },
  today: { fr: "Aujourd'hui", es: 'Hoy', de: 'Heute', tr: 'Bugün', it: 'Oggi' },
  sale: { fr: 'Soldes', es: 'Rebajas', de: 'Sale', tr: 'İndirim', it: 'Saldi' },
  new: { fr: 'Nouveau', es: 'Nuevo', de: 'Neu', tr: 'Yeni', it: 'Nuovo' },
};

function translateWord(word: string, target: string): string | null {
  const entry = DICTIONARY[word.toLowerCase()];
  return entry?.[target] ?? null;
}

/** Deterministic mock translation: applies the glossary, then a word-level
 * dictionary, and finally a `[locale]` prefix so untranslated copy is obvious. */
function mockTranslate(
  text: string,
  job: TranslationJob,
): string {
  if (!text.trim()) return text;
  let result = text;

  // Preferred-translation glossary terms are substituted verbatim.
  for (const entry of job.glossary) {
    if (entry.mode === 'preferred-translation' && entry.target) {
      result = result.replaceAll(entry.source, entry.target);
    }
  }

  const doNotTranslate = new Set(
    job.glossary
      .filter((e) => e.mode === 'do-not-translate')
      .map((e) => e.source.toLowerCase()),
  );

  let anyTranslated = false;
  const translated = result
    .split(/(\s+)/)
    .map((token) => {
      if (/^\s+$/.test(token)) return token;
      const stripped = token.replace(/[.,!?:;]+$/g, '');
      const trailing = token.slice(stripped.length);
      if (doNotTranslate.has(stripped.toLowerCase())) return token;
      const word = translateWord(stripped, job.targetLocale);
      if (word) {
        anyTranslated = true;
        return word + trailing;
      }
      return token;
    })
    .join('');

  // If nothing matched the dictionary, mark it so reviewers see it needs work.
  return anyTranslated ? translated : `[${job.targetLocale}] ${translated}`;
}

function buildTemplate(input: TemplatePromptInput): string {
  const palette = input.palette?.length
    ? input.palette
    : ['#0A2540', '#FFFFFF', '#E8B339'];
  const [bg, fg, accent] = [palette[0], palette[1] ?? '#FFFFFF', palette[2] ?? '#E8B339'];
  const font = input.fonts[0] ?? 'Inter';
  const margin = Math.round(input.width * 0.08);
  const contentWidth = input.width - margin * 2;

  const project = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: createId('proj'),
    name: input.prompt.slice(0, 60) || 'AI template',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    contentLocales: [input.locale],
    activeContentLocale: input.locale,
    palette,
    assets: [],
    glossary: [],
    artboards: [
      {
        id: createId('ab'),
        name: 'Generated',
        preset: input.preset,
        width: input.width,
        height: input.height,
        background: { type: 'solid', color: bg },
        layers: [
          {
            id: createId('layer'),
            name: 'Accent block',
            type: 'shape',
            shape: 'rect',
            x: margin,
            y: Math.round(input.height * 0.18),
            w: Math.round(contentWidth * 0.32),
            h: Math.max(8, Math.round(input.height * 0.012)),
            rotation: 0,
            opacity: 1,
            visible: true,
            locked: false,
            fill: { type: 'solid', color: accent },
            cornerRadius: 6,
          },
          {
            id: createId('layer'),
            name: 'Headline',
            type: 'text',
            x: margin,
            y: Math.round(input.height * 0.22),
            w: contentWidth,
            h: Math.round(input.height * 0.28),
            rotation: 0,
            opacity: 1,
            visible: true,
            locked: false,
            text: { [input.locale]: input.prompt.slice(0, 48) || 'Headline' },
            style: {
              fontFamily: font,
              fontSize: Math.round(input.width * 0.075),
              fontWeight: 700,
              color: fg,
              align: 'left',
              lineHeight: 1.05,
              letterSpacing: 0,
            },
          },
          {
            id: createId('layer'),
            name: 'Subtitle',
            type: 'text',
            x: margin,
            y: Math.round(input.height * 0.55),
            w: contentWidth,
            h: Math.round(input.height * 0.12),
            rotation: 0,
            opacity: 1,
            visible: true,
            locked: false,
            text: { [input.locale]: 'Add your supporting copy here.' },
            style: {
              fontFamily: font,
              fontSize: Math.round(input.width * 0.03),
              fontWeight: 400,
              color: fg,
              align: 'left',
              lineHeight: 1.3,
              letterSpacing: 0,
            },
          },
        ].slice(0, Math.max(1, input.maxLayers)),
      },
    ],
  };
  return JSON.stringify(project, null, 2);
}

/** Deterministic mock SVG: picks a primitive from the prompt keywords so the
 * insert-SVG flow is exercisable offline with predictable output. */
function buildMockSvg(input: SvgPromptInput): string {
  const color = input.color ?? '#111827';
  const p = input.prompt.toLowerCase();
  let body: string;
  if (/star|rate|favou?rite/.test(p)) {
    body = `<path d="M12 2l2.95 6.18 6.8.78-5 4.62 1.34 6.7L12 17.77 5.91 21.1l1.34-6.7-5-4.62 6.8-.78z" fill="${color}"/>`;
  } else if (/heart|love|like/.test(p)) {
    body = `<path d="M12 21s-7.5-4.6-10-9.2C.2 8.6 1.8 5 5.2 5c2 0 3.3 1.1 4 2.1.7-1 2-2.1 4-2.1 3.4 0 5 3.6 3.2 6.8C19.5 16.4 12 21 12 21z" fill="${color}"/>`;
  } else if (/circle|dot|round/.test(p)) {
    body = `<circle cx="12" cy="12" r="9" fill="${color}"/>`;
  } else {
    body = `<path d="M12 2l1.6 6.4L20 10l-6.4 1.6L12 18l-1.6-6.4L4 10l6.4-1.6z" fill="${color}"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">${body}</svg>`;
}

/** The default, always-available provider (plan §14.3). Requires no setup and
 * exercises the real validation/insertion path with deterministic output. */
export const mockProvider: AIProvider = {
  id: 'mock',
  label: 'Mock (offline)',
  capabilities: { structuredJson: true, translation: true },

  async generateSvg(input): Promise<SvgPromptResult> {
    return { raw: buildMockSvg(input) };
  },

  async generateTemplate(input): Promise<TemplatePromptResult> {
    // A magic prompt lets tests/devs exercise the repair/error path.
    if (input.prompt.includes('__invalid__')) {
      return { raw: '```json\n{ "schemaVersion": 1, "artboards": [ }\n```' };
    }
    return { raw: buildTemplate(input) };
  },

  async translate(job): Promise<TranslationResult> {
    return {
      targetLocale: job.targetLocale,
      items: job.items.map((item) => ({
        layerId: item.layerId,
        artboardId: item.artboardId,
        translatedText: mockTranslate(item.sourceText, job),
        confidence: 0.5,
      })),
    };
  },
};
