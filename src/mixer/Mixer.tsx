import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { OrbitField } from './OrbitField'
import { Palette } from './Palette'
import { OrbControls } from './OrbControls'
import { soundEngine } from './engine/instance'
import { soundName } from '../library/catalog'
import { useMixStore } from './store'
import { restoreMix, subscribeAutoSave } from '../sleep/persistence'
import { SleepControls } from '../sleep/SleepControls'
import type { Locale } from './types'
import './mixer.css'

let engineInitialized = false

export function Mixer() {
  const { i18n } = useTranslation()
  const fieldRef = useRef<HTMLDivElement>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const locale = (i18n.language === 'en' ? 'en' : 'ko') as Locale
  const selectedSoundId = useMixStore((s) => s.current.placements.find((p) => p.id === selectedId)?.soundId)

  useEffect(() => {
    restoreMix()
    return subscribeAutoSave()
  }, [])

  function handleFirstGesture() {
    if (engineInitialized) return
    engineInitialized = true
    void soundEngine.init()
  }

  return (
    <div className="mixer" onPointerDownCapture={handleFirstGesture}>
      {/* Field+palette stay above the fold — timer/presets are secondary, below them. */}
      <OrbitField fieldRef={fieldRef} selectedId={selectedId} onSelect={setSelectedId} />
      <Palette fieldRef={fieldRef} />
      <SleepControls />
      {selectedId && selectedSoundId && (
        <OrbControls placementId={selectedId} label={soundName(selectedSoundId, locale)} onClose={() => setSelectedId(null)} />
      )}
    </div>
  )
}
