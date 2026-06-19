import type { CalqoProject, LocaleCode, TextLayer } from '@/lib/schema';

/** A curated set of content locales offered in the add-locale picker. Content
 * locales are independent of the app UI language (plan §7.4). */
export const COMMON_CONTENT_LOCALES: { code: LocaleCode; name: string }[] = [
  { code: 'en', name: 'English' },
  { code: 'fr', name: 'Français' },
  { code: 'es', name: 'Español' },
  { code: 'de', name: 'Deutsch' },
  { code: 'it', name: 'Italiano' },
  { code: 'pt', name: 'Português' },
  { code: 'nl', name: 'Nederlands' },
  { code: 'tr', name: 'Türkçe' },
  { code: 'ar', name: 'العربية' },
  { code: 'ja', name: '日本語' },
  { code: 'ko', name: '한국어' },
  { code: 'zh', name: '中文' },
];

const LOCALE_NAMES = new Map(
  COMMON_CONTENT_LOCALES.map((l) => [l.code, l.name] as const),
);

/** Human label for a locale code, using Intl.DisplayNames when available. */
export function localeLabel(code: LocaleCode, uiLanguage = 'en'): string {
  try {
    const display = new Intl.DisplayNames([uiLanguage], { type: 'language' });
    const name = display.of(code);
    if (name && name !== code) return name;
  } catch {
    /* Intl.DisplayNames unsupported — fall back to our table. */
  }
  return LOCALE_NAMES.get(code) ?? code.toUpperCase();
}

export interface ResolvedText {
  value: string;
  /** True when the active locale had no value and a fallback was used. */
  isFallback: boolean;
  /** Locale the returned value actually came from. */
  fromLocale: LocaleCode | null;
}

/** Resolve a text layer's string for the active locale, falling back to the
 * project's first locale, then any present value (plan §13.2). */
export function resolveText(
  layer: TextLayer,
  project: Pick<CalqoProject, 'activeContentLocale' | 'contentLocales'>,
): ResolvedText {
  const active = layer.text[project.activeContentLocale];
  if (active !== undefined) {
    return { value: active, isFallback: false, fromLocale: project.activeContentLocale };
  }
  const primary = project.contentLocales[0];
  if (primary && layer.text[primary] !== undefined) {
    return { value: layer.text[primary], isFallback: true, fromLocale: primary };
  }
  const entries = Object.entries(layer.text);
  if (entries.length > 0) {
    return { value: entries[0][1], isFallback: true, fromLocale: entries[0][0] };
  }
  return { value: '', isFallback: false, fromLocale: null };
}
