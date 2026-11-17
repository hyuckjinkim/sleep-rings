import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import ko from './locales/ko.json'
import en from './locales/en.json'

const LANG_KEY = 'so.lang'

/** Saved choice first, else the device language (Korean devices → ko, everything else → en).
    localStorage can throw (private mode, blocked storage) — fall through to detection then. */
function initialLanguage(): 'ko' | 'en' {
  try {
    const saved = localStorage.getItem(LANG_KEY)
    if (saved === 'ko' || saved === 'en') return saved
  } catch {
    /* storage unavailable */
  }
  return typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('ko') ? 'ko' : 'en'
}

i18n.on('languageChanged', (lng) => {
  try {
    localStorage.setItem(LANG_KEY, lng)
  } catch {
    /* storage unavailable — the choice just won't survive a reload */
  }
  if (typeof document !== 'undefined') document.documentElement.lang = lng
})

i18n.use(initReactI18next).init({
  resources: {
    ko: { translation: ko },
    en: { translation: en },
  },
  lng: initialLanguage(),
  fallbackLng: 'ko',
  interpolation: { escapeValue: false },
})

export default i18n
