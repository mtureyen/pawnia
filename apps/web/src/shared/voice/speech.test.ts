import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { browserSpeaker } from './speech'

/** A speech engine that says nothing and ends an utterance when told to. */
class FakeUtterance extends EventTarget {
  voice: unknown = null
  lang = ''
  rate = 1
  text: string
  constructor(text: string) {
    super()
    this.text = text
  }
}

function fakeSynth(voices: { voiceURI: string; name: string; lang: string; default: boolean }[]) {
  const queue: FakeUtterance[] = []
  const synth = Object.assign(new EventTarget(), {
    getVoices: () => voices,
    speak: (u: FakeUtterance) => queue.push(u),
    cancel: () => {
      // Like Chrome: a cancelled utterance reports an error.
      for (const u of queue.splice(0)) u.dispatchEvent(new Event('error'))
    },
    finish: () => queue.shift()?.dispatchEvent(new Event('end')),
    queue,
  })
  return synth
}

const english = { voiceURI: 'uri:Samantha', name: 'Samantha', lang: 'en-US', default: false }
const german = { voiceURI: 'uri:Anna', name: 'Anna', lang: 'de-DE', default: true }

function setup() {
  const synth = fakeSynth([german, english])
  const speaker = browserSpeaker({
    synth: synth as unknown as SpeechSynthesis,
    Utterance: FakeUtterance as unknown as typeof SpeechSynthesisUtterance,
    languages: ['en-US'],
  })
  const changes: boolean[] = []
  speaker.onSpeakingChange((speaking) => changes.push(speaking))
  return { synth, speaker, changes }
}

describe('browserSpeaker', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('speaks with an English voice at the given rate, and tells when it starts and ends', () => {
    const { synth, speaker, changes } = setup()
    expect(speaker.voices().map((v) => v.name)).toEqual(['Samantha', 'Anna'])
    speaker.speak('knight f3', { rate: 1.3 })
    const [said] = synth.queue
    expect(said).toMatchObject({ text: 'knight f3', voice: english, lang: 'en-US', rate: 1.3 })
    expect(speaker.speaking).toBe(true)
    synth.finish()
    expect(speaker.speaking).toBe(false)
    expect(changes).toEqual([true, false])
  })

  it('stops what is being said for something new, without flickering', () => {
    const { synth, speaker, changes } = setup()
    speaker.speak('e4')
    speaker.speak('e takes d5')
    expect(synth.queue.map((u) => u.text)).toEqual(['e takes d5'])
    expect(changes).toEqual([true])
    synth.finish()
    expect(changes).toEqual([true, false])
  })

  it('queues when asked, and is speaking until the last is said', () => {
    const { synth, speaker } = setup()
    speaker.speak('knight f3')
    speaker.speak('a fine move', { queue: true })
    synth.finish()
    expect(speaker.speaking).toBe(true)
    synth.finish()
    expect(speaker.speaking).toBe(false)
  })

  it('counts an utterance the engine never ends as said after a while', () => {
    const { speaker } = setup()
    speaker.speak('castles kingside')
    vi.advanceTimersByTime(10_000)
    expect(speaker.speaking).toBe(false)
  })

  it('cancels', () => {
    const { synth, speaker, changes } = setup()
    speaker.speak('e4')
    speaker.cancel()
    expect(synth.queue).toEqual([])
    expect(changes).toEqual([true, false])
  })

  it('does nothing, and never throws, without speech synthesis', () => {
    const speaker = browserSpeaker({ synth: undefined, Utterance: undefined, languages: [] })
    expect(speaker.available).toBe(false)
    expect(() => speaker.speak('e4')).not.toThrow()
    expect(speaker.speaking).toBe(false)
    expect(speaker.voices()).toEqual([])
  })

  it('stays quiet when the engine refuses', () => {
    const synth = fakeSynth([english])
    synth.speak = () => {
      throw new Error('not allowed')
    }
    const speaker = browserSpeaker({
      synth: synth as unknown as SpeechSynthesis,
      Utterance: FakeUtterance as unknown as typeof SpeechSynthesisUtterance,
      languages: [],
    })
    expect(() => speaker.speak('e4')).not.toThrow()
    expect(speaker.speaking).toBe(false)
  })
})
