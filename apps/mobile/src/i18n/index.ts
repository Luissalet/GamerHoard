// i18next setup for Watch Hoard. Default language is English; the user's choice is
// persisted in AsyncStorage and restored on startup (see loadStoredLanguage + the
// LanguageGate in app/_layout.tsx).
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import en from './en';
import es from './es';

export const LANGS = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
] as const;
export type LangCode = (typeof LANGS)[number]['code'];

const STORAGE_KEY = '@watchhoard/lang';

if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    resources: { en: { translation: en }, es: { translation: es } },
    lng: 'en',            // default per product decision: always start in English
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
    returnNull: false,
  });
}

// Keep the live resource store in sync with the translation modules above. i18next only
// reads `resources` at first init (guarded by isInitialized), so any key added to en.ts /
// es.ts afterwards is invisible on Fast Refresh and t() renders the raw key (e.g.
// "auth.phConfirmPassword"). Re-registering the bundles with deep+overwrite refreshes the
// store every time this module re-evaluates, so new keys resolve without a cold restart.
i18n.addResourceBundle('en', 'translation', en, true, true);
i18n.addResourceBundle('es', 'translation', es, true, true);

// Restore the saved language before the UI renders (called from the LanguageGate).
export async function loadStoredLanguage(): Promise<void> {
  try {
    const saved = await AsyncStorage.getItem(STORAGE_KEY);
    if (saved && saved !== i18n.language && LANGS.some((l) => l.code === saved)) {
      await i18n.changeLanguage(saved);
    }
  } catch {
    // ignore storage errors — keep the default language
  }
}

// Change + persist the language. react-i18next re-renders subscribed components.
export async function setLanguage(code: LangCode): Promise<void> {
  await i18n.changeLanguage(code);
  try {
    await AsyncStorage.setItem(STORAGE_KEY, code);
  } catch {
    // non-fatal: language still changes for this session
  }
}

export function currentLanguage(): LangCode {
  return i18n.language && i18n.language.startsWith('es') ? 'es' : 'en';
}

export default i18n;
