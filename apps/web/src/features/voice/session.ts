/**
 * Voice input for the whole app, once: the speech engine (loaded the first time voice is turned
 * on, then kept while the app is open), the microphone (open while a page that takes voice is
 * shown), push to talk and always listening. Its settings are the shared voice settings
 * (Settings → Voice); a change made there takes effect here at once. Pages see it through
 * `useVoice`; what a transcript means for the board is theirs to decide (`decide.ts`).
 */
import { useSyncExternalStore } from 'react'
import { speaker } from '@/shared/voice/speech'
import type { ListeningMode, VoiceSettings } from '@/shared/voice/voiceSettings'
import { onVoiceSettingsChange, setVoiceSettings, voiceSettings } from '@/shared/voice/voiceStore'
import { MicrophoneError, openMicrophone, type Microphone } from './microphone'
import { SAMPLE_RATE } from './model'
import type { SpeechEngine, UtteranceDetector } from './ports'
import { concat } from './segmenter'

export type EngineState =
  | { kind: 'off' }
  /** The first-time notice about the download is shown. */
  | { kind: 'notice' }
  | { kind: 'loading'; share: number }
  | { kind: 'ready'; device: string }
  | { kind: 'failed'; message: string }

export type MicState =
  | { kind: 'closed' }
  | { kind: 'opening' }
  | { kind: 'open'; label: string }
  | { kind: 'failed'; reason: MicrophoneError['reason']; message: string }

export interface VoiceSnapshot {
  settings: VoiceSettings
  engine: EngineState
  mic: MicState
  /** The push-to-talk key or button is held. */
  holding: boolean
  /** Always listening: someone is speaking right now. */
  hearing: boolean
  /** A transcription is running (the listener rests meanwhile). */
  transcribing: boolean
  /** Always listening rests while the board reads aloud, so it doesn't hear itself. */
  paused: boolean
  /** The user switched always listening off for now with the mic button. */
  muted: boolean
}

/** What a page gets: what was said, and how (always listening acts more carefully). */
export type TranscriptHandler = (text: string, via: 'push' | 'listen') => void
/** What went wrong with one utterance, for the page to show. */
export type NoteHandler = (note: string) => void

/** Shorter than this, a press was a tap, not something said. */
const MIN_PUSH_SECONDS = 0.3
/** Audio kept from just before a press: people start speaking as they press. */
const PRE_ROLL_SECONDS = 0.25
/** The microphone stays open this long after the last page with voice closed (page changes). */
const CLOSE_AFTER_MS = 1500
/**
 * Listening resumes this long after the board stops speaking: `speaking` turns false when the
 * browser says the sentence ended, while its last sound may still be in the speakers and the
 * room, and in the detector's frames.
 */
const SPEECH_TAIL_MS = 400

let snapshot: VoiceSnapshot = {
  settings: voiceSettings(),
  engine: { kind: 'off' },
  mic: { kind: 'closed' },
  holding: false,
  hearing: false,
  transcribing: false,
  paused: speaker.speaking,
  muted: false,
}
const listeners = new Set<() => void>()
const pages: { onText: TranscriptHandler; onNote: NoteHandler }[] = []

let engine: SpeechEngine | undefined
let engineLoad: Promise<void> | undefined
let microphone: Microphone | undefined
let micOpening: Promise<void> | undefined
let detector: UtteranceDetector | undefined
let closeTimer: ReturnType<typeof setTimeout> | undefined
let recording: Float32Array[] = []
let preRoll: Float32Array[] = []
let preRollLength = 0

function set(change: Partial<VoiceSnapshot>) {
  snapshot = { ...snapshot, ...change }
  for (const listener of listeners) listener()
}

const page = () => pages.at(-1)

export function useVoiceSession(): VoiceSnapshot {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => snapshot,
  )
}

/** Picks the engine: the scripted one in end-to-end test builds, else Whisper in a worker. */
async function createSpeechEngine(): Promise<SpeechEngine> {
  if (import.meta.env.VITE_PAWNIA_VOICE === 'scripted')
    return (await import('./scriptedEngine')).createScriptedEngine()
  return (await import('./workerEngine')).createWorkerEngine()
}

