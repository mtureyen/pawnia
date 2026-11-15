import type { Page } from '@playwright/test'

export interface Said {
  text: string
  rate: number
  voice: string | undefined
}

/**
 * The browser's speech synthesis, replaced by one that says nothing and writes down what it was
 * given; each utterance "ends" a moment later, as a real one would. Never real audio.
 *
 * `holdUntilEnded`: utterances go on until the test calls `endSpeech()`, for checking what
 * happens while the board is speaking. `cancels()` counts the calls to `speechSynthesis.cancel`.
 */
export async function recordSpeech(page: Page, { holdUntilEnded = false } = {}) {
  await page.addInitScript((hold) => {
    const said: { text: string; rate: number; voice: string | undefined }[] = []
    const playing = new Set<EventTarget>()
    let cancels = 0
    const voice = (voiceURI: string, name: string, lang: string, isDefault = false) => ({
      voiceURI,
      name,
      lang,
      default: isDefault,
      localService: true,
    })
    // The default is German: an English one has to be picked.
    const voices = [
      voice('test-anna', 'Anna', 'de-DE', true),
      voice('test-daniel', 'Daniel', 'en-GB'),
      voice('test-samantha', 'Samantha', 'en-US'),
    ]
    class Utterance extends EventTarget {
      text: string
      voice: { voiceURI: string } | null = null
      lang = ''
      rate = 1
      constructor(text: string) {
        super()
        this.text = text
      }
    }
    const end = () => {
      for (const u of playing) u.dispatchEvent(new Event('end'))
      playing.clear()
    }
    const synth = Object.assign(new EventTarget(), {
      getVoices: () => voices,
      speak: (u: Utterance) => {
        said.push({ text: u.text, rate: u.rate, voice: u.voice?.voiceURI })
        playing.add(u)
        if (!hold) setTimeout(end, 30)
      },
      cancel: () => {
        cancels++
        playing.clear()
      },
    })
    Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true })
    Object.defineProperty(window, 'SpeechSynthesisUtterance', {
      value: Utterance,
      configurable: true,
    })
    Object.assign(window, { said, endSpeech: end, speechCancels: () => cancels })
  }, holdUntilEnded)
  type Recorded = { said: Said[]; endSpeech(): void; speechCancels(): number }
  const said = () => page.evaluate(() => (window as unknown as Recorded).said)
  return {
    said,
    texts: async () => (await said()).map((s) => s.text),
    end: () => page.evaluate(() => (window as unknown as Recorded).endSpeech()),
    cancels: () => page.evaluate(() => (window as unknown as Recorded).speechCancels()),
  }
}
