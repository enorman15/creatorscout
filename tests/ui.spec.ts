/**
 * Dashboard UI against data an earlier scout already wrote — no Apify, so it
 * is cheap to run. Requires the 'Scout Tester' account to own creators (run
 * scout.spec.ts once first). Drafting one pitch costs ~$0.01 of Claude.
 */
import { test, expect } from 'deepspace/testing'

test.setTimeout(3 * 60_000)

test('table, filters, pipeline board, and creator panel work on saved creators', async ({ users }) => {
  const [owner] = await users(['Scout Tester'])
  const page = owner.page
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/dashboard')
  await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 30_000 })
  await page.screenshot({ path: 'test-results/ui-table.png' })
  await page.getByRole('button', { name: /^Instagram/ }).click()
  await page.screenshot({ path: 'test-results/ui-instagram.png' })
  await page.getByRole('button', { name: /^All/ }).click()

  // Platform filter narrows the table to one platform.
  await page.getByRole('button', { name: /^TikTok/ }).click()
  const tiktokRows = await page.locator('tbody tr').count()
  expect(tiktokRows).toBeGreaterThan(0)
  await expect(page.locator('tbody tr').first()).toContainText('TikTok')

  // Creator panel: stats, evidence posts, stage change.
  await page.locator('tbody tr').first().click()
  await expect(page.getByText('Content we found')).toBeVisible()
  await page.getByRole('button', { name: 'Shortlisted', exact: true }).click()
  const pitchBox = page.locator('p.whitespace-pre-wrap')
  const before = (await pitchBox.count()) ? await pitchBox.innerText() : ''
  await page.getByRole('button', { name: /Draft pitch|Redraft pitch/ }).click()
  // Wait for the NEW draft to land (an older pitch may already be showing).
  await expect.poll(async () => ((await pitchBox.count()) ? await pitchBox.innerText() : before), { timeout: 90_000 }).not.toBe(before)
  const pitch = await page.locator('p.whitespace-pre-wrap').innerText()
  console.log(`[pitch text]\n${pitch}`)
  expect(pitch).not.toMatch(/[—–!]/)
  await page.screenshot({ path: 'test-results/ui-panel.png' })
  await page.getByRole('button', { name: 'Close' }).first().click()

  // The stage change is live: the stat tile counts it without a reload.
  await expect(page.getByText('Shortlisted').first()).toBeVisible()
  await page.getByRole('button', { name: /^All/ }).click()
  await page.getByRole('button', { name: 'Pipeline' }).click()
  await expect(page.getByText('Shortlisted').nth(1)).toBeVisible()
  await page.screenshot({ path: 'test-results/ui-board.png' })
})
