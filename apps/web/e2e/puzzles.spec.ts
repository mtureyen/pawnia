import { boardDriver } from './board'
import { expect, test, type Page } from './test'

// The E2E API serves the checked-in sample of lichess' puzzles (apps/api/data/puzzle-sample.json);
// the tests that need one exact puzzle hand it out themselves.

/** lichess 0000D: Black wins the queen with Rd8, Qxd8+ Bxd8. */
const QUEEN_TRAP = {
  id: '0000D',
  url: 'https://lichess.org/training/0000D',
  fen: '5rk1/1p3ppp/pq1Q1b2/8/8/1P3N2/P4PPP/3R2K1 b - - 3 27',
  opponentMove: 'd3d6',
  color: 'black',
  solution: ['f8d8', 'd6d8', 'f6d8'],
  rating: 1500,
  themes: ['advantage', 'endgame', 'short'],
}

/** Two back-rank mates; the solution names Ra8#. */
const TWO_MATES = {
  ...QUEEN_TRAP,
  id: 'mates',
  url: 'https://lichess.org/training/mates',
  fen: '7k/6pp/8/8/8/8/8/RR4K1 w - - 0 1',
  opponentMove: 'h6h7',
  color: 'white',
  solution: ['a1a8'],
  themes: ['mateIn1', 'backRankMate', 'oneMove'],
}

/** The server hands out these puzzles in turn, and keeps what was asked for. */
async function handOut(page: Page, ...puzzles: object[]) {
  const asked: { themes: string[]; rating: number; exclude: string[] }[] = []
  await page.route('**/api/v1/puzzles/next', (route) => {
    asked.push(route.request().postDataJSON())
    const puzzle = puzzles[asked.length - 1]
    return puzzle
      ? route.fulfill({ json: puzzle })
      : route.fulfill({
          status: 404,
          contentType: 'application/problem+json',
          json: { title: 'No puzzle left', status: 404 },
        })
  })
  return asked
}

const panel = (page: Page) => page.getByRole('complementary', { name: 'Puzzle' })
const feedback = (page: Page) => panel(page).locator('.practice-feedback')

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 })
})

test('puzzles from the library: pick a theme, solve one, the answer shown, the next one', async ({
  page,
}) => {
  await page.goto('/training')
  await page
    .getByRole('navigation', { name: 'Training' })
    .getByRole('link', { name: 'Puzzles' })
    .click()
  await expect(page.getByRole('heading', { name: 'Puzzles' })).toBeVisible()
  await expect(
    page.getByText(/puzzles from the lichess puzzle database \(CC0-1\.0\)/),
  ).toBeVisible()
  // Motifs and mates to pick from, by name.
  const theme = page.getByRole('combobox', { name: 'Theme' })
  await expect(theme.locator('option', { hasText: /^Fork \(\d+\)$/ })).toHaveCount(1)

  await page.getByRole('button', { name: 'Solve a puzzle' }).click()
  await expect(panel(page).getByRole('heading')).toHaveText(
    /^Find the best move for (White|Black)$/,
  )
  // The themes would give it away: not before it's over.
  await expect(panel(page).getByRole('list', { name: 'Themes' })).toHaveCount(0)
  await panel(page).getByRole('button', { name: 'Show the answer' }).click()
  await expect(panel(page).getByRole('heading')).toHaveText('The answer', { timeout: 15_000 })
  await expect(
    panel(page).getByRole('list', { name: 'Themes' }).getByRole('listitem'),
  ).not.toHaveCount(0)
  await expect(panel(page).getByRole('link', { name: 'This puzzle on lichess' })).toHaveAttribute(
    'href',
    /^https:\/\/lichess\.org\/training\/\w+$/,
  )
  await expect(page.getByRole('status', { name: 'This visit' })).toHaveText(
    '0 of 1 solved at the first try',
  )
  await panel(page).getByRole('button', { name: 'Next puzzle' }).click()
  await expect(panel(page).getByRole('heading')).toHaveText(/^Find the best move for/)
})

