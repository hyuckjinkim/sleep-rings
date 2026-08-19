// ponytail: throwaway QA measurement harness, deleted after the perf report is written — not project source.
import { chromium } from '@playwright/test'

const URL = 'http://localhost:5204'
const out = {}

function pct(arr, p) {
  const s = [...arr].sort((a, b) => a - b)
  return s[Math.floor((s.length - 1) * p)]
}

async function collectFrames(page, ms) {
  return page.evaluate(async (durationMs) => {
    const deltas = []
    let last = performance.now()
    const start = last
    await new Promise((resolve) => {
      function loop(t) {
        deltas.push(t - last)
        last = t
        if (performance.now() - start < durationMs) requestAnimationFrame(loop)
        else resolve()
      }
      requestAnimationFrame(loop)
    })
    return deltas.slice(1) // drop first bogus delta (t - start of measurement)
  }, ms)
}

async function metrics(cdp) {
  const { metrics: m } = await cdp.send('Performance.getMetrics')
  const map = Object.fromEntries(m.map((x) => [x.name, x.value]))
  return {
    heapUsedMB: +(map.JSHeapUsedSize / 1048576).toFixed(2),
    heapTotalMB: +(map.JSHeapTotalSize / 1048576).toFixed(2),
    nodes: map.Nodes,
    listeners: map.JSEventListeners,
    documents: map.Documents,
    taskDuration: map.TaskDuration,
  }
}

async function addOrbs(page, n) {
  const chip = page.locator('.mixer-palette-item').first()
  for (let i = 0; i < n; i++) {
    await chip.click()
    await page.waitForTimeout(30)
  }
}

