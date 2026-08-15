import { test, expect } from '@playwright/test'

// Same reason as mixer.spec.ts: the category-tab toolbar pushes the palette strip below the
// default 720px viewport, and raw page.mouse coordinates don't auto-scroll to reach it.
// TODO(D2): revert to the default viewport once the header/control-group rework reclaims that
// vertical space (docs/design/visual-theme-v2.md G1/G4).
test.use({ viewport: { width: 1280, height: 900 } })

test('sleep timer presets are visible', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.mixer-sleep-timer button').first()).toBeVisible()
  const timerButtons = page.locator('.mixer-sleep-timer button')
  await expect(timerButtons).toHaveCount(6) // 5 duration presets + off
})

test('a placement survives a reload (auto-save + restore)', async ({ page }) => {
  await page.goto('/')

  const field = page.locator('.mixer-field')
  const paletteItem = page.locator('.mixer-palette-item').first()
  const fieldBox = await field.boundingBox()
  const chipBox = await paletteItem.boundingBox()
  if (!fieldBox || !chipBox) throw new Error('missing bounding box')

  const dropSpot = {
    x: fieldBox.x + fieldBox.width * 0.7,
    y: fieldBox.y + fieldBox.height * 0.4,
  }

  await page.mouse.move(chipBox.x + chipBox.width / 2, chipBox.y + chipBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(dropSpot.x, dropSpot.y, { steps: 12 })
  await page.mouse.up()

  await expect(page.locator('.mixer-orb')).toHaveCount(1)

  // auto-save is debounced ~500ms — wait for the write to actually land before reloading.
  await expect
    .poll(async () => page.evaluate(() => localStorage.getItem('so.currentMix')))
    .toContain('noise-white')

  await page.reload()

  await expect(page.locator('.mixer-orb')).toHaveCount(1)
})
