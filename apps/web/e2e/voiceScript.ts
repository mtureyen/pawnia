import { expect, type Page } from '@playwright/test'

// Voice input in E2E runs on the scripted engine of the E2E build (VITE_PAWNIA_VOICE=scripted):
// no model is downloaded; `window.pawniaVoiceScript` says what was "heard".

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

export const moves = (page: Page) => page.locator('.move-tree [data-san]')
export const voice = (page: Page) => page.getByRole('region', { name: 'Voice' })
export const heard = (page: Page) => page.getByTestId('voice-heard')
export const state = (page: Page) => page.getByTestId('voice-state')

/** Turns voice on as a first-time user does: the notice, the download, the microphone. */
export async function turnOnVoice(page: Page) {
  await page.getByRole('button', { name: 'Turn on voice input' }).click()
  const notice = page.getByRole('dialog', { name: 'Voice input' })
  await expect(notice).toContainText('runs on this computer')
  await expect(notice).toContainText(/about \d+ MB once/)
  await notice.getByRole('button', { name: 'Download and turn on' }).click()
  await expect(state(page)).toHaveText('Hold Space and say a move')
}

/** Push to talk with the space bar: `text` is what the scripted engine hears. */
export async function say(page: Page, text: string) {
  // Ready to hear: the model loaded and the microphone open.
  await expect(state(page)).toHaveText(/^Hold Space and say /)
  await page.evaluate((t) => window.pawniaVoiceScript!.next(t), text)
  await page.keyboard.down(' ')
  await expect(page.getByRole('button', { name: 'Hold to talk' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await page.waitForTimeout(700)
  await page.keyboard.up(' ')
}

/** Voice settings as Settings → Voice leaves them, with speaking moves on and agreed to. */
export async function storeVoiceSettings(page: Page, settings: Record<string, unknown>) {
  await page.addInitScript(
    (value) => {
      localStorage.setItem('pawnia.voice', JSON.stringify(value))
    },
    { speakMoves: true, speechModelAccepted: true, ...settings },
  )
}

/** Chrome's fake microphone, allowed without asking: opening it and the audio path are real. */
export const FAKE_MICROPHONE = {
  launchOptions: {
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  },
}
