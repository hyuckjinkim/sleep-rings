// ponytail: follow-up probe — is the screen-switch node/listener growth linear (real leak) or a
// one-time settle after first mount? Checkpoints at 1/5/10/25/50/100 switches, same page, no reload.
import { chromium } from '@playwright/test'

const URL = 'http://localhost:5204'

async function metrics(cdp) {
  const { metrics: m } = await cdp.send('Performance.getMetrics')
  const map = Object.fromEntries(m.map((x) => [x.name, x.value]))
  return { nodes: map.Nodes, listeners: map.JSEventListeners, heapMB: +(map.JSHeapUsedSize / 1048576).toFixed(2) }
}

async function main() {
  const browser = await chromium.launch()
  const context = await browser.newContext()
  await context.addInitScript(() => localStorage.setItem('so.plan', 'tier10000'))
  const page = await context.newPage()
  const cdp = await context.newCDPSession(page)
  await cdp.send('Performance.enable')
  await page.goto(URL, { waitUntil: 'load' })
  await page.waitForSelector('.mixer-field', { state: 'visible' })

  await cdp.send('HeapProfiler.collectGarbage')
  console.log('checkpoint 0:', JSON.stringify(await metrics(cdp)))

  const checkpoints = [1, 5, 10, 25, 50, 100]
  let done = 0
  for (const target of checkpoints) {
    while (done < target) {
      await page.getByRole('button', { name: /설정|settings/i }).click()
      await page.waitForTimeout(15)
      await page.getByRole('button', { name: /닫기|close/i }).first().click()
      await page.waitForTimeout(15)
      done++
    }
    await cdp.send('HeapProfiler.collectGarbage')
    await page.waitForTimeout(100)
    console.log(`checkpoint ${target}:`, JSON.stringify(await metrics(cdp)))
  }

  await browser.close()
}

main().catch((e) => { console.error(e); process.exit(1) })
