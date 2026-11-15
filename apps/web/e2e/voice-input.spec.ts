import { expect, test, type Page } from '@playwright/test'

// Voice input with the scripted engine of the E2E build (VITE_PAWNIA_VOICE=scripted): no model is
// downloaded; `window.pawniaVoiceScript` says what was "heard". The microphone is Chrome's fake
// one, so opening it and the audio path are real; it is allowed here without asking (a blocked one
// is in voice-input-blocked.spec.ts, which runs in a browser without that switch).
test.use({
  launchOptions: {
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  },
})

/** What `scriptedEngine.ts` puts on the page. */
declare global {
  interface Window {
    pawniaVoiceScript?: {
      next(text: string): void
      utter(text: string): void
      transcriptions: number
    }
  }
}

const moves = (page: Page) => page.locator('.move-tree [data-san]')
const voice = (page: Page) => page.getByRole('region', { name: 'Voice' })
const heard = (page: Page) => page.getByTestId('voice-heard')
const state = (page: Page) => page.getByTestId('voice-state')

/** Turns voice on as a first-time user does: the notice, the download, the microphone. */
async function turnOnVoice(page: Page) {
  await page.getByRole('button', { name: 'Turn on voice input' }).click()
  const notice = page.getByRole('dialog', { name: 'Voice input' })
  await expect(notice).toContainText('runs on this computer')
  await expect(notice).toContainText(/about \d+ MB once/)
  await notice.getByRole('button', { name: 'Download and turn on' }).click()
  await expect(state(page)).toHaveText('Hold Space and say a move')
}

/** Push to talk with the space bar: `text` is what the scripted engine hears. */
async function say(page: Page, text: string) {
  await page.evaluate((t) => window.pawniaVoiceScript!.next(t), text)
  await page.keyboard.down(' ')
  await expect(page.getByRole('button', { name: 'Hold to talk' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await page.waitForTimeout(700)
  await page.keyboard.up(' ')
}

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
    // Speech synthesis that says nothing and ends only when the test says so; voice settings as
    // Settings → Voice leaves them: moves read aloud on one screen, the microphone always on.
    await page.addInitScript(() => {
      const playing = new Set<EventTarget>()
      class Utterance extends EventTarget {
        text: string
        voice = null
        lang = ''
        rate = 1
        constructor(text: string) {
          super()
          this.text = text
        }
      }
      const voices = [{ voiceURI: 'test', name: 'Test', lang: 'en-US', default: true }]
      const synth = Object.assign(new EventTarget(), {
        getVoices: () => voices,
        speak: (u: Utterance) => void playing.add(u),
        cancel: () => playing.clear(),
      })
      Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true })
      Object.defineProperty(window, 'SpeechSynthesisUtterance', {
        value: Utterance,
        configurable: true,
      })
      Object.assign(window, {
        endSpeech: () => {
          for (const u of playing) u.dispatchEvent(new Event('end'))
          playing.clear()
        },
      })
      localStorage.setItem(
        'pawnia.voice',
        JSON.stringify({
          localGames: true,
          speakMoves: true,
          speechModelAccepted: true,
          listening: 'always',
        }),
      )
    })
    await page.goto('/')
    await expect(state(page)).toHaveText('Listening')

    await page.evaluate(() => window.pawniaVoiceScript!.utter('e4'))
    await expect(moves(page).first()).toHaveAttribute('data-san', 'e4')
    // The board says "e4": the listener rests and hears nothing meanwhile.
    await expect(state(page)).toHaveText('Paused')
    const before = await page.evaluate(() => window.pawniaVoiceScript!.transcriptions)
    await page.evaluate(() => window.pawniaVoiceScript!.utter('e5'))
    await page.waitForTimeout(300)
    await expect(moves(page)).toHaveCount(1)
    expect(await page.evaluate(() => window.pawniaVoiceScript!.transcriptions)).toBe(before)

    // A moment after the board is done, it listens again.
    await page.evaluate(() => (window as unknown as { endSpeech(): void }).endSpeech())
    await expect(state(page)).toHaveText('Listening')
    await page.evaluate(() => window.pawniaVoiceScript!.utter('e5'))
    await expect(moves(page).nth(1)).toHaveAttribute('data-san', 'e5')
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
