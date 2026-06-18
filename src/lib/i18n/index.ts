import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import enCommon from '@/locales/en/common.json';
import enEditor from '@/locales/en/editor.json';
import enErrors from '@/locales/en/errors.json';
import frCommon from '@/locales/fr/common.json';
import frEditor from '@/locales/fr/editor.json';
import frErrors from '@/locales/fr/errors.json';

export const SUPPORTED_LANGUAGES = ['en', 'fr'] as const;
export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const resources = {
  en: { common: enCommon, editor: enEditor, errors: enErrors },
  fr: { common: frCommon, editor: frEditor, errors: frErrors },
} as const;

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    supportedLngs: SUPPORTED_LANGUAGES as unknown as string[],
    ns: ['common', 'editor', 'errors'],
    defaultNS: 'common',
    interpolation: { escapeValue: false },
    detection: {
      // App setting (localStorage) wins, then the browser language.
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'calqo-language',
      caches: ['localStorage'],
    },
    // Surface missing keys loudly in development.
    saveMissing: import.meta.env.DEV,
    missingKeyHandler: import.meta.env.DEV
      ? (_lng, ns, key) => {
          console.warn(`[i18n] missing key: ${ns}:${key}`);
        }
      : undefined,
  });

export default i18n;
