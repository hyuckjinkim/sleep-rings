import { test, expect } from '@playwright/test'

test('navigates from the mixer to the settings screen and back, and the screen-dim setting works there', async ({ page }) => {
  await page.goto('/')

  await expect(page.locator('.mixer-field')).toBeVisible()

  await page.getByRole('button', { name: '설정 열기' }).click()
  await expect(page.getByRole('dialog', { name: '설정' })).toBeVisible()
  await expect(page.locator('.mixer-field')).toHaveCount(0) // mixer unmounts while settings is open

  // Screen-dim setting lives here now (docs/ads-setup.md §6) — prove it's actually wired, not
  // just present in the DOM.
  const offButton = page.locator('.screen-dim-settings-row button').last() // 4th preset = "off"
  await expect(offButton).toHaveAttribute('aria-pressed', 'true') // default is off

  await page.locator('.screen-dim-settings-row button').first().click() // 5-minute preset
  await expect(page.locator('.screen-dim-settings-row button').first()).toHaveAttribute('aria-pressed', 'true')
  await expect(offButton).toHaveAttribute('aria-pressed', 'false')

  await page.getByRole('button', { name: '닫기' }).click()
  await expect(page.locator('.mixer-field')).toBeVisible()
  await expect(page.getByRole('dialog', { name: '설정' })).toHaveCount(0)
})
