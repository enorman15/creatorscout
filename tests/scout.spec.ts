/**
 * Creator Scout end-to-end: one real scout through the live integrations.
 *
 * This spends real (owner-billed) credits — roughly $0.15 per run — so it is
 * opt-in: run it with `npx deepspace test run e2e --grep scout`. It proves the core
 * path (start → background scan → live results → pitch) and the privacy
 * rule (a second user sees none of the first user's creators).
 */
import { test, expect } from 'deepspace/testing'

test.setTimeout(8 * 60_000)

test('scout finds, scores, and pitches creators; other users cannot see them', async ({ users }) => {
  const [owner, rival] = await users(['Scout Tester', 'Scout Rival'])
  const page = owner.page

  await page.goto('/dashboard')
  await expect(page.getByRole('heading', { name: 'Creator Scout' })).toBeVisible({ timeout: 20_000 })

  await page.getByRole('button', { name: 'New scout' }).first().click()
  await page.getByLabel('Topic').fill('cursor ai coding')
  await page.getByLabel('What are you promoting?').fill(
    'A developer SDK that lets coding agents ship full-stack apps. Looking for creators who build with AI coding tools on camera.',
  )
  await page.getByLabel('Instagram hashtags').fill('cursorai claudecode')
  await page.getByRole('button', { name: 'Start scout' }).click()
  await expect(page.getByText('Scout started')).toBeVisible({ timeout: 20_000 })

  // The newest scout card streams job progress, then flips to done; rows
  // appear live with no reload.
  const card = page.getByTestId('scout-card').first()
  await expect(card).toContainText('cursor ai coding', { timeout: 20_000 })
  await expect(card.getByText('done', { exact: true })).toBeVisible({ timeout: 6 * 60_000 })
  console.log(`[scout card] ${await card.innerText()}`)
  await expect(page.locator('tbody tr').first()).toBeVisible()
  await page.screenshot({ path: 'test-results/scout-dashboard.png', fullPage: true })

  await page.locator('tbody tr').first().click()
  await page.getByRole('button', { name: /Draft pitch/ }).click()
  await expect(page.getByRole('button', { name: /Redraft pitch/ })).toBeVisible({ timeout: 90_000 })
  await page.screenshot({ path: 'test-results/scout-pitch.png' })

  // RBAC 'own': the rival's dashboard has none of the owner's creators.
  await rival.page.goto('/dashboard')
  await expect(rival.page.getByRole('heading', { name: 'Creator Scout' })).toBeVisible({ timeout: 20_000 })
  await expect(rival.page.getByText('No creators yet')).toBeVisible({ timeout: 20_000 })
})
