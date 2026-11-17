import { sayMove } from '@pawnia/chess'
import { expect, test, type Page } from './test'
import { boardDriver } from './board'
import { recordSpeech } from './speech'

test.use({ viewport: { width: 1280, height: 1000 } })

const moves = (page: Page) => page.locator('.move-tree [data-san]')

async function startBotGame(page: Page) {
  await page.goto('/bot')
  const group = (name: string) => page.getByRole('group', { name })
  await group('Level').getByRole('button', { name: /^1\b/ }).click()
  await group('You play').getByRole('button', { name: 'White', exact: true }).click()
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  return boardDriver(page)
}

type Board = Awaited<ReturnType<typeof boardDriver>>

/** Plays the user's move (dragged again if a drag didn't take), then waits for the bot's. */
async function playAgainstBot(page: Page, board: Board, from: string, to: string) {
  const before = await moves(page).count()
  await expect(async () => {
    if ((await moves(page).count()) === before) await board.drag(from, to)
    await expect(moves(page)).toHaveCount(before + 1, { timeout: 1000 })
  }).toPass({ timeout: 10_000 })
  await expect(moves(page)).toHaveCount(before + 2, { timeout: 15_000 })
  return (await moves(page).last().getAttribute('data-san'))!
}

const speakerToggle = (page: Page) => page.getByRole('button', { name: 'Read moves aloud' })

test("a bot game reads the bot's moves, not the user's, and how it ended", async ({ page }) => {
  const speech = await recordSpeech(page)
  const board = await startBotGame(page)
  await expect(speakerToggle(page)).toHaveAttribute('aria-pressed', 'true')

  const reply = await playAgainstBot(page, board, 'e2', 'e4')
  await expect.poll(speech.texts).toEqual([sayMove(reply)])
  // An English voice, though the browser's default is German.
  expect((await speech.said())[0]).toMatchObject({ rate: 1, voice: 'test-samantha' })

  await page.getByRole('button', { name: 'Resign' }).click()
  await expect.poll(speech.texts).toEqual([sayMove(reply), 'you resigned'])
})

test('the speaker on the panel mutes the game, and stays muted', async ({ page }) => {
  const speech = await recordSpeech(page)
  const board = await startBotGame(page)
  await speakerToggle(page).click()
  await expect(speakerToggle(page)).toHaveAttribute('aria-pressed', 'false')
  await playAgainstBot(page, board, 'e2', 'e4')
  await playAgainstBot(page, board, 'd2', 'd4')
  expect(await speech.texts()).toEqual([])

  // Remembered in this browser, and the same switch as in Settings.
  await page.reload()
  await startBotGame(page)
  await expect(speakerToggle(page)).toHaveAttribute('aria-pressed', 'false')
  await page.goto('/settings?tab=voice')
  await expect(page.getByRole('switch', { name: 'In bot games' })).toHaveAttribute(
    'aria-checked',
    'false',
  )
})

test('the Voice tab sets what is read, the voice and the speed, and remembers them', async ({
  page,
}) => {
  const speech = await recordSpeech(page)
  await page.goto('/settings')
  await page.getByRole('tab', { name: 'Voice' }).click()
  await expect(page).toHaveURL(/tab=voice/)

  const toggle = (name: string) => page.getByRole('switch', { name })
  // On in bot games only, until told otherwise.
  await expect(toggle('In bot games')).toHaveAttribute('aria-checked', 'true')
  for (const name of [
    'My own moves too',
    'The coach’s comments',
    'In games on one screen',
    'On the analysis board',
  ])
    await expect(toggle(name)).toHaveAttribute('aria-checked', 'false')

  // English voices first.
  const voice = page.getByRole('combobox', { name: 'Voice' })
  await expect(voice.locator('option')).toHaveText([
    'Automatic (an English voice)',
    'Daniel (en-GB)',
    'Samantha (en-US)',
    'Anna (de-DE)',
  ])
  await voice.selectOption({ label: 'Daniel (en-GB)' })
  const speed = page.getByRole('slider', { name: /Speed/ })
  await speed.focus()
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight')
  await expect(page.getByText('1.3×')).toBeVisible()
  await toggle('My own moves too').click()

  await page.getByRole('button', { name: 'Try it' }).click()
  await expect
    .poll(speech.said)
    .toEqual([
      { text: 'knight f3. e takes d5, check. castles kingside.', rate: 1.3, voice: 'test-daniel' },
    ])

  // Muting bot games greys out what belongs to them.
  await toggle('In bot games').click()
  await expect(toggle('My own moves too')).toBeDisabled()
  await toggle('In bot games').click()

  await page.reload()
  await expect(voice).toHaveValue('test-daniel')
  await expect(page.getByText('1.3×')).toBeVisible()
  await expect(toggle('My own moves too')).toHaveAttribute('aria-checked', 'true')

  // And a bot game now reads the user's moves too, with that voice (the record starts afresh
  // with the page).
  const board = await startBotGame(page)
  const reply = await playAgainstBot(page, board, 'g1', 'f3')
  await expect.poll(speech.texts).toEqual(['knight f3', sayMove(reply)])
  expect((await speech.said()).at(-1)).toMatchObject({ rate: 1.3, voice: 'test-daniel' })
})