/**
 * Settings changed, here or on the settings page: voice turned on or off, the listening mode or
 * the microphone changed.
 */
onVoiceSettingsChange(() => {
  const before = snapshot.settings
  const settings = voiceSettings()
  if (settings === before) return
  set({ settings })
  if (!settings.speakMoves && before.speakMoves) stop()
  if (settings.speakMoves && !before.speakMoves && pages.length > 0) start()
  if (settings.listening !== before.listening) {
    set({ muted: false, hearing: false })
    syncDetector()
  }
  if (settings.microphone !== before.microphone && (microphone || snapshot.mic.kind === 'failed')) {
    closeMicrophone()
    if (pages.length > 0 && snapshot.engine.kind === 'ready') void ensureMicrophone()
  }
})

/**
 * Always listening rests while the board speaks, and a moment after. Push to talk doesn't wait:
 * a press stops the board (`press`).
 */
let speechTail: ReturnType<typeof setTimeout> | undefined
speaker.onSpeakingChange((speaking) => {
  clearTimeout(speechTail)
  if (speaking) pause(true)
  else speechTail = setTimeout(() => pause(false), SPEECH_TAIL_MS)
})

function pause(paused: boolean) {
  if (snapshot.paused === paused) return
  set({ paused, hearing: false })
  syncDetector()
}

/**
 * Turns voice on: the first time with the notice about the download, which `acceptNotice`
 * answers; after that the models load from the browser's cache at once.
 */
export function turnOn(): void {
  if (!snapshot.settings.speechModelAccepted) {
    set({ engine: { kind: 'notice' } })
    return
  }
  setVoiceSettings({ speakMoves: true })
}

export function acceptNotice(): void {
  setVoiceSettings({ speakMoves: true, speechModelAccepted: true })
}

export function dismissNotice(): void {
  if (snapshot.engine.kind === 'notice') set({ engine: { kind: 'off' } })
}

export function turnOff(): void {
  setVoiceSettings({ speakMoves: false })
}

export function setListening(listening: ListeningMode): void {
  setVoiceSettings({ listening })
}

/** Always listening: the mic button stops and starts it. */
export function toggleMuted(): void {
  set({ muted: !snapshot.muted, hearing: false })
  microphone?.wake()
  syncDetector()
}

function stop() {
  closeMicrophone()
  engine?.dispose()
  engine = undefined
  engineLoad = undefined
  set({ engine: { kind: 'off' }, holding: false, hearing: false, transcribing: false })
}

/** A page that takes voice. While one is shown, the microphone is open (once voice is ready). */
export function attachPage(onText: TranscriptHandler, onNote: NoteHandler): () => void {
  const entry = { onText, onNote }
  pages.push(entry)
  clearTimeout(closeTimer)
  if (snapshot.settings.speakMoves && !engine) start()
  else if (snapshot.engine.kind === 'ready') void ensureMicrophone()
  return () => {
    pages.splice(pages.indexOf(entry), 1)
    if (pages.length === 0) closeTimer = setTimeout(closeMicrophone, CLOSE_AFTER_MS)
  }
}

/** Retries what failed: the model's download, or the microphone. */
export function retry(): void {
  if (snapshot.engine.kind === 'failed') {
    engine?.dispose()
    engine = undefined
    engineLoad = undefined
    start()
  } else if (snapshot.mic.kind === 'failed') void ensureMicrophone()
}

function start() {
  const load: Promise<void> = (engineLoad ??= (async () => {
    // Turned off (or retried) meanwhile: this load no longer speaks for the session.
    const stale = () => engineLoad !== load
    set({ engine: { kind: 'loading', share: 0 } })
    let created: SpeechEngine | undefined
    try {
      created = await createSpeechEngine()
      if (stale()) return created.dispose()
      engine = created
      const { device } = await created.load(({ loaded, total }) => {
        if (!stale())
          set({ engine: { kind: 'loading', share: total > 0 ? Math.min(1, loaded / total) : 0 } })
      })
      if (stale()) return
      set({ engine: { kind: 'ready', device } })
      if (pages.length > 0) await ensureMicrophone()
    } catch (error) {
      if (stale()) return
      created?.dispose()
      engine = undefined
      engineLoad = undefined
      set({ engine: { kind: 'failed', message: messageOf(error) } })
    }
  })())
}

