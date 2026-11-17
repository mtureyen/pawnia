import { test as base } from '@playwright/test'

export * from '@playwright/test'

/**
 * Every E2E test, with the browser's speech synthesis silenced: the board reads moves aloud, and
 * a test run must never talk through the speakers of the machine it runs on. Each utterance "ends"
 * a moment later, as a real one would. Tests that check what is said install `recordSpeech`
 * (speech.ts), which replaces this one. Specs import `test` and `expect` from here, never from
 * '@playwright/test' (the linter holds them to it).
 */
export const test = base.extend({
  page: async ({ page }, provide) => {
    await page.addInitScript(() => {
      const synth = Object.assign(new EventTarget(), {
        speaking: false,
        pending: false,
        paused: false,
        getVoices: () => [],
        speak: (utterance: EventTarget) => {
          setTimeout(() => utterance.dispatchEvent(new Event('end')), 30)
        },
        cancel: () => undefined,
        pause: () => undefined,
        resume: () => undefined,
      })
      Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true })
    })
    await provide(page)
  },
})
