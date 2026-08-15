import { test, expect } from '@playwright/test'

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
