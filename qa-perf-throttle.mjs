// ponytail: throwaway follow-up probe (deleted after use) — audio main-thread CPU cost under 4x
// CPU throttle (mid-range Android proxy) at 8 (HRTF) vs 9 (auto-downgrade to stereo) vs 12 orbs.
import { chromium } from '@playwright/test'

const URL = 'http://localhost:5204'

async function metrics(cdp) {
  const { metrics: m } = await cdp.send('Performance.getMetrics')
  const map = Object.fromEntries(m.map((x) => [x.name, x.value]))
  return { taskDuration: map.TaskDuration }
}

async function removeOrb(page) {
  await page.locator('.mixer-orb').first().focus()
  await page.keyboard.press('Delete')
  await page.waitForTimeout(20)
}

async function main() {
  const browser = await chromium.launch()
  const context = await browser.newContext()
  await context.addInitScript(() => localStorage.setItem('so.plan', 'tier10000'))
  const page = await context.newPage()
  const cdp = await context.newCDPSession(page)
  await cdp.send('Performance.enable')
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
  await page.goto(URL, { waitUntil: 'load' })
  await page.waitForSelector('.mixer-field', { state: 'visible' })

  const chip = page.locator('.mixer-palette-item').first()
  const out = {}
  let placed = 0
  for (const n of [1, 8, 9, 12]) {
    while (placed < n) {
      await chip.click()
      await page.waitForTimeout(30)
      placed++
    }
    const before = await metrics(cdp)
    const wallStart = Date.now()
    await page.waitForTimeout(2000)
    const after = await metrics(cdp)
    const wall = (Date.now() - wallStart) / 1000
    out[n] = { taskDurationSec: +(after.taskDuration - before.taskDuration).toFixed(3), ratioPct: +(((after.taskDuration - before.taskDuration) / wall) * 100).toFixed(1) }
  }
  console.log(JSON.stringify(out, null, 2))
  await browser.close()
}

main().catch((e) => { console.error(e); process.exit(1) })
