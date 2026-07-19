import { test, expect } from '@playwright/test'

test('drag a sound from the palette onto the field, reposition it, then delete it', async ({ page }) => {
  const consoleErrors: string[] = []
  const pageErrors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })
  page.on('pageerror', (err) => pageErrors.push(err.message))

  await page.goto('/')

  const field = page.locator('.mixer-field')
  // App defaults to Korean, so target the palette by position rather than a locale-specific label.
  const paletteItem = page.locator('.mixer-palette-item').first()
  await expect(paletteItem).toBeVisible()
  await expect(paletteItem).toBeEnabled() // first catalog entry is a synth noise, always available

  // L-4: sounds with no real audio asset yet are hidden from the palette entirely, not shown locked.
  await expect(page.locator('.mixer-palette-item:disabled')).toHaveCount(0)

  const fieldBox = await field.boundingBox()
  const chipBox = await paletteItem.boundingBox()
  if (!fieldBox || !chipBox) throw new Error('missing bounding box')

  const fieldCenter = { x: fieldBox.x + fieldBox.width / 2, y: fieldBox.y + fieldBox.height / 2 }
  const dropSpot = { x: fieldCenter.x + fieldBox.width * 0.2, y: fieldCenter.y - fieldBox.height * 0.1 }

  // Drag the first palette chip onto the field to place an orb.
  await page.mouse.move(chipBox.x + chipBox.width / 2, chipBox.y + chipBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(dropSpot.x, dropSpot.y, { steps: 12 })
  await page.mouse.up()

  const orb = page.locator('.mixer-orb')
  await expect(orb).toHaveCount(1)
  // Synth sound: engine.load()+play() resolve near-instantly with a real AudioContext —
  // the orb should reach the "playing" look (not stuck dimmed/loading).
  await expect(orb).not.toHaveClass(/is-loading/)
  const placedBox = await orb.boundingBox()
  if (!placedBox) throw new Error('orb not placed')

  // Reposition it: drag from its current spot to a new spot inside the field.
  const orbCenter = { x: placedBox.x + placedBox.width / 2, y: placedBox.y + placedBox.height / 2 }
  const newSpot = { x: fieldCenter.x - fieldBox.width * 0.15, y: fieldCenter.y + fieldBox.height * 0.15 }
  await page.mouse.move(orbCenter.x, orbCenter.y)
  await page.mouse.down()
  await page.mouse.move(newSpot.x, newSpot.y, { steps: 12 })
  await page.mouse.up()

  const movedBox = await orb.boundingBox()
  if (!movedBox) throw new Error('orb missing after move')
  expect(Math.hypot(movedBox.x - placedBox.x, movedBox.y - placedBox.y)).toBeGreaterThan(5)

  // Delete it by dragging into the bottom delete zone.
  const deleteSpot = { x: fieldCenter.x, y: fieldBox.y + fieldBox.height * 0.95 }
  await page.mouse.move(movedBox.x + movedBox.width / 2, movedBox.y + movedBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(deleteSpot.x, deleteSpot.y, { steps: 12 })
  await page.mouse.up()

  await expect(orb).toHaveCount(0)

  expect(consoleErrors, `console errors: ${consoleErrors.join('; ')}`).toEqual([])
  expect(pageErrors, `page errors: ${pageErrors.join('; ')}`).toEqual([])
})
