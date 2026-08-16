import { useEffect, useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import { useMixStore } from './store'
import { TAU, unitToPolar } from './geometry'
import { catalog, isAvailable } from '../library/catalog'
import { SoundIcon } from '../icons/SoundIcon'
import { FALLBACK_PRICE, canUseSound, getPurchaseAdapter, isPurchaseAvailable, isPurchaseCancelled, requiredPlan, usePlanStore } from '../plan'
import type { Plan, PurchaseOffering } from '../plan'
import type { Category, Locale, Sound } from './types'

const DRAG_THRESHOLD_PX = 4

interface PaletteProps {
  fieldRef: RefObject<HTMLDivElement | null>
}

export type DragIntent = 'tap' | 'pan' | 'place'

/**
 * Classify a chip pointer gesture once total movement clears DRAG_THRESHOLD_PX. Horizontal-
 * dominant movement pans the palette strip (chips already use pointerdown->field drag to place
 * an orb, so panning needs its own axis to avoid colliding with that gesture); vertical/diagonal
 * movement keeps the existing field-placement drag. Below threshold it's still a tap. Pure
 * function so the direction split can be unit-tested without pointer-event plumbing.
 */
export function classifyDrag(dx: number, dy: number, threshold = DRAG_THRESHOLD_PX): DragIntent {
  if (Math.hypot(dx, dy) <= threshold) return 'tap'
  return Math.abs(dx) > Math.abs(dy) ? 'pan' : 'place'
}

/** B2: a locked-padlock badge for plan-gated chips. Inline SVG (no new asset file — this is a
    UI-only concern, not a sound icon) so it stays decoupled from assets/sound-icons. */
function LockBadge() {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true" className="mixer-palette-lock">
      <rect x="5" y="11" width="14" height="9" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  )
}

interface PaletteItemProps {
  sound: Sound
  label: string
  available: boolean // asset availability (catalog.ts's isAvailable — unrelated to plan)
  planLocked: boolean // B2: locked by the current plan, not by a missing asset
  lockedLabel: string // accessible name override while planLocked (mentions the upgrade requirement)
  fieldRef: RefObject<HTMLDivElement | null>
  stripRef: RefObject<HTMLDivElement | null>
  addPlacement: (soundId: string, radius: number, angle: number) => string
  onLockedTap: (sound: Sound) => void
}

/** Drag a catalog chip onto the field to add it as a new orb, or drag it sideways to pan the
    palette strip. Pointer Events cover touch+mouse. */
function PaletteItem({ sound, label, available, planLocked, lockedLabel, fieldRef, stripRef, addPlacement, onLockedTap }: PaletteItemProps) {
  const chipRef = useRef<HTMLButtonElement | null>(null)
  const drag = useRef<{ startX: number; startY: number; lastX: number } | null>(null)
  const intent = useRef<DragIntent>('tap') // decided on first move past DRAG_THRESHOLD_PX
  const suppressClick = useRef(false)

  function handlePointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { startX: e.clientX, startY: e.clientY, lastX: e.clientX }
    intent.current = 'tap'
  }

  function handlePointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    if (!drag.current || !chipRef.current) return
    const dx = e.clientX - drag.current.startX
    const dy = e.clientY - drag.current.startY

    if (intent.current === 'tap') intent.current = classifyDrag(dx, dy)

    if (intent.current === 'pan') {
      stripRef.current?.scrollBy({ left: -(e.clientX - drag.current.lastX) })
      drag.current.lastX = e.clientX
      return
    }
    if (intent.current === 'place') {
      chipRef.current.style.transform = `translate(${dx}px, ${dy}px)`
      chipRef.current.style.zIndex = '10'
    }
  }

  function handlePointerUp(e: React.PointerEvent<HTMLButtonElement>) {
    if (!drag.current) return
    const finalIntent = intent.current
    drag.current = null
    if (chipRef.current) {
      chipRef.current.style.transform = ''
      chipRef.current.style.zIndex = ''
    }
    if (finalIntent === 'tap') return // let the click handler (below) place it

    suppressClick.current = true // real drag (pan or place) — the click that follows must no-op
    if (finalIntent === 'pan') return // panning never places an orb

    const rect = fieldRef.current?.getBoundingClientRect()
    if (!rect) return
    const inside = e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom
    if (!inside) return
    if (planLocked) {
      onLockedTap(sound)
      return
    }
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    const r = rect.width / 2
    const { radius, angle } = unitToPolar((e.clientX - cx) / r, (e.clientY - cy) / r)
    addPlacement(sound.id, radius, angle)
  }

  // B1/B2: a real drag is handled entirely by the pointer handlers above (and does its own
  // drop-target check). This only fires for keyboard activation (Enter/Space on a focused
  // button) or a plain click/tap with no drag — both of which previously did nothing at all.
  function handleClick() {
    if (suppressClick.current) {
      suppressClick.current = false
      return
    }
    if (planLocked) {
      onLockedTap(sound)
      return
    }
    addPlacement(sound.id, 0.25 + Math.random() * 0.5, Math.random() * TAU)
  }

  return (
    <button
      ref={chipRef}
      type="button"
      className={planLocked ? 'mixer-palette-item is-plan-locked' : 'mixer-palette-item'}
      disabled={!available}
      // B2: intentionally NOT aria-disabled — this chip stays genuinely operable (tapping it
      // opens the upgrade sheet), and aria-disabled tells assistive tech + tools like Playwright's
      // toBeEnabled() that activation is a no-op, which would be false here. The lock is
      // conveyed via the accessible name instead (visible text stays via the icon+label below).
      aria-label={planLocked ? lockedLabel : undefined}
      style={{ '--orb-color': `var(--so-orb-${sound.category})` } as React.CSSProperties}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onClick={handleClick}
    >
      <SoundIcon soundId={sound.id} category={sound.category} className="so-icon--sm" />
      <span>{label}</span>
      {planLocked && <LockBadge />}
    </button>
  )
}

