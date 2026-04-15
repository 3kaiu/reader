import { test, expect } from '@playwright/test'

test('settings keeps advanced controls hidden until toolbox mode is enabled', async ({ page }) => {
  await page.goto('/#/')
  await expect(page).toHaveTitle(/Reader/i)

  await page.goto('/#/settings')
  await expect(page.getByText('个人工具箱')).toBeVisible()
  await expect(page.locator('[data-settings-layer="general"]')).toBeVisible()
  await expect(page.locator('[data-settings-layer="advanced"]')).toHaveCount(0)

  await page.getByRole('button', { name: '显示工具箱' }).click()

  await expect(page.locator('[data-settings-layer="advanced"]')).toBeVisible()
  await expect(page.getByText('高级治理与工具箱')).toBeVisible()
})
