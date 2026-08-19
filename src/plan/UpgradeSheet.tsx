import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FALLBACK_PRICE, getPurchaseAdapter, isPurchaseAvailable, isPurchaseCancelled } from '.'
import type { Plan, PurchaseOffering } from '.'
import '../mixer/mixer.css'

interface UpgradeSheetProps {
  /** Sound that triggered the sheet, when it came from tapping a locked chip. Omitted when the
      user opened it from settings to browse plans — there is no single sound to name then. */
  label?: string
  plan: Exclude<Plan, 'free'>
  onClose: () => void
}

type PurchaseStatus = 'idle' | 'purchasing' | 'restoring' | 'error'

/** RevenueCat purchase flow, gated behind isPurchaseAvailable() (docs/plan-tiers.md §3): with no
    API key configured (today's build) or off-native (web), purchases/restore aren't reachable at
    all, so the sheet shows a "준비 중" notice instead of buttons that would silently no-op. Once a
    key is configured this same sheet gains a real buy + restore flow with no other code changes. */
export function UpgradeSheet({ label, plan, onClose }: UpgradeSheetProps) {
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
        <p>
          {label
            ? t('plan.upgrade.body', { sound: label, tier: t(`plan.tier.${plan}`) })
            : t('plan.upgrade.bodyGeneric', { tier: t(`plan.tier.${plan}`) })}
        </p>
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
