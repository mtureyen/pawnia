import { expect, test, type Page } from '@playwright/test'
import { boardDriver } from './board'

test.beforeEach(async ({ page }) => {
  // The first rank is off screen at 720 pixels.
  await page.setViewportSize({ width: 1280, height: 1000 })
})

const score = (page: Page) => page.getByLabel('Score')
const answer = (page: Page) => page.getByRole('status', { name: 'Answer' })
const target = async (page: Page) => (await page.locator('.notation-target').textContent())!

test('coordinates: find the named square on a board without labels; a miss shows it', async ({
  page,
}) => {
  await page.goto('/training/notation')
  await expect(page.getByRole('navigation', { name: 'Training' })).toBeVisible()
  await expect(page.locator('cg-board')).toBeVisible()
  // No coordinates on this board, whatever the user's setting.
  await expect(page.locator('.cg-wrap coords')).toHaveCount(0)
  const board = await boardDriver(page)

  await board.click(await target(page))
  await expect(score(page)).toHaveText('1 right · 0 missed')

  const asked = await target(page)
  const wrong = asked === 'a1' ? 'h8' : 'a1'
  await board.click(wrong)
  await expect(answer(page)).toHaveText(`That was ${wrong}. ${asked} is the green square.`)
  await expect(score(page)).toHaveText('1 right · 1 missed')
  await expect(page.locator('cg-board square.highlight-right')).toHaveCount(1)
  await expect(page.locator('cg-board square.highlight-wrong')).toHaveCount(1)
  // Then the next square comes by itself.
  await expect(answer(page)).toHaveText('')

  const weak = page.getByRole('region', { name: 'Your weak squares' })
  await expect(weak).toContainText(`Weakest: ${asked}: missed 1 of 1`)
})

test('coordinates: name a marked square in a drilled part of the board, remembered after a reload', async ({
  page,
}) => {
  await page.goto('/training/notation')
  await page.getByRole('button', { name: 'Name the square' }).click()
  await page.getByRole('button', { name: 'e', exact: true }).click()
  await page.getByRole('button', { name: '4', exact: true }).click()
  await expect(page.getByText('Only the e-file on rank 4.')).toBeVisible()

  // The only square drilled is e4: it is marked, and among the answers.
  await expect(page.locator('cg-board square.highlight-target')).toHaveCount(1)
  const answers = page.getByRole('group', { name: 'Answers' }).getByRole('button')
  await expect(answers).toHaveCount(4)
  await expect(answers.filter({ hasText: /^e4$/ })).toHaveCount(1)
  const wrong = answers.filter({ hasNotText: /^e4$/ }).first()
  const wrongName = (await wrong.textContent())!
  await wrong.click()
  await expect(answer(page)).toHaveText(`It is e4. ${wrongName} is the red square.`)
  await expect(answer(page)).toHaveText('')

  // Typed: a letter, then a number.
  await page.keyboard.press('e')
  await page.keyboard.press('4')
  await expect(score(page)).toHaveText('1 right · 1 missed')

  await page.reload()
  const weak = page.getByRole('region', { name: 'Your weak squares' })
  await expect(weak).toContainText('From White’s side')
  await expect(weak).toContainText(/Weakest: e4: missed 1 of 2/)
  await weak.getByRole('button', { name: 'Forget these stats' }).click()
  await expect(weak).toContainText('Nothing yet.')
})

test('coordinates: a timed round counts the squares found and keeps the best', async ({ page }) => {
  await page.clock.install()
  await page.goto('/training/notation')
  await page.getByRole('button', { name: '30 seconds' }).click()
  await page.getByRole('button', { name: 'Start the clock' }).click()
  // The settings wait until the round is over.
  await expect(page.getByRole('button', { name: 'Black', exact: true })).toBeDisabled()
  const board = await boardDriver(page)
  await board.click(await target(page))
  await expect(score(page)).toContainText('1 right · 0 missed')
  await board.click(await target(page))
  await expect(score(page)).toContainText('2 right · 0 missed')
  await page.clock.fastForward(31_000)
  await expect(page.getByRole('status').filter({ hasText: 'Time!' })).toHaveText(
    'Time! 2 right, 0 missed. A new best!',
  )
  await expect(page.getByRole('button', { name: 'Again' })).toBeVisible()
  await expect(page.getByText('Your best here: 2.')).toHaveCount(0)
  await page.reload()
  await page.getByRole('button', { name: '30 seconds' }).click()
  await expect(page.getByText('Your best here: 2.')).toBeVisible()
})