// Orb.tsx's handleKeyDown maps Delete/Backspace straight to removePlacement (B1) — focus+key
// sidesteps the orbit animation (coordinates keep drifting) and the undo-toast overlap that made
// coordinate-based clicks on '.mixer-orb' land on the wrong element (position:fixed toast sits
// near the field's bottom edge, see mixer.css .mixer-undo-toast).
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

  // ---- 1. Startup timing (cold load) ----
  const navStart = Date.now()
  await page.goto(URL, { waitUntil: 'load' })
  const loadWall = Date.now() - navStart
  const nav = await page.evaluate(() => {
    const n = performance.getEntriesByType('navigation')[0]
    const paints = performance.getEntriesByType('paint').map((p) => [p.name, p.startTime])
    return { responseEnd: n.responseEnd, domContentLoadedEventEnd: n.domContentLoadedEventEnd, loadEventEnd: n.loadEventEnd, paints }
  })
  await page.waitForSelector('.mixer-field', { state: 'visible' })
  const firstRenderMs = await page.evaluate(() => performance.now())

  const soundT0 = await page.evaluate(() => performance.now())
  await page.locator('.mixer-palette-item').first().click()
  await page.waitForSelector('.mixer-orb:not(.is-loading)')
  const soundT1 = await page.evaluate(() => performance.now())
  out.startup = {
    coldLoadWallMs: loadWall,
    domContentLoadedMs: +nav.domContentLoadedEventEnd.toFixed(1),
    loadEventMs: +nav.loadEventEnd.toFixed(1),
    paints: nav.paints,
    firstRenderMs: +firstRenderMs.toFixed(1),
    firstSoundReadyMs: +(soundT1 - soundT0).toFixed(1),
  }

  // remove the one orb we just placed before frame tests
  await removeOrb(page)

  // ---- 2. Runtime frame timing at 1/5/10/20 orbs (no throttle) ----
  out.frameTiming = {}
  const counts = [1, 5, 10, 20]
  let placed = 0
  for (const n of counts) {
    await addOrbs(page, n - placed)
    placed = n
    const deltas = await collectFrames(page, 3000)
    const over = deltas.filter((d) => d > 16.7).length
    out.frameTiming[n] = {
      frames: deltas.length,
      p50: +pct(deltas, 0.5).toFixed(2),
      p95: +pct(deltas, 0.95).toFixed(2),
      max: +Math.max(...deltas).toFixed(2),
      overBudgetPct: +((100 * over) / deltas.length).toFixed(1),
    }
  }

  // ---- 3. Audio CPU: TaskDuration/wall-clock ratio at 8 (HRTF) vs 9 (auto-downgrade to stereo) ----
  out.audioCpu = {}
  for (const n of [1, 4, 8, 9, 12]) {
    if (n > placed) {
      await addOrbs(page, n - placed)
      placed = n
    } else if (n < placed) {
      // remove down to n via clicking orbs + delete
      while (placed > n) {
        await removeOrb(page)
        placed--
      }
    }
    const before = await metrics(cdp)
    const wallStart = Date.now()
    await page.waitForTimeout(2000)
    const after = await metrics(cdp)
    const wall = (Date.now() - wallStart) / 1000
    out.audioCpu[n] = { taskDurationSec: +(after.taskDuration - before.taskDuration).toFixed(3), wallSec: +wall.toFixed(2), ratioPct: +(((after.taskDuration - before.taskDuration) / wall) * 100).toFixed(1) }
  }

  // clear all orbs for memory tests
  while (placed > 0) {
    await removeOrb(page)
    placed--
  }

  // ---- 4. Memory: heap growth with sound count ----
  out.memoryByCount = {}
  await cdp.send('HeapProfiler.collectGarbage')
  out.memoryByCount[0] = await metrics(cdp)
  for (const n of [1, 4, 8, 12]) {
    await addOrbs(page, n - (placed))
    placed = n
    await cdp.send('HeapProfiler.collectGarbage')
    out.memoryByCount[n] = await metrics(cdp)
  }
  while (placed > 0) {
    await removeOrb(page)
    placed--
  }

  // ---- 5. Leak test: add/remove 100 cycles ----
  await cdp.send('HeapProfiler.collectGarbage')
  const leakBefore = await metrics(cdp)
  const chip = page.locator('.mixer-palette-item').first()
  for (let i = 0; i < 100; i++) {
    await chip.click()
    await removeOrb(page)
  }
  await cdp.send('HeapProfiler.collectGarbage')
  await page.waitForTimeout(200)
  const leakAfter = await metrics(cdp)
  out.leakAddRemove100 = { before: leakBefore, after: leakAfter }

  // ---- 6. Leak test: 50 screen switches (mixer <-> settings) ----
  await cdp.send('HeapProfiler.collectGarbage')
  const scrBefore = await metrics(cdp)
  for (let i = 0; i < 50; i++) {
    await page.getByRole('button', { name: /설정|settings/i }).click()
    await page.waitForTimeout(20)
    await page.getByRole('button', { name: /닫기|close/i }).first().click()
    await page.waitForTimeout(20)
  }
  await cdp.send('HeapProfiler.collectGarbage')
  await page.waitForTimeout(200)
  const scrAfter = await metrics(cdp)
  out.leakScreenSwitch50 = { before: scrBefore, after: scrAfter }

  await browser.close()

  // ---- 7. Mobile emulation: 4x CPU throttle, 20 orbs, frame timing ----
  const browser2 = await chromium.launch()
  const context2 = await browser2.newContext()
  await context2.addInitScript(() => localStorage.setItem('so.plan', 'tier10000'))
  const page2 = await context2.newPage()
  const cdp2 = await context2.newCDPSession(page2)
  await cdp2.send('Performance.enable')
  await cdp2.send('Emulation.setCPUThrottlingRate', { rate: 4 })
  await page2.goto(URL, { waitUntil: 'load' })
  await page2.waitForSelector('.mixer-field', { state: 'visible' })
  await addOrbs(page2, 20)
  const deltasThrottled = await collectFrames(page2, 3000)
  const overT = deltasThrottled.filter((d) => d > 16.7).length
  out.mobile4xThrottle20orbs = {
    frames: deltasThrottled.length,
    p50: +pct(deltasThrottled, 0.5).toFixed(2),
    p95: +pct(deltasThrottled, 0.95).toFixed(2),
    max: +Math.max(...deltasThrottled).toFixed(2),
    overBudgetPct: +((100 * overT) / deltasThrottled.length).toFixed(1),
  }
  await browser2.close()

  console.log(JSON.stringify(out, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