test('a wrong move costs the first try; the opponent answers; the line solves it', async ({
  page,
}) => {
  const asked = await handOut(page, QUEEN_TRAP)
  await page.goto('/training/puzzles')
  await page.getByRole('combobox', { name: 'Rating' }).selectOption('1600')
  await page.getByRole('combobox', { name: 'Theme' }).selectOption('fork')
  await page.getByRole('button', { name: 'Solve a puzzle' }).click()
  await expect(panel(page).getByRole('heading')).toHaveText('Find the best move for Black')
  expect(asked).toEqual([{ themes: ['fork'], rating: 1600, exclude: [] }])

  const board = await boardDriver(page)
  board.setFlipped(true)
  await board.drag('b6', 'd4')
  await expect(feedback(page)).toHaveText('That’s not it. Try another move.')
  await expect(page.locator('cg-board piece.queen.black')).toHaveCount(1)
  await board.drag('f8', 'd8')
  await expect(feedback(page)).toHaveText('Right. Keep going.')
  // The opponent takes on d8; then it's Black's move again.
  await expect(panel(page).getByRole('status').first()).toHaveText('Black to play.')
  await board.drag('f6', 'd8')
  await expect(feedback(page)).toHaveText('Solved.')
  await expect(panel(page).getByRole('heading')).toHaveText('Solved')
  await expect(panel(page).getByRole('status').first()).toHaveText('Puzzle rated 1500.')
  await expect(panel(page).getByRole('list', { name: 'Themes' })).toHaveText(
    /Wins an advantage.*Endgame.*Short \(2 moves\)/,
  )
  await expect(page.getByRole('status', { name: 'This visit' })).toHaveText(
    '0 of 1 solved at the first try',
  )

  // None left: said so, and the solved one was left out.
  await panel(page).getByRole('button', { name: 'Next puzzle' }).click()
  await expect(page.getByText('No puzzle left with this theme.')).toBeVisible()
  expect(asked[1]).toEqual({ themes: ['fork'], rating: 1600, exclude: ['0000D'] })
})

test('any mate solves it, as on lichess; a hint marks the piece and costs the first try', async ({
  page,
}) => {
  await handOut(page, TWO_MATES, TWO_MATES)
  await page.goto('/training/puzzles')
  await page.getByRole('button', { name: 'Solve a puzzle' }).click()
  const board = await boardDriver(page)
  await board.drag('b1', 'b8')
  await expect(feedback(page)).toHaveText('Solved at the first try!')
  await expect(panel(page).getByRole('list', { name: 'Themes' })).toHaveText(
    /Mate in 1.*Back rank mate.*One move/,
  )
  await expect(page.getByRole('status', { name: 'This visit' })).toHaveText(
    '1 of 1 solved at the first try',
  )

  await panel(page).getByRole('button', { name: 'Next puzzle' }).click()
  const hint = panel(page).getByRole('button', { name: 'Hint' })
  await hint.click()
  await expect(hint).toBeDisabled()
  await expect(page.locator('svg.cg-shapes circle')).toHaveCount(1)
  await board.drag('a1', 'a8')
  await expect(feedback(page)).toHaveText('Solved.')
  await expect(page.getByRole('status', { name: 'This visit' })).toHaveText(
    '1 of 2 solved at the first try',
  )
})

test('without a puzzle set on the server, the page says how to fetch one', async ({ page }) => {
  await page.route('**/api/v1/puzzles', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/problem+json',
      json: { title: 'No puzzles', status: 503 },
    }),
  )
  await page.goto('/training/puzzles')
  await expect(page.getByRole('alert')).toContainText('This server has no puzzles yet.')
  await expect(page.getByRole('alert')).toContainText('bun run puzzles:fetch')
  await expect(page.getByRole('button', { name: 'Solve a puzzle' })).toHaveCount(0)
})
