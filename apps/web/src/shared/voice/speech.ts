import { pickVoice, sortVoices } from './voices'

export interface SpeakOptions {
  /** A voice's `voiceURI`; null or missing for an English voice picked automatically. */
  voice?: string | null
  /** 1 is normal speed. */
  rate?: number
  /**
   * Waits for what is being said. By default whatever is being said stops: a new move makes the
   * last one old news.
   */
  queue?: boolean
}

/**
 * Reading aloud, behind one interface: a later microphone pauses listening while `speaking`
 * (`onSpeakingChange`), so the board doesn't hear itself.
 */
export interface Speaker {
  /** Whether this browser can speak at all. */
  readonly available: boolean
  /** From the moment something is handed over until the last of it is said (or stopped). */
  readonly speaking: boolean
  speak(text: string, options?: SpeakOptions): void
  cancel(): void
  onSpeakingChange(listener: (speaking: boolean) => void): () => void
  /** The browser's voices, English ones first; they can arrive after the page has loaded. */
  voices(): SpeechSynthesisVoice[]
  onVoicesChange(listener: () => void): () => void
}

/** How long a text could take at most; an utterance the browser never ends counts as said then. */
const longestMs = (text: string, rate: number) => 2000 + (text.length * 120) / rate

interface SpeechApi {
  synth: SpeechSynthesis | undefined
  Utterance: typeof SpeechSynthesisUtterance | undefined
  /** The user's languages, to pick their kind of English. */
  languages: readonly string[]
}

const browserApi = (): SpeechApi => ({
  synth: typeof window !== 'undefined' ? window.speechSynthesis : undefined,
  Utterance: typeof window !== 'undefined' ? window.SpeechSynthesisUtterance : undefined,
  languages: typeof navigator !== 'undefined' ? navigator.languages : [],
})

/**
 * The browser's speech synthesis. It never throws: without the API, or when the browser refuses
 * to speak (no voice, no user gesture yet), nothing is said and `speaking` goes back to false.
 */
export function browserSpeaker({ synth, Utterance, languages }: SpeechApi = browserApi()): Speaker {
  const pending = new Map<SpeechSynthesisUtterance, ReturnType<typeof setTimeout>>()
  const speakingListeners = new Set<(speaking: boolean) => void>()
  const voiceListeners = new Set<() => void>()
  let speaking = false
  let voiceList: SpeechSynthesisVoice[] = []

  const setSpeaking = (now: boolean) => {
    if (now === speaking) return
    speaking = now
    for (const listener of speakingListeners) {
      try {
        listener(now)
      } catch {
        // One listener's mistake doesn't stop the others hearing.
      }
    }
  }

  const done = (utterance: SpeechSynthesisUtterance) => {
    const timer = pending.get(utterance)
    // An utterance cancelled before is no longer ours to count.
    if (timer === undefined) return
    clearTimeout(timer)
    pending.delete(utterance)
    if (pending.size === 0) setSpeaking(false)
  }

  const loadVoices = () => {
    try {
      voiceList = sortVoices(synth?.getVoices() ?? [])
    } catch {
      voiceList = []
    }
    for (const listener of voiceListeners) listener()
  }

  if (synth) {
    loadVoices()
    try {
      synth.addEventListener('voiceschanged', loadVoices)
    } catch {
      // An old or stubbed engine without events: the voices as they were at the start.
    }
  }

  /** Stops everything; `speaking` is left for the caller, so speaking on doesn't flicker. */
  const stop = () => {
    for (const timer of pending.values()) clearTimeout(timer)
    pending.clear()
    try {
      synth?.cancel()
    } catch {
      // Nothing to stop.
    }
  }
  const cancel = () => {
    stop()
    setSpeaking(false)
  }

  return {
    available: synth !== undefined && Utterance !== undefined,
    get speaking() {
      return speaking
    },
    speak(text, { voice = null, rate = 1, queue = false } = {}) {
      if (!synth || !Utterance || !text.trim()) return
      if (!queue) stop()
      try {
        const utterance = new Utterance(text)
        const picked = pickVoice(voiceList, voice, languages)
        if (picked) utterance.voice = picked
        utterance.lang = picked?.lang ?? 'en-US'
        utterance.rate = rate
        utterance.addEventListener('end', () => done(utterance))
        utterance.addEventListener('error', () => done(utterance))
        // Kept in `pending` until it ends: Chrome drops the events of an utterance nothing
        // refers to any more.
        pending.set(
          utterance,
          setTimeout(() => done(utterance), longestMs(text, rate)),
        )
        setSpeaking(true)
        synth.speak(utterance)
      } catch {
        cancel()
      }
    },
    cancel,
    onSpeakingChange(listener) {
      speakingListeners.add(listener)
      return () => speakingListeners.delete(listener)
    },
    voices: () => voiceList,
    onVoicesChange(listener) {
      voiceListeners.add(listener)
      return () => voiceListeners.delete(listener)
    },
  }
}

/** The app's one speaker. */
export const speaker: Speaker = browserSpeaker()
