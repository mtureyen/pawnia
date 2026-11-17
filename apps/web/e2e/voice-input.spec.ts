import { expect, test, type Page } from './test'
import { recordSpeech } from './speech'
import { heard, moves, say, state, storeVoiceSettings, turnOnVoice, voice } from './voiceScript'

// Voice input with the scripted engine of the E2E build (VITE_PAWNIA_VOICE=scripted): no model is
// downloaded; `window.pawniaVoiceScript` says what was "heard". The microphone is Chrome's fake
// one, so opening it and the audio path are real; it is allowed here without asking (a blocked one
// is in voice-input-blocked.spec.ts, which runs in a browser without that switch).
test.use({
  launchOptions: {
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  },
})

async function startBotGame(page: Page) {
  await page.goto('/bot')
  await page.getByRole('group', { name: 'Level' }).getByRole('button', { name: /^1\b/ }).click()
  await page.getByRole('group', { name: 'You play' }).getByRole('button', { name: 'White' }).click()
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await page.waitForSelector('cg-board')
}

test.describe('with the microphone allowed', () => {
  test('push to talk plays a move in a bot game, and the bot answers', async ({ page }) => {
    await startBotGame(page)
    await turnOnVoice(page)
    await say(page, 'Knight f3.')
    await expect(moves(page).first()).toHaveAttribute('data-san', 'Nf3')
    await expect(heard(page)).toContainText('Heard “Knight f3.”')
    await expect(heard(page)).toContainText('Played Nf3.')
    await expect(moves(page)).toHaveCount(2, { timeout: 15_000 })

    // The mic button works as the space bar does.
    await page.evaluate(() => window.pawniaVoiceScript!.next('d4'))
    const mic = page.getByRole('button', { name: 'Hold to talk' })
    const box = (await mic.boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.waitForTimeout(700)
    await page.mouse.up()
    await expect(moves(page).nth(2)).toHaveAttribute('data-san', 'd4')
  })

  test('the voice stays on for the next visit without the notice', async ({ page }) => {
    await startBotGame(page)
    await turnOnVoice(page)
    await page.goto('/')
    await expect(state(page)).toHaveText('Hold Space and say a move')
    await expect(page.getByRole('dialog', { name: 'Voice input' })).toHaveCount(0)
  })

  test('an ambiguous move is shown and resolved by a follow-up', async ({ page }) => {
    // Both knights can go to d2.
    const fen = 'rnbqkb1r/ppp1pppp/5n2/3p4/3P4/5N2/PPP1PPPP/RNBQKB1R w KQkq - 2 3'
    await page.goto(`/analysis?${new URLSearchParams({ fen })}`)
    await turnOnVoice(page)
    await say(page, 'Knight d2')
    const question = voice(page).getByRole('group', { name: 'Which move' })
    await expect(question.getByRole('button', { name: /Nbd2/ })).toBeVisible()
    await expect(question.getByRole('button', { name: /Nfd2/ })).toBeVisible()
    // The candidates as numbered arrows on the board.
    await expect(page.locator('.cg-shapes line')).toHaveCount(2)
    await expect(moves(page)).toHaveCount(0)

    await say(page, 'The one on b1.')
    await expect(moves(page).first()).toHaveAttribute('data-san', 'Nbd2')
    await expect(question).toHaveCount(0)
    await expect(heard(page)).toContainText('Played Nbd2.')
  })

  test('a candidate can be picked with a click', async ({ page }) => {
    const fen = 'rnbqkb1r/ppp1pppp/5n2/3p4/3P4/5N2/PPP1PPPP/RNBQKB1R w KQkq - 2 3'
    await page.goto('/')
    await page.fill('#import', fen)
    await page.getByRole('button', { name: 'Load' }).click()
    await turnOnVoice(page)
    await say(page, 'knight d2')
    await voice(page).getByRole('button', { name: /Nfd2/ }).click()
    await expect(moves(page).first()).toHaveAttribute('data-san', 'Nfd2')
  })

  test('commands: flip the board, and resign after a yes', async ({ page }) => {
    await startBotGame(page)
    await turnOnVoice(page)
    await say(page, 'Flip the board.')
    await expect(page.locator('.cg-wrap')).toHaveClass(/orientation-black/)
    await expect(heard(page)).toContainText('Turned the board.')

    await say(page, 'I resign.')
    await expect(voice(page).getByRole('group', { name: 'Confirm' })).toContainText(
      'Resign this game?',
    )
    await expect(page.locator('.status')).not.toContainText('resigned')
    await say(page, 'Yes.')
    await expect(page.locator('.status')).toContainText('You resigned · Black wins')
  })

  test('what is not a move is shown and ignored', async ({ page }) => {
    await page.goto('/')
    await turnOnVoice(page)
    await say(page, 'What a lovely day.')
    await expect(heard(page)).toContainText('Heard “What a lovely day.”')
    await expect(heard(page)).toContainText('Not a move here.')
    await expect(moves(page)).toHaveCount(0)
  })

  test('always listening acts on a move and ignores the rest', async ({ page }) => {
    await page.goto('/')
    await turnOnVoice(page)
    await page.getByRole('button', { name: 'Voice settings' }).click()
    await voice(page)
      .getByRole('radio', { name: /Always listening/ })
      .check()
    await expect(state(page)).toHaveText('Listening')
    const mic = page.getByRole('button', { name: 'Stop listening' })
    await expect(mic).toHaveAttribute('aria-pressed', 'true')

    await page.evaluate(() => window.pawniaVoiceScript!.utter('I think I left the oven on.'))
    await expect(heard(page)).toContainText('Not a move here.')
    await page.evaluate(() => window.pawniaVoiceScript!.utter('e4'))
    await expect(moves(page).first()).toHaveAttribute('data-san', 'e4')
    await expect(heard(page)).toContainText('Played e4.')

    // Stopped with the mic button, it hears nothing.
    await mic.click()
    await expect(state(page)).toHaveText('Not listening')
    await page.evaluate(() => window.pawniaVoiceScript!.utter('e5'))
    await page.waitForTimeout(300)
    await expect(moves(page)).toHaveCount(1)
  })

  test('always listening rests while the board reads a move aloud', async ({ page }) => {
    const speech = await recordSpeech(page, { holdUntilEnded: true })
    // As Settings → Voice leaves them: moves read aloud on one screen, always listening.
    await storeVoiceSettings(page, { localGames: true, listening: 'always' })
    await page.goto('/')
    await expect(state(page)).toHaveText('Listening')

    await page.evaluate(() => window.pawniaVoiceScript!.utter('e4'))
    await expect(moves(page).first()).toHaveAttribute('data-san', 'e4')
    expect(await speech.texts()).toEqual(['e4'])
    // The board says "e4": the listener rests and hears nothing meanwhile.
    await expect(state(page)).toHaveText('Paused')
    const before = await page.evaluate(() => window.pawniaVoiceScript!.transcriptions)
    await page.evaluate(() => window.pawniaVoiceScript!.utter('e5'))
    await page.waitForTimeout(300)
    await expect(moves(page)).toHaveCount(1)
    expect(await page.evaluate(() => window.pawniaVoiceScript!.transcriptions)).toBe(before)

    // A moment after the board is done, it listens again.
    await speech.end()
    await expect(state(page)).toHaveText('Listening')
    await page.evaluate(() => window.pawniaVoiceScript!.utter('e5'))
    await expect(moves(page).nth(1)).toHaveAttribute('data-san', 'e5')
  })

  test('push to talk while the board speaks stops it and records', async ({ page }) => {
    const speech = await recordSpeech(page, { holdUntilEnded: true })
    await storeVoiceSettings(page, { localGames: true })
    await page.goto('/')
    await expect(state(page)).toHaveText('Hold Space and say a move')
    await say(page, 'e4')
    await expect(moves(page).first()).toHaveAttribute('data-san', 'e4')
    expect(await speech.texts()).toEqual(['e4'])

    // The board is still saying "e4" when the user presses to talk.
    const cancels = await speech.cancels()
    await say(page, 'e5')
    expect(await speech.cancels()).toBeGreaterThan(cancels)
    await expect(moves(page).nth(1)).toHaveAttribute('data-san', 'e5')
  })

  test('the coach reads free words only once turned on, and its move waits for a yes', async ({
    page,
  }) => {
    const asked: unknown[] = []
    await page.route('**/api/v1/coach/spoken-moves', (route) => {
      asked.push(route.request().postDataJSON())
      return route.fulfill({ json: { move: { from: 'g1', to: 'f3', san: 'Nf3' } } })
    })
    await page.goto('/')
    await turnOnVoice(page)
    // Off by default: nothing goes to the coach.
    await say(page, 'Jump my horse out to the right.')
    await expect(heard(page)).toContainText('Not a move here.')
    await page.waitForTimeout(300)
    expect(asked).toHaveLength(0)

    await page.goto('/settings?tab=voice')
    const ask = page
      .getByRole('region', { name: 'Speaking moves' })
      .getByRole('switch', { name: 'Ask the coach when a move isn’t understood' })
    await expect(ask).toHaveAttribute('aria-checked', 'false')
    await ask.click()
    await expect(ask).toHaveAttribute('aria-checked', 'true')

    await page.goto('/')
    await expect(state(page)).toHaveText('Hold Space and say a move')
    await say(page, 'Jump my horse out to the right.')
    await expect(heard(page)).toContainText('The coach reads Nf3.')
    expect(asked).toEqual([
      {
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        said: 'Jump my horse out to the right.',
      },
    ])
    const question = voice(page).getByRole('group', { name: 'Which move' })
    await expect(question).toContainText('Did you mean')
    await expect(question.getByRole('button', { name: /Nf3/ })).toBeVisible()
    await expect(moves(page)).toHaveCount(0)
    await say(page, 'Yes.')
    await expect(moves(page).first()).toHaveAttribute('data-san', 'Nf3')
  })

  test('the coach is never asked while always listening, and may not know either', async ({
    page,
  }) => {
    const asked: unknown[] = []
    await page.route('**/api/v1/coach/spoken-moves', (route) => {
      asked.push(route.request().postDataJSON())
      return route.fulfill({ json: { move: null } })
    })
    await storeVoiceSettings(page, { askCoach: true, listening: 'always' })
    await page.goto('/')
    await expect(state(page)).toHaveText('Listening')
    await page.evaluate(() => window.pawniaVoiceScript!.utter('I think I left the oven on.'))
    await expect(heard(page)).toContainText('Not a move here.')
    await page.waitForTimeout(300)
    expect(asked).toHaveLength(0)

    await page.getByRole('button', { name: 'Voice settings' }).click()
    await voice(page)
      .getByRole('radio', { name: /Push to talk/ })
      .check()
    // Space on the focused radio would stay with the radio.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
    await say(page, 'Move the horsey.')
    await expect(heard(page)).toContainText('the coach can’t tell either')
    expect(asked).toHaveLength(1)
    await expect(moves(page)).toHaveCount(0)
  })

  test('Settings → Voice turns speaking moves on and sets how it listens', async ({ page }) => {
    await page.goto('/settings?tab=voice')
    const card = page.getByRole('region', { name: 'Speaking moves' })
    await expect(card).toContainText(/about \d+ MB/)
    const toggle = card.getByRole('switch', { name: 'Move by speaking' })
    await expect(toggle).toHaveAttribute('aria-checked', 'false')
    await toggle.click()
    await card.getByRole('radio', { name: /Always listening/ }).check()
    await expect(card.getByRole('combobox', { name: 'Microphone' })).toHaveValue('')

    // The board then needs no notice, and listens at once.
    await page.goto('/')
    await expect(page.getByRole('dialog', { name: 'Voice input' })).toHaveCount(0)
    await expect(state(page)).toHaveText('Listening')

    // The quick switch by the mic button changes the same setting.
    await page.getByRole('button', { name: 'Voice settings' }).click()
    await voice(page)
      .getByRole('radio', { name: /Push to talk/ })
      .check()
    await expect(state(page)).toHaveText('Hold Space and say a move')
    await page.goto('/settings?tab=voice')
    await expect(card.getByRole('radio', { name: /Push to talk/ })).toBeChecked()
  })
})