interface UpgradeSheetProps {
  label: string
  plan: Exclude<Plan, 'free'>
  onClose: () => void
}

type PurchaseStatus = 'idle' | 'purchasing' | 'restoring' | 'error'

/** RevenueCat purchase flow, gated behind isPurchaseAvailable() (docs/plan-tiers.md §3): with no
    API key configured (today's build) or off-native (web), purchases/restore aren't reachable at
    all, so the sheet shows a "준비 중" notice instead of buttons that would silently no-op. Once a
    key is configured this same sheet gains a real buy + restore flow with no other code changes. */
function UpgradeSheet({ label, plan, onClose }: UpgradeSheetProps) {
  const { t } = useTranslation()
  const available = isPurchaseAvailable()
  const [offerings, setOfferings] = useState<PurchaseOffering[] | null>(null)
  const [status, setStatus] = useState<PurchaseStatus>('idle')

  useEffect(() => {
    let cancelled = false
    getPurchaseAdapter()
      .getOfferings()
      .then((list) => {
        if (!cancelled) setOfferings(list)
      })
      .catch(() => {
        // ponytail: network/store failure loading offerings — the docs price string below covers it.
      })
    return () => {
      cancelled = true
    }
  }, [])

  const priceString = offerings?.find((o) => o.plan === plan)?.priceString ?? FALLBACK_PRICE[plan]

  async function handlePurchase() {
    setStatus('purchasing')
    try {
      await getPurchaseAdapter().purchase(plan)
      onClose() // usePlanStore already reflects the new plan — nothing else to sync
    } catch (err) {
      setStatus(isPurchaseCancelled(err) ? 'idle' : 'error')
    }
  }

  async function handleRestore() {
    setStatus('restoring')
    try {
      await getPurchaseAdapter().restore()
      onClose()
    } catch {
      setStatus('error')
    }
  }

  return (
    <div className="mixer-upgrade-backdrop" onClick={onClose}>
      <div className="mixer-upgrade-sheet" role="dialog" aria-modal="true" aria-label={t('plan.upgrade.title')} onClick={(e) => e.stopPropagation()}>
        <p>{t('plan.upgrade.body', { sound: label, tier: t(`plan.tier.${plan}`) })}</p>
        {available ? (
          <>
            <button type="button" className="mixer-upgrade-buy" disabled={status === 'purchasing'} onClick={handlePurchase}>
              {status === 'purchasing' ? t('plan.upgrade.purchasing') : t('plan.upgrade.buy', { price: priceString })}
            </button>
            <button type="button" className="mixer-upgrade-restore" disabled={status === 'restoring'} onClick={handleRestore}>
              {status === 'restoring' ? t('plan.upgrade.restoring') : t('plan.upgrade.restore')}
            </button>
            {status === 'error' && (
              <p className="mixer-upgrade-error" role="alert">
                {t('plan.upgrade.failed')}
              </p>
            )}
          </>
        ) : (
          <p className="mixer-upgrade-comingSoon">{t('plan.upgrade.comingSoon', { price: priceString })}</p>
        )}
        <button type="button" onClick={onClose}>
          {t('plan.upgrade.close')}
        </button>
      </div>
    </div>
  )
}

