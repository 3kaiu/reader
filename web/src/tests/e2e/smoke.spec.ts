import { test, expect } from '@playwright/test'

test('settings shows minimal reader-focused sections', async ({ page }) => {
  await page.goto('/#/')
  await expect(page).toHaveTitle(/Reader/i)

  await page.goto('/#/settings')
  await expect(page.getByText('源规则包（高级）')).toBeVisible()
  await expect(page.getByText('关于')).toBeVisible()
  await expect(page.locator('[data-settings-layer="general"]')).toBeVisible()
  await expect(page.locator('[data-settings-layer="advanced"]')).toHaveCount(0)
  await expect(page.getByText('个人工具箱')).toHaveCount(0)
})
