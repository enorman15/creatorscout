import { test, expect } from 'deepspace/testing'

// Removing a scout clears its creators and hides it, but it still counts
// toward the daily limit (so delete-and-rerun can't bypass the cap). Free:
// no integrations run. Removes the OLDEST scout so ui.spec keeps its data.
test('remove scout clears it without resetting the daily count', async ({ users }) => {
  const [owner] = await users(['Scout Tester'])
  const page = owner.page
  await page.goto('/dashboard')
  const cards = page.getByTestId('scout-card')
  await expect(cards.first()).toBeVisible({ timeout: 30_000 })
  const before = await cards.count()
  test.skip(before < 2, 'needs at least two scouts')
  const todayTile = page.getByText(/^\d+ \/ 5$/)
  const usedBefore = await todayTile.innerText()

  await cards.last().getByRole('button', { name: /^Remove scout/ }).click()
  await page.getByRole('button', { name: 'Remove', exact: true }).last().click()
  await expect(page.getByText('Scout removed')).toBeVisible({ timeout: 20_000 })
  await expect(cards).toHaveCount(before - 1)
  await expect(todayTile).toHaveText(usedBefore)
})
