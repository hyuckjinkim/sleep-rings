export type ThemeMode = 'system' | 'light' | 'dark'

const THEME_KEY = 'so.theme'

/** Saved choice, else 'system'. localStorage can throw (private mode, blocked storage). */
export function getThemeMode(): ThemeMode {
  try {
    const saved = localStorage.getItem(THEME_KEY)
    if (saved === 'light' || saved === 'dark') return saved
  } catch {
    /* storage unavailable */
  }
  return 'system'
}

/** Persist and apply. 'system' removes data-theme so theme.css follows prefers-color-scheme.
    The pre-paint half of this lives in an inline script in index.html — keep both in sync. */
export function setThemeMode(mode: ThemeMode): void {
  try {
    localStorage.setItem(THEME_KEY, mode)
  } catch {
    /* storage unavailable — the choice just won't survive a reload */
  }
  if (mode === 'system') document.documentElement.removeAttribute('data-theme')
  else document.documentElement.dataset.theme = mode
}
