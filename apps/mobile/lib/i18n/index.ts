import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en';
import de from './de';

export const resources = {
  en: { translation: en },
  de: { translation: de },
} as const;

void i18n.use(initReactI18next).init({
  resources,
  lng: 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  compatibilityJSON: 'v4',
  react: { useSuspense: false },
});

export async function changeLanguage(locale: 'en' | 'de') {
  await i18n.changeLanguage(locale);
}