export function Palette({ fieldRef }: PaletteProps) {
  const { t, i18n } = useTranslation()
  const locale = (i18n.language === 'en' ? 'en' : 'ko') as Locale
  const addPlacement = useMixStore((s) => s.addPlacement)
  const hasPlacements = useMixStore((s) => s.current.placements.length > 0)
  const clearAll = useMixStore((s) => s.clearAll)
  const layerLimitNotice = useMixStore((s) => s.layerLimitNotice)
  const plan = usePlanStore((s) => s.plan)
  const stripRef = useRef<HTMLDivElement | null>(null)
  const [upgradeSound, setUpgradeSound] = useState<Sound | null>(null)

  // Categories are derived from whatever the catalog actually contains (no hardcoded list),
  // in first-appearance order. The default tab is simply the FIRST one — deliberately not
  // "whichever category has the most sounds", which made the app's opening screen a side effect
  // of catalog edits: adding premium sounds to another category silently moved the default tab
  // and broke four tests that (reasonably) expected to open on the free noise basics.
  const categoryOrder = useMemo(() => {
    const order: Category[] = []
    for (const sound of catalog) if (!order.includes(sound.category)) order.push(sound.category)
    return order
  }, [])
  const [activeCategory, setActiveCategory] = useState<Category>(() => categoryOrder[0])

  // A category whose sounds are ALL unavailable (no real asset yet) still gets a tab — hiding
  // the tab itself would make it look like the category doesn't exist. Within the tab, L-4's
  // hide-unavailable-entirely rule still applies as long as it leaves at least one sound visible;
  // it only falls back to showing (disabled) entries when hiding them would empty the tab.
  // B2: plan-locked sounds are a *different* kind of unavailable — they stay visible always
  // (owner policy ③), so they're never subject to the L-4 filter above, only to asset availability.
  const soundsInTab = useMemo(() => {
    const inCategory = catalog.filter((s) => s.category === activeCategory)
    const available = inCategory.filter((s) => isAvailable(s.id))
    return available.length > 0 ? available : inCategory
  }, [activeCategory])

  function handleTabKeyDown(e: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    const dir = e.key === 'ArrowRight' ? 1 : -1
    const next = categoryOrder[(index + dir + categoryOrder.length) % categoryOrder.length]
    setActiveCategory(next)
    document.getElementById(`mixer-tab-${next}`)?.focus()
  }

  return (
    <div className="mixer-palette-wrap">
      <div className="mixer-palette-toolbar">
        <div className="mixer-palette-tabs" role="tablist" aria-label={t('mixer.palette.label')}>
          {categoryOrder.map((category, i) => (
            <button
              key={category}
              type="button"
              role="tab"
              id={`mixer-tab-${category}`}
              aria-selected={activeCategory === category}
              aria-controls="mixer-tabpanel"
              tabIndex={activeCategory === category ? 0 : -1}
              className="mixer-palette-tab"
              style={{ '--orb-color': `var(--so-orb-${category})` } as React.CSSProperties}
              onClick={() => setActiveCategory(category)}
              onKeyDown={(e) => handleTabKeyDown(e, i)}
            >
              {t(`mixer.category.${category}`)}
            </button>
          ))}
        </div>
        {/* "모두 제거": only worth showing once there's something on the field to clear. */}
        {hasPlacements && (
          <button type="button" className="mixer-palette-clear" onClick={clearAll}>
            {t('mixer.palette.clearAll')}
          </button>
        )}
      </div>
      <div ref={stripRef} id="mixer-tabpanel" className="mixer-palette" role="tabpanel" aria-labelledby={`mixer-tab-${activeCategory}`}>
        {soundsInTab.map((sound) => {
          const planLocked = isAvailable(sound.id) && !canUseSound(sound.id, plan)
          const label = sound.name[locale]
          return (
            <PaletteItem
              key={sound.id}
              sound={sound}
              label={label}
              available={isAvailable(sound.id)}
              planLocked={planLocked}
              lockedLabel={`${label} — ${t('plan.upgrade.title')}`}
              fieldRef={fieldRef}
              stripRef={stripRef}
              addPlacement={addPlacement}
              onLockedTap={setUpgradeSound}
            />
          )
        })}
      </div>
      {layerLimitNotice && (
        <p className="mixer-layer-notice" role="status">
          {t(`plan.layerLimit.${layerLimitNotice.outcome}`)}
        </p>
      )}
      {upgradeSound && (
        // requiredPlan() is typed as Plan (includes 'free'), but a sound only reaches the upgrade
        // sheet via onLockedTap, which only fires when planLocked is true — and a 'free'-tier
        // sound can never be planLocked (canUseSound is true for it at every plan). Safe to narrow.
        <UpgradeSheet
          label={upgradeSound.name[locale]}
          plan={requiredPlan(upgradeSound.id) as Exclude<Plan, 'free'>}
          onClose={() => setUpgradeSound(null)}
        />
      )}
    </div>
  )
}
