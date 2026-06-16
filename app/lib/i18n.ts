import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { Platform } from 'react-native';
import * as Localization from 'expo-localization';
import AsyncStorage from '@react-native-async-storage/async-storage';

import en from '../locales/en.json';
import ru from '../locales/ru.json';
import de from '../locales/de.json';

const STORAGE_KEY = 'user_language';

export const SUPPORTED_LANGUAGES = ['en', 'ru', 'de'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

/**
 * Keep <html lang> in sync with the active language (web only). Without
 * this the page advertises the default lang (en) while showing e.g.
 * Russian, so Chrome offers to translate it. Also helps screen readers.
 */
function syncHtmlLang(lang: SupportedLanguage): void {
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    document.documentElement.lang = lang;
  }
}

export function getDeviceLanguage(): SupportedLanguage {
  try {
    const locales = Localization.getLocales();
    const code = locales[0]?.languageCode?.toLowerCase();
    if (code === 'ru') return 'ru';
    if (code === 'de') return 'de';
    return 'en';
  } catch {
    return 'en';
  }
}

// Synchronous init at module load — uses device language as initial
i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    ru: { translation: ru },
    de: { translation: de },
  },
  lng: getDeviceLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  compatibilityJSON: 'v4',
});

/**
 * Reads stored language preference from AsyncStorage (if any) and applies it.
 * Returns whether this is a first launch (no stored preference) so caller
 * can prompt user to confirm/select.
 */
export async function initI18nFromStorage(): Promise<{
  language: SupportedLanguage;
  isFirstLaunch: boolean;
}> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored && (SUPPORTED_LANGUAGES as readonly string[]).includes(stored)) {
      await i18n.changeLanguage(stored);
      syncHtmlLang(stored as SupportedLanguage);
      return { language: stored as SupportedLanguage, isFirstLaunch: false };
    }
    return { language: getDeviceLanguage(), isFirstLaunch: true };
  } catch {
    return { language: getDeviceLanguage(), isFirstLaunch: true };
  }
}

export async function setLanguage(lang: SupportedLanguage): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // ignore storage failures — language still applies in memory
  }
  await i18n.changeLanguage(lang);
  syncHtmlLang(lang);
}

export function getCurrentLanguage(): SupportedLanguage {
  const lang = i18n.language?.split('-')[0] ?? 'en';
  if ((SUPPORTED_LANGUAGES as readonly string[]).includes(lang)) {
    return lang as SupportedLanguage;
  }
  return 'en';
}

export default i18n;


const MONTH_KEYS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
] as const;

/**
 * Formats "YYYY-MM" or "YYYY-MM-DD" as a localized "Month YYYY" string.
 * E.g. "2026-04" → "April 2026" (en) / "апрель 2026" (ru) / "April 2026" (de).
 */
export function formatMonthLabel(yearMonthOrDate: string): string {
  const ymd =
    yearMonthOrDate.length === 7
      ? `${yearMonthOrDate}-01`
      : yearMonthOrDate;
  const d = new Date(ymd + 'T00:00:00Z');
  const monthKey = MONTH_KEYS[d.getUTCMonth()];
  return `${i18n.t(`months.${monthKey}`)} ${d.getUTCFullYear()}`;
}
