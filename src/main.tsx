import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import './app/theme.css'
import './i18n'
import { initBackgroundAudio } from './mobile'
import { soundEngine } from './mixer/engine/instance'

// Once for the app's lifetime — safe on plain web too (@capacitor/app ships a Page Visibility
// web fallback), see docs/android-build.md §4.
initBackgroundAudio(soundEngine)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
