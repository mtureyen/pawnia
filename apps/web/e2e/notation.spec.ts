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

/** The square of a file and rank on the move's own side (rank 1 is White's). */
function castlingSquares(san: string, side: 'white' | 'black'): [string, string] {
  const rank = side === 'white' ? '1' : '8'
  return [`e${rank}`, `${san === 'O-O' ? 'g' : 'c'}${rank}`]
}

const moverSide = async (page: Page) =>
  (await page.locator('.notation-side').textContent())!.startsWith('White') ? 'white' : 'black'

test('moves: play castling and a promotion given in notation', async ({ page }) => {
  await page.goto('/training/notation?part=moves')
  await expect(page.getByText('Built-in positions from well-known games.')).toBeVisible()
  await page.getByRole('button', { name: 'Castling', exact: true }).click()
  const board = await boardDriver(page)

  const san = await target(page)
  expect(['O-O', 'O-O-O']).toContain(san)
  const side = await moverSide(page)
  board.setFlipped(side === 'black')
  const [from, to] = castlingSquares(san, side)
  // A wrong move first: the h-pawn stands at home in every castling position of the set.
  const [pawnFrom, pawnTo] = side === 'white' ? ['h2', 'h3'] : ['h7', 'h6']
  await expect(async () => {
    await board.drag(pawnFrom, pawnTo)
    await expect(answer(page)).toContainText('You played', { timeout: 500 })
  }).toPass({ timeout: 5000 })
  await expect(answer(page)).toHaveText(`You played ${pawnTo}, not ${san}. Try again.`)
  await expect(score(page)).toHaveText('0 of 1 right at the first try')
  // The board takes the wrong move back; the right one still counts as found.
  await expect(async () => {
    await board.drag(from, to)
    await expect(answer(page)).toContainText('Now it is right.', { timeout: 500 })
  }).toPass({ timeout: 5000 })
  await expect(answer(page)).toContainText(
    `${san}: ${side === 'white' ? 'White' : 'Black'} castles`,
  )
  await expect(score(page)).toHaveText('0 of 1 right at the first try')

  // A promotion: the pawn goes one square on and becomes what the notation says.
  await page.getByRole('button', { name: 'Promotion', exact: true }).click()
  const promotion = await target(page)
  const [, file, rank, piece] = /^([a-h])([18])=([QRBN])/.exec(promotion.replace(/^[a-h]x/, ''))!
  // Only straight pushes in the built-in set: the pawn stands one square behind.
  expect(promotion).not.toContain('x')
  board.setFlipped((await moverSide(page)) === 'black')
  const before = `${file}${rank === '8' ? '7' : '2'}`
  const role = { Q: 'queen', R: 'rook', B: 'bishop', N: 'knight' }[piece!]!
  await expect(async () => {
    await board.drag(before, `${file}${rank}`)
    await page.getByRole('button', { name: `Promote to ${role}` }).click({ timeout: 500 })
  }).toPass({ timeout: 5000 })
  await expect(answer(page)).toContainText('Right.')
  await expect(answer(page)).toContainText(`becomes a ${role}`)
})

test('moves: name a castling move played on the board, the misses come back', async ({ page }) => {
  await page.goto('/training/notation?part=moves')
  await page.getByRole('button', { name: 'Name the move' }).click()
  await page.getByRole('button', { name: 'Castling', exact: true }).click()
  const answers = page.getByRole('group', { name: 'Answers' }).getByRole('button')

  // Which castling it was, from where the king went (the last move's squares).
  const played = async () => {
    await expect(page.locator('cg-board square.last-move')).toHaveCount(2)
    const box = (await page.locator('cg-board').boundingBox())!
    const black = (await moverSide(page)) === 'black'
    const files = await page.locator('cg-board square.last-move').evaluateAll(
      (squares, [left, width]) =>
        squares.map((s) => {
          const r = s.getBoundingClientRect()
          return Math.floor(((r.left + r.width / 2 - left!) / width!) * 8)
        }),
      [box.x, box.width],
    )
    const kingTo = files.map((f) => (black ? 7 - f : f)).find((f) => f !== 4)
    return kingTo === 6 ? 'O-O' : 'O-O-O'
  }

  const first = await played()
  await answers.filter({ hasText: new RegExp(`^\\d${first}$`) }).click()
  await expect(answer(page)).toContainText('Right.')
  await expect(score(page)).toHaveText('1 of 1 right at the first try')

  await page.getByRole('button', { name: 'Next' }).click()
  const second = await played()
  // The king's move instead of the castling sign.
  await answers.filter({ hasText: /^\dK/ }).click()
  await expect(answer(page)).toContainText(
    `Not quite: it is ${second}. Castling has its own sign, O-O or O-O-O, not the king’s move.`,
  )
  await expect(score(page)).toHaveText('1 of 2 right at the first try')

  await page.reload()
  await expect(page.getByRole('region', { name: 'Your tricky moves' })).toContainText(
    'castling (missed 1 of 2)',
  )
})

test('moves: the positions come from the user’s own games once there are some', async ({
  page,
}) => {
  // The E2E API's recorded lichess games of "DrNykterstein".
  await page.goto('/games')
  await page.getByRole('radio', { name: 'lichess' }).click()
  await page.getByRole('textbox', { name: 'lichess username' }).fill('DrNykterstein')
  await page.getByRole('button', { name: 'Import recent games' }).click()
  await expect(page.getByRole('status')).toHaveText('2 games imported, 2 new')

  await page.goto('/training/notation?part=moves')
  await expect(page.getByText('Positions from your last 2 games')).toBeVisible()
  // Captures are plenty in two games: they all come from them.
  await page.getByRole('button', { name: 'Captures', exact: true }).click()
  await expect(page.locator('.notation-side')).toContainText(/from your game .*DrNykterstein/)
  await expect(page.locator('.notation-target')).toContainText('x')
})
