import { expect, test, type Page } from './test'
import { boardDriver } from './board'
import { FAKE_MICROPHONE, moves, say, state, storeVoiceSettings } from './voiceScript'

// Moving by speaking beyond the game pages: the opening trainers, puzzles, the notation trainer,
// and blindfold bot games. Voice is on as Settings → Voice leaves it, with the scripted engine.
test.use(FAKE_MICROPHONE)

test.beforeEach(async ({ page }) => {
  await storeVoiceSettings(page, {})
  await page.setViewportSize({ width: 1280, height: 1000 })
})

/** Says `text` until `done` holds: the page may still be setting up the position. */
async function sayUntil(page: Page, text: string, done: () => Promise<void>) {
  await expect(async () => {
    await say(page, text)
    await done()
  }).toPass({ timeout: 10_000 })
}

test('a line of the opening library is played from memory by saying its moves', async ({
  page,
}) => {
  await page.route('**/api/v1/training/openings/practice', (route) =>
    route.fulfill({ json: { verdict: 'playable', san: 'g6', fen: 'x', theory: [], replies: [] } }),
  )
  await page.goto('/training/library?id=caro-kann')
  await page
    .getByRole('region', { name: 'Named lines' })
    .getByRole('button', { name: /^Advance Variation/ })
    .first()
    .click()
  await page.getByRole('button', { name: 'Learn this line' }).first().click()
  const panel = page.getByRole('complementary', { name: 'Learn the line' })
  await panel.getByRole('button', { name: 'Play it yourself' }).click()
  await expect(panel.getByRole('status').first()).toHaveText(/^Your move/)
  await expect(state(page)).toHaveText('Hold Space and say a move')

  await say(page, 'c6')
  await expect(panel.locator('.practice-feedback')).toHaveText(/^1\.\.\.c6, right\./)
  await expect(panel.getByRole('status').first()).toHaveText(/^Your move \(move 2\)/)
  await say(page, 'g6')
  await expect(panel.locator('.practice-feedback')).toContainText('2...g6')
})

test('practice against real replies takes a spoken move', async ({ page }) => {
  const none = [0, 0, 0]
  const stats = (r: number[]) => ({
    'under-1200': r,
    '1200-1599': none,
    '1600-1999': none,
    '2000+': none,
  })
  const played: Record<string, object[]> = {
    'e4,c6': [{ san: 'a3', stats: stats([10, 0, 10]) }],
  }
  await page.route('**/api/v1/opening-library/position?*', (route) => {
    const moves = played[new URL(route.request().url()).searchParams.get('moves') ?? '']
    return moves
      ? route.fulfill({ json: { moves } })
      : route.fulfill({
          status: 404,
          contentType: 'application/problem+json',
          json: { title: 'No games', status: 404 },
        })
  })
  await page.route('**/api/v1/training/openings/practice', (route) =>
    route.fulfill({ json: { verdict: 'theory', san: 'd5', fen: 'x', theory: [], replies: [] } }),
  )
  await page.goto('/training/library?id=caro-kann')
  await page.getByRole('button', { name: 'Practise against real replies' }).click()
  const panel = page.getByRole('complementary', { name: 'Practice' })
  await expect(panel.getByRole('status').first()).toHaveText('Your move.')
  await say(page, 'pawn to d5')
  await expect(panel.locator('.practice-right')).toHaveText('2…d5 is theory.')
})

test('a puzzle from my mistakes is solved by saying the move', async ({ page }) => {
  await page.route('**/api/v1/training', (route) =>
    route.fulfill({
      json: {
        due: [
          {
            line: {
              startFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
              moves: ['e2e4', 'e7e5', 'd1h5', 'b8c6', 'h5f7', 'e8f7'],
            },
            ply: 5,
            fen: 'r1bqkbnr/pppp1ppp/2n5/4p2Q/4P3/8/PPPP1PPP/RNB1KBNR w KQkq - 2 3',
            color: 'white',
            played: '3. Qxf7+',
            verdict: 'blunder',
            best: { move: 'Bc4', uci: 'f1c4', line: '3. Bc4 Nf6' },
            game: { id: 'a', opponent: 'rival', date: '2026-11-02' },
          },
        ],
        waiting: 0,
        solved: 0,
      },
    }),
  )
  await page.route('**/api/v1/training/results', (route) =>
    route.fulfill({ json: { stored: true } }),
  )
  const tried: string[] = []
  await page.route('**/api/v1/coach/tries', (route) => {
    tried.push((route.request().postDataJSON() as { tried: string }).tried)
    return route.fulfill({ json: { verdict: 'right', san: 'Bc4', fen: 'after' } })
  })
  await page.goto('/training')
  await page.getByRole('button', { name: 'Start' }).click()
  const panel = page.getByRole('complementary', { name: 'Puzzle' })
  await expect(panel).toContainText('You played 3. Qxf7+')
  await sayUntil(page, 'Bishop c4.', () => expect(panel).toContainText('Yes, Bc4 works!'))
  expect(tried).toEqual(['f1c4'])
})

