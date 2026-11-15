/**
 * What voice input needs from a speech recogniser, as ports: the real one runs Whisper and Silero
 * VAD in a worker (`workerEngine.ts`), the scripted one hears what a test tells it to
 * (`scriptedEngine.ts`). Audio is always mono at 16 kHz (`SAMPLE_RATE`).
 */

export interface LoadProgress {
  loaded: number
  total: number
}

export interface SpeechEngine {
  /** Fetches the models (from the browser's cache after the first time) and starts them. */
  load(onProgress: (progress: LoadProgress) => void): Promise<{ device: string }>
  /** Whether the audio holds any speech at all (push to talk may hold only silence). */
  hasSpeech(audio: Float32Array): Promise<boolean>
  /** What was said in the audio, as Whisper writes it ("Knight f3."). */
  transcribe(audio: Float32Array): Promise<string>
  /** A detector that cuts a stream of audio into utterances (always-listening mode). */
  detector(events: DetectorEvents): UtteranceDetector
  /** Ends the worker; a later `load` starts over. */
  dispose(): void
}

export interface DetectorEvents {
  /** Someone started speaking (for the indicator; the utterance may still be dropped). */
  onSpeechStart(): void
  /** Speech that started turned out too short to be a phrase. */
  onMisfire(): void
  /** An utterance, from a little before the speech started to its end. Never silence alone. */
  onUtterance(audio: Float32Array): void
}

export interface UtteranceDetector {
  /** More audio, in any length. */
  push(audio: Float32Array): void
  /** Forget anything begun: the audio that follows is not a continuation (after a pause). */
  reset(): void
  /** No more audio comes; nothing more is reported. */
  close(): void
}
