/**
 * A speech engine that hears what it is told, for end-to-end tests: no model is downloaded and
 * nothing is recognised. The build picks it with VITE_PAWNIA_VOICE=scripted (see
 * `createSpeechEngine`); tests drive it through `window.pawniaVoiceScript`:
 *
 * - `next(text)`: the next transcription (push to talk) returns `text`.
 * - `utter(text)`: in always-listening mode, someone just said `text`, as an utterance the
 *   detector cut out of the stream.
 * - `pause()`, `resume()`: what the board's speech will call (`pauseListening`, `resumeListening`).
 * - `transcriptions`: how many transcriptions ran, to check that a paused listener ran none.
 */
import type { DetectorEvents, SpeechEngine } from './ports'

export interface VoiceScript {
  next(text: string): void
  utter(text: string): void
  pause(): void
  resume(): void
  transcriptions: number
}

declare global {
  interface Window {
    pawniaVoiceScript?: VoiceScript
  }
}

/** `listening` is the session's pause and resume, which the script hands to tests. */
export function createScriptedEngine(listening: { pause(): void; resume(): void }): SpeechEngine {
  const queue: string[] = []
  /** An utterance's text goes with its audio: one dropped (paused) leaves nothing behind. */
  const said = new WeakMap<Float32Array, string>()
  const detectors = new Set<DetectorEvents>()
  const script: VoiceScript = {
    next: (text) => void queue.push(text),
    utter: (text) => {
      for (const events of detectors) {
        const audio = new Float32Array(16_000)
        said.set(audio, text)
        events.onSpeechStart()
        events.onUtterance(audio)
      }
    },
    pause: listening.pause,
    resume: listening.resume,
    transcriptions: 0,
  }
  window.pawniaVoiceScript = script

  return {
    load: async (onProgress) => {
      // A few steps, so the progress bar shows.
      for (const share of [0.25, 0.6, 1]) {
        await new Promise((resolve) => setTimeout(resolve, 80))
        onProgress({ loaded: share * 100, total: 100 })
      }
      return { device: 'scripted' }
    },
    hasSpeech: async () => true,
    transcribe: async (audio) => {
      script.transcriptions++
      await new Promise((resolve) => setTimeout(resolve, 30))
      return said.get(audio) ?? queue.shift() ?? ''
    },
    detector: (events) => {
      detectors.add(events)
      return {
        push: () => undefined,
        reset: () => undefined,
        close: () => void detectors.delete(events),
      }
    },
    dispose: () => {
      detectors.clear()
      queue.length = 0
    },
  }
}
