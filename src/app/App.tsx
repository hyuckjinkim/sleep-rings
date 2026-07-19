import { useTranslation } from 'react-i18next'
import { Mixer } from '../mixer/Mixer'
// theme.css is imported once in main.tsx

export function App() {
  const { t, i18n } = useTranslation()

  const toggleLanguage = () => {
    i18n.changeLanguage(i18n.language === 'ko' ? 'en' : 'ko')
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-start',
        gap: '0.5rem',
        padding: '1.5rem 0 6rem',
        background: 'var(--so-bg-base, #0a0e1a)',
        color: 'var(--so-text-primary, #f0f0f5)',
        fontFamily: 'var(--so-font-family, system-ui, sans-serif)',
      }}
    >
      <h1>{t('app.title')}</h1>
      <p>{t('app.subtitle')}</p>
      <button onClick={toggleLanguage}>{t('app.toggleLanguage')}</button>
      <Mixer />
    </main>
  )
}