test('the notation trainer takes a square named aloud', async ({ page }) => {
  await page.goto('/training/notation')
  // Finding a square is done with a click: no microphone there.
  await expect(page.getByTestId('voice-state')).toHaveCount(0)
  await page.getByRole('button', { name: 'Name the square' }).click()
  await page.getByRole('button', { name: 'e', exact: true }).click()
  await page.getByRole('button', { name: '4', exact: true }).click()
  await expect(page.locator('cg-board square.highlight-target')).toHaveCount(1)
  await expect(state(page)).toHaveText('Hold Space and say a square')

  const score = page.getByRole('group', { name: 'Score' })
  await say(page, 'e four')
  await expect(score).toHaveText('1 right · 0 missed')
  await expect(page.getByTestId('voice-heard')).toContainText('Said e4.')
  await say(page, 'Hello there.')
  await expect(page.getByTestId('voice-heard')).toContainText('Not a square.')
  await say(page, 'd4')
  await expect(page.getByRole('status', { name: 'Answer' })).toHaveText(
    'It is e4. d4 is the red square.',
  )
  await expect(score).toHaveText('1 right · 1 missed')
})

test('blindfold hides the pieces in a bot game until it is over; a peek shows them', async ({
  page,
}) => {
  await page.goto('/bot')
  await page.getByRole('group', { name: 'Level' }).getByRole('button', { name: /^1\b/ }).click()
  await page.getByRole('group', { name: 'You play' }).getByRole('button', { name: 'White' }).click()
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await page.waitForSelector('cg-board piece')
  const hidden = page.locator('.board-blindfold')
  await expect(hidden).toHaveCount(0)

  const blindfold = page.getByRole('button', { name: 'Blindfold' })
  await blindfold.click()
  await expect(blindfold).toHaveAttribute('aria-pressed', 'true')
  await expect(hidden).toHaveCount(1)
  await expect(page.locator('cg-board piece').first()).toBeHidden()
  await expect(
    page.getByRole('status').filter({ hasText: 'The pieces are hidden until the game is over.' }),
  ).toContainText('The bot’s moves are read aloud.')

  // Held, the peek shows the pieces; let go, they are gone again.
  const peek = page.getByRole('button', { name: 'Peek' })
  const box = (await peek.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await expect(hidden).toHaveCount(0)
  await expect(page.locator('cg-board piece').first()).toBeVisible()
  await page.mouse.up()
  await expect(hidden).toHaveCount(1)

  // Moves are said as ever; the board still plays them.
  await expect(state(page)).toHaveText('Hold Space and say a move')
  await say(page, 'e4')
  await expect(moves(page).first()).toHaveAttribute('data-san', 'e4')
  await expect(moves(page)).toHaveCount(2, { timeout: 15_000 })
  await expect(hidden).toHaveCount(1)

  // Over, the game shows its pieces again.
  await page.getByRole('button', { name: 'Resign' }).click()
  await expect(page.locator('.status')).toContainText('You resigned')
  await expect(hidden).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Blindfold' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Rematch' }).click()
  await expect(hidden).toHaveCount(1)
})

test('a dragged move still plays blindfolded', async ({ page }) => {
  await storeVoiceSettings(page, { blindfold: true })
  await page.goto('/bot')
  await page.getByRole('group', { name: 'Level' }).getByRole('button', { name: /^1\b/ }).click()
  await page.getByRole('group', { name: 'You play' }).getByRole('button', { name: 'White' }).click()
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await expect(page.locator('.board-blindfold')).toHaveCount(1)
  const board = await boardDriver(page)
  await board.drag('d2', 'd4')
  await expect(moves(page).first()).toHaveAttribute('data-san', 'd4')
})
