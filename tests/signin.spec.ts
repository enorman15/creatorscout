import { test, expect } from '@playwright/test'

// One click from the landing page to sign-in: the protected route opens the
// sign-in overlay on arrival instead of showing a second "Sign in" button.
test('landing CTA goes straight to the sign-in options', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'Sign in to get started' }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(page.getByRole('button', { name: /Continue with Google/ })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('button', { name: /Continue with GitHub/ })).toBeVisible()
})
