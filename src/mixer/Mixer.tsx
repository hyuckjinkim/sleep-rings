import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Capacitor } from '@capacitor/core'
import { OrbitField } from './OrbitField'
import { FieldDock } from './FieldDock'
import { Palette } from './Palette'
import { OrbControls } from './OrbControls'
import { soundEngine } from './engine/instance'
import { soundName } from '../library/catalog'
import { useMixStore } from './store'
import { restoreMix, subscribeAutoSave } from '../sleep/persistence'
import { SleepControls } from '../sleep/SleepControls'
import { startKeepAliveAudio } from '../mobile'
import type { Locale } from './types'
import './mixer.css'

let engineInitialized = false

export function Mixer() {
  const { t, i18n } = useTranslation()
  const fieldRef = useRef<HTMLDivElement>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const locale = (i18n.language === 'en' ? 'en' : 'ko') as Locale
  const selectedSoundId = useMixStore((s) => s.current.placements.find((p) => p.id === selectedId)?.soundId)
  const lastRemoved = useMixStore((s) => s.lastRemoved)
  const restoreLastRemoved = useMixStore((s) => s.restoreLastRemoved)
  const lastRemovedAll = useMixStore((s) => s.lastRemovedAll)
  const restoreLastRemovedAll = useMixStore((s) => s.restoreLastRemovedAll)

  useEffect(() => {
    restoreMix()
    return subscribeAutoSave()
  }, [])

  function handleFirstGesture() {
    if (engineInitialized) return
    engineInitialized = true
    void soundEngine.init()
    // Native only: the silent keep-alive <audio> is purely an iOS/Android background-audio
    // trick (docs/android-build.md §4) — on plain web it would just show a spurious "tab is
    // playing audio" indicator for no benefit.
    if (Capacitor.isNativePlatform()) startKeepAliveAudio()
  }

  return (
    <div className="mixer" onPointerDownCapture={handleFirstGesture}>
      {/* Field+palette stay above the fold — timer/presets are secondary, below them. */}
      <FieldDock onSelect={setSelectedId}>
        <OrbitField fieldRef={fieldRef} selectedId={selectedId} onSelect={setSelectedId} />
      </FieldDock>
      {/* Sticky: chips stay reachable for dragging into the floating mini field while scrolled. */}
      <div className="mixer-top">
        <Palette fieldRef={fieldRef} />
      </div>
      <SleepControls />
      {selectedId && selectedSoundId && (
        <OrbControls placementId={selectedId} label={soundName(selectedSoundId, locale)} onClose={() => setSelectedId(null)} />
      )}
      {(lastRemovedAll || lastRemoved) && (
        <button type="button" className="mixer-undo-toast" onClick={lastRemovedAll ? restoreLastRemovedAll : restoreLastRemoved}>
          {t('mixer.undo.restore')}
        </button>
      )}
    </div>
  )
}
