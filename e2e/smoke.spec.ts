import { test, expect } from '@playwright/test'

test('shows the app title on load', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'SleepRings' })).toBeVisible()
})
