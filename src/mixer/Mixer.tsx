import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Capacitor } from '@capacitor/core'
import { OrbitField } from './OrbitField'
import { FieldDock } from './FieldDock'
import { CollapsingHeader } from './CollapsingHeader'
import { SheetLayout } from './SheetLayout'
import { MiniBar } from './MiniBar'
import { useLayoutStore } from './layout'
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
// Once per app lifetime, not per mount: Settings unmounts the Mixer, and restoring on the way back
// would restart a mix the sleep timer had ended, or drop an orb whose autosave hadn't landed yet.
let mixRestored = false

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
  const layout = useLayoutStore((s) => s.layout)

  useEffect(() => {
    if (!mixRestored) {
      mixRestored = true
      restoreMix()
    }
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

  const field = <OrbitField fieldRef={fieldRef} selectedId={selectedId} onSelect={setSelectedId} />
  const palette = <Palette fieldRef={fieldRef} />

  return (
    <div className={`mixer layout-${layout}`} onPointerDownCapture={handleFirstGesture}>
      {/* Four ways to keep the orbit in view while using the controls below (Settings → layout).
          One OrbitField instance in every branch: its frame loop also drives the spatial audio. */}
      {layout === 'sheet' ? (
        <SheetLayout field={field}>
          {palette}
          <SleepControls />
        </SheetLayout>
      ) : (
        <>
          {layout === 'floating' && <FieldDock onSelect={setSelectedId}>{field}</FieldDock>}
          {layout === 'collapse' && <CollapsingHeader onSelect={setSelectedId}>{field}</CollapsingHeader>}
          {layout === 'minibar' && field}
          {/* Sticky: chips stay reachable for dragging into the field while scrolled. */}
          <div className="mixer-top">{palette}</div>
          <SleepControls />
          {layout === 'minibar' && <MiniBar fieldRef={fieldRef} onSelect={setSelectedId} />}
        </>
      )}
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
