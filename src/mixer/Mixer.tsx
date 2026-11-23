import { useEffect, useLayoutEffect, useRef, useState } from 'react'
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
const PANEL_GAP_PX = 12 // 오브 패널이 열렸을 때 필드와 패널 사이

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
  const isPanelOpen = !!(selectedId && selectedSoundId)

  useEffect(() => {
    if (!mixRestored) {
      mixRestored = true
      restoreMix()
    }
    return subscribeAutoSave()
  }, [])

  // 패널이 열린 동안 필드를 패널 위 공간에 맞게 줄인다(SheetLayout fitField 와 같은 방식). 안 그러면 패널이 필드
  // 아래쪽을 덮어 그 자리 오브를 누를 수 없다. 레이아웃마다 감싼 요소에 자기 transform 이 있어 필드 자신에 건다.
  // 오브 위치는 필드의 레이아웃 폭(offsetWidth)으로 계산되므로 이 scale 이 겹쳐 적용되지 않는다.
  useLayoutEffect(() => {
    const field = fieldRef.current
    const panel = document.querySelector('.mixer-controls')
    if (!isPanelOpen || !field || !panel) return
    const fit = () => {
      field.style.transform = ''
      if (field.closest('.is-floating')) return // 떠 있는 미니 창은 패널보다 위(z-index)에 있다
      const r = field.getBoundingClientRect()
      const room = panel.getBoundingClientRect().top - PANEL_GAP_PX - r.top
      if (room >= r.height || room <= 0) return
      field.style.transformOrigin = 'top center'
      field.style.transform = `scale(${room / r.height})`
    }
    fit()
    // 패널 높이는 행(볼륨 파동 깊이 등)이 늘고 줄 때 바뀐다. ResizeObserver 가 없는 환경은 창 크기 변화만 따른다.
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(fit)
    ro?.observe(panel)
    window.addEventListener('resize', fit)
    return () => {
      ro?.disconnect()
      window.removeEventListener('resize', fit)
      field.style.transform = ''
      field.style.transformOrigin = ''
    }
  }, [isPanelOpen])

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
