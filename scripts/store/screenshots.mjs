// Store screenshot capture — re-runnable. Boots the Vite dev server if it isn't already
// running (reuses one already up, like playwright.config.ts's reuseExistingServer), then
// walks 4 scenes per viewport using the same pointer-drag approach as e2e/mixer.spec.ts.
// Output: docs/store/screenshots/{ios,android}/NN-name.png
//
// Usage: node scripts/store/screenshots.mjs

import { chromium } from '@playwright/test'
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const BASE_URL = 'http://localhost:5173'
const OUT_DIR = path.join(ROOT, 'docs/store/screenshots')

// CSS viewport x deviceScaleFactor chosen so the raw PNG lands exactly on the store's
// required pixel dimensions (iPhone 15 Pro Max: 430x932@3x; a common Android 1080x1920@3x).
const VIEWPORTS = {
  ios: { width: 430, height: 932, deviceScaleFactor: 3 },
  android: { width: 360, height: 640, deviceScaleFactor: 3 },
}

async function waitForServer(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url)
      if (res.ok) return
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`dev server did not respond at ${url} within ${timeoutMs}ms`)
}

async function ensureDevServer() {
  try {
    const res = await fetch(BASE_URL)
    if (res.ok) return null // already running — reuse it, don't touch it
  } catch {
    // not running, start it below
  }
  const proc = spawn('npm', ['run', 'dev'], { cwd: ROOT, stdio: 'ignore' })
  // mobile-packager's gradle build shares this disk (WSL /mnt/d) — generous timeout.
  await waitForServer(BASE_URL, 120_000)
  return proc
}

function fieldOffset(fieldBox, dx, dy) {
  return {
    x: fieldBox.x + fieldBox.width / 2 + fieldBox.width * dx,
    y: fieldBox.y + fieldBox.height / 2 + fieldBox.height * dy,
  }
}

async function dragChipToField(page, chip, dropSpot) {
  const chipBox = await chip.boundingBox()
  if (!chipBox) throw new Error('palette chip has no bounding box')
  await page.mouse.move(chipBox.x + chipBox.width / 2, chipBox.y + chipBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(dropSpot.x, dropSpot.y, { steps: 12 })
  await page.mouse.up()
}

async function captureScenes(page, outDir) {
  // Orbs orbit continuously via rAF (OrbitField.tsx) — Playwright's click/screenshot actionability
  // never sees them "stable". The app already freezes orbiting under prefers-reduced-motion
  // (visual-theme.md §9), so emulate it for deterministic, stable-to-click screenshots.
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(BASE_URL)
  await page.evaluate(() => localStorage.clear())
  await page.reload()

  const field = page.locator('.mixer-field')
  await field.waitFor({ state: 'visible' })

  // Scene 1 — empty field.
  await page.screenshot({ path: path.join(outDir, '01-empty-field.png') })

  // Scene 2 — the 4 available synth noise sounds placed around the field (garden-rain/seaside/
  // night-stream are locked file sounds with no asset yet, see library/catalog.ts).
  const fieldBox = await field.boundingBox()
  if (!fieldBox) throw new Error('mixer field has no bounding box')
  const dropSpots = [
    fieldOffset(fieldBox, 0.3, -0.25),
    fieldOffset(fieldBox, -0.3, -0.2),
    fieldOffset(fieldBox, 0.05, 0.2),
    fieldOffset(fieldBox, -0.25, 0.05),
  ]
  const chips = page.locator('.mixer-palette-item:not(:disabled)')
  const chipCount = Math.min(await chips.count(), dropSpots.length)
  for (let i = 0; i < chipCount; i++) {
    await dragChipToField(page, chips.nth(i), dropSpots[i])
  }
  await page.locator('.mixer-orb').first().waitFor({ state: 'visible' })
  await page.locator('.mixer-orb.is-loading').first().waitFor({ state: 'detached', timeout: 5000 }).catch(() => {})
  await page.screenshot({ path: path.join(outDir, '02-mixed-orbs.png') })

  // Scene 3 — tap an orb to open its control popover.
  await page.locator('.mixer-orb').first().click()
  await page.locator('.mixer-controls[role="dialog"]').waitFor({ state: 'visible' })
  await page.screenshot({ path: path.join(outDir, '03-orb-popover.png') })

  // Scene 4 — close the popover, save a preset, scroll the sleep-timer/presets area into view.
  await page.locator('.mixer-controls-row button').first().click()
  await page.locator('.mixer-presets-save input').fill('취침 모드')
  await page.locator('.mixer-presets-save button').click()
  await page.locator('.mixer-sleep').scrollIntoViewIfNeeded()
  await page.screenshot({ path: path.join(outDir, '04-sleep-timer-presets.png') })
}

async function main() {
  const devServer = await ensureDevServer()
  const browser = await chromium.launch()
  try {
    for (const [platform, viewport] of Object.entries(VIEWPORTS)) {
      const outDir = path.join(OUT_DIR, platform)
      mkdirSync(outDir, { recursive: true })
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: viewport.deviceScaleFactor,
        isMobile: true,
        hasTouch: true,
      })
      const page = await context.newPage()
      await captureScenes(page, outDir)
      await context.close()
      console.log(`[screenshots] ${platform}: 4 scenes written to ${outDir}`)
    }
  } finally {
    await browser.close()
    devServer?.kill()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