function ensureMicrophone(): Promise<void> {
  if (microphone) return Promise.resolve()
  micOpening ??= (async () => {
    set({ mic: { kind: 'opening' } })
    try {
      const opened = await openMicrophone(snapshot.settings.microphone ?? undefined, onAudio)
      if (pages.length === 0 || snapshot.engine.kind !== 'ready') {
        opened.stop()
        set({ mic: { kind: 'closed' } })
        return
      }
      microphone = opened
      set({ mic: { kind: 'open', label: opened.label } })
      syncDetector()
    } catch (error) {
      const failure =
        error instanceof MicrophoneError
          ? error
          : new MicrophoneError('unsupported', messageOf(error))
      set({ mic: { kind: 'failed', reason: failure.reason, message: failure.message } })
    } finally {
      micOpening = undefined
    }
  })()
  return micOpening
}

function closeMicrophone() {
  clearTimeout(closeTimer)
  microphone?.stop()
  microphone = undefined
  detector?.close()
  detector = undefined
  recording = []
  preRoll = []
  preRollLength = 0
  if (snapshot.mic.kind !== 'closed')
    set({ mic: { kind: 'closed' }, holding: false, hearing: false })
}

/** Whether the detector should take audio now. */
function listening(): boolean {
  const s = snapshot
  return (
    s.settings.listening === 'always' &&
    !!microphone &&
    s.engine.kind === 'ready' &&
    !s.paused &&
    !s.muted &&
    !s.transcribing
  )
}

/** Creates, resets or closes the detector to match `listening()`. */
function syncDetector() {
  if (snapshot.settings.listening !== 'always' || !engine || !microphone) {
    detector?.close()
    detector = undefined
    return
  }
  detector ??= engine.detector({
    onSpeechStart: () => listening() && set({ hearing: true }),
    onMisfire: () => set({ hearing: false }),
    onUtterance: (audio) => {
      set({ hearing: false })
      if (listening()) void transcribe(audio, 'listen')
    },
  })
  if (!listening()) detector.reset()
}

function onAudio(samples: Float32Array) {
  if (snapshot.holding) recording.push(samples)
  else {
    preRoll.push(samples)
    preRollLength += samples.length
    while (preRollLength - preRoll[0]!.length >= PRE_ROLL_SECONDS * SAMPLE_RATE) {
      preRollLength -= preRoll.shift()!.length
    }
  }
  if (listening()) detector?.push(samples)
}

/** Push to talk: the key or button went down. */
export function press(): void {
  if (snapshot.engine.kind !== 'ready' || snapshot.settings.listening !== 'push') return
  if (snapshot.mic.kind === 'failed') {
    void ensureMicrophone()
    return
  }
  if (!microphone || snapshot.holding || snapshot.transcribing) return
  // The user chose to talk: the board stops reading aloud, so the recording hears only them.
  if (speaker.speaking) speaker.cancel()
  microphone.wake()
  recording = [...preRoll]
  set({ holding: true })
}

/** Push to talk: released; what was said is transcribed. */
export function release(): void {
  if (!snapshot.holding) return
  set({ holding: false })
  const audio = concat(recording)
  recording = []
  if (audio.length < (MIN_PUSH_SECONDS + PRE_ROLL_SECONDS) * SAMPLE_RATE) {
    page()?.onNote('Hold the key or button while you speak.')
    return
  }
  void transcribe(audio, 'push')
}

async function transcribe(audio: Float32Array, via: 'push' | 'listen') {
  const current = engine
  if (!current) return
  set({ transcribing: true })
  syncDetector()
  try {
    // Push to talk can hold nothing but silence, and Whisper writes something for it anyway.
    if (via === 'push' && !(await current.hasSpeech(audio))) {
      page()?.onNote('Heard nothing.')
      return
    }
    const text = await current.transcribe(audio)
    if (current === engine) page()?.onText(text, via)
  } catch (error) {
    if (current === engine) page()?.onNote(`Could not make it out: ${messageOf(error)}`)
  } finally {
    set({ transcribing: false })
    syncDetector()
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