test('a game on one screen is read only when switched on, the end included', async ({ page }) => {
  const speech = await recordSpeech(page)
  await page.goto('/')
  const board = await boardDriver(page)
  await expect(speakerToggle(page)).toHaveAttribute('aria-pressed', 'false')
  await board.play(['f2', 'f3'])
  expect(await speech.texts()).toEqual([])

  await speakerToggle(page).click()
  await board.play(['e7', 'e5'], ['g2', 'g4'], ['d8', 'h4'])
  await expect.poll(speech.texts).toEqual(['e5', 'g4', 'queen h4, checkmate, black wins'])
})

test('the analysis board reads moves only while stepping, and only when switched on', async ({
  page,
}) => {
  const speech = await recordSpeech(page)
  const pgn = '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Bxc6 dxc6 5. O-O *'
  await page.goto(`/analysis?${new URLSearchParams({ pgn })}`)
  await page.waitForSelector('cg-board')
  await page.keyboard.press('ArrowLeft')
  await expect(page.locator('.move-tree .move-current')).toHaveText('dxc6')
  expect(await speech.texts()).toEqual([])

  await page.goto('/settings?tab=voice')
  await page.getByRole('switch', { name: 'On the analysis board' }).click()
  await page.goto(`/analysis?${new URLSearchParams({ pgn })}`)
  await page.waitForSelector('cg-board')
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ArrowLeft')
  await page.getByTitle('Forward (→)').click()
  await expect.poll(speech.texts).toEqual(['d takes c6', 'bishop takes c6', 'd takes c6'])

  // A click in the move list isn't stepping: nothing more is said.
  await page.locator('.move-tree [data-san="Nf3"]').click()
  await expect(page.locator('.move-tree .move-current')).toHaveText('Nf3')
  await page.keyboard.press('End')
  await expect
    .poll(speech.texts)
    .toEqual(['d takes c6', 'bishop takes c6', 'd takes c6', 'castles kingside'])
})

test("the coach's comment is read after the move, when switched on", async ({ page }) => {
  const speech = await recordSpeech(page)
  const COMMENT = 'That weakened the **squares** around your king.'
  // An engine that likes every position except after White's third move; a coach that is ready.
  await page.route('**/api/v1/engine', (route) =>
    route.fulfill({ json: { available: true, name: 'FakeFish 9', parallelism: 4 } }),
  )
  await page.route('**/api/v1/engine/evaluations', async (route) => {
    const { fens } = route.request().postDataJSON() as { fens: string[] }
    const lines = fens.map((fen, index) => {
      const [, turn, , , , moveNumber] = fen.split(' ')
      const value = turn === 'b' && Number(moveNumber) >= 3 ? -900 : 0
      const eval_ = {
        depth: 12,
        lines: [{ rank: 1, depth: 12, score: { type: 'cp', value }, pv: ['e2e4', 'e7e5'] }],
      }
      return JSON.stringify({ type: 'evaluated', index, eval: eval_ })
    })
    await route.fulfill({
      contentType: 'application/x-ndjson',
      body: [...lines, JSON.stringify({ type: 'done' })].join('\n') + '\n',
    })
  })
  await page.route('**/api/v1/coach', (route) =>
    route.fulfill({
      json: { agents: [{ id: 'claude-api', label: 'Claude (test)', available: true }] },
    }),
  )
  await page.route('**/api/v1/coach/comments', (route) =>
    route.fulfill({ json: { text: COMMENT } }),
  )

  await page.goto('/settings?tab=voice')
  await page.getByRole('switch', { name: 'The coach’s comments' }).click()
  await page.goto('/bot')
  await page.getByRole('switch', { name: 'Coach comments' }).check()
  const board = await startBotGame(page)
  const replies: string[] = []
  for (const [from, to] of [
    ['a2', 'a3'],
    ['h2', 'h3'],
    ['g2', 'g3'],
  ] as const)
    replies.push(await playAgainstBot(page, board, from, to))

  await expect(page.getByRole('list', { name: 'Coach comments' })).toContainText('weakened')
  // After the bot's moves so far; the comment may come before or after the reply to g3.
  const comment = 'About g3: That weakened the squares around your king.'
  await expect.poll(speech.texts).toHaveLength(4)
  const texts = await speech.texts()
  expect(texts.slice(0, 2)).toEqual(replies.slice(0, 2).map(sayMove))
  expect(texts.slice(2).sort()).toEqual([comment, sayMove(replies[2]!)].sort())
})
