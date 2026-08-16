import { test, expect } from '@playwright/test'

// Same viewport reason as mixer.spec.ts/sleep.spec.ts: the palette/settings panel sits below
// y=720 at the default desktop viewport.
test.use({ viewport: { width: 1280, height: 900 } })

test('screen dims after idle, audio keeps playing, and a tap wakes it back up', async ({ page }) => {
  // ponytail: e2e-only threshold override (src/screen/store.ts) — real users never define this
  // global, so this doesn't touch production behavior. Must be set before the app's first script
  // runs, hence addInitScript (not page.evaluate after goto).
  await page.addInitScript(() => {
    ;(window as unknown as { __SO_TEST_DIM_MS__: number }).__SO_TEST_DIM_MS__ = 800
  })
  await page.goto('/')

  // Place a sound so there's something to prove keeps playing through the dim.
  const field = page.locator('.mixer-field')
  const paletteItem = page.locator('.mixer-palette-item').first() // first entry is a synth noise, instant
  const fieldBox = await field.boundingBox()
  const chipBox = await paletteItem.boundingBox()
  if (!fieldBox || !chipBox) throw new Error('missing bounding box')

  const dropSpot = { x: fieldBox.x + fieldBox.width * 0.5, y: fieldBox.y + fieldBox.height * 0.5 }
  await page.mouse.move(chipBox.x + chipBox.width / 2, chipBox.y + chipBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(dropSpot.x, dropSpot.y, { steps: 12 })
  await page.mouse.up()

  const orb = page.locator('.mixer-orb')
  await expect(orb).toHaveCount(1)
  await expect(orb).not.toHaveClass(/is-loading/) // "is-loading" is reused for the sleep-timer's stopped look too

  // Screen-dim setting now lives on the settings screen, not the mixer (docs/ads-setup.md §6 —
  // the mixer stays playback-only). Open it before arming the timer. The settings screen replaces
  // the mixer in the DOM (no router, just a screen switch), so `.mixer-orb` isn't queryable again
  // until we go back — the actual audio graph lives outside React (src/mixer/engine/instance.ts)
  // and keeps playing regardless, which the final assertions below prove.
  await page.getByRole('button', { name: '설정 열기' }).click()

  // Arm the screen-dim timer (first button = the 5-minute preset; the test override above
  // replaces the real 5-minute wait with 800ms).
  await page.locator('.screen-dim-settings-row button').first().click()

  const overlay = page.locator('.screen-dim-overlay')
  await expect(overlay).toBeVisible()

  // Tap wakes it back up immediately. dispatchEvent (not .click()) deliberately skips the
  // synthetic mouse-move Playwright's click() does first — a real touchscreen tap fires
  // pointerdown as its first event with no preceding hover pointermove, and the app already
  // dismisses on pointermove too (any mouse jiggle counts as activity, same as a real cursor).
  await overlay.dispatchEvent('pointerdown')
  await expect(overlay).not.toBeVisible()

  // The core contract: dimming (and visiting the settings screen to control it) must never touch
  // the audio/mix state — the orb is still there, unaffected, back on the mixer screen.
  await page.getByRole('button', { name: '닫기' }).click()
  await expect(orb).toHaveCount(1)
  await expect(orb).not.toHaveClass(/is-loading/)
})
