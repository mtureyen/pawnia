import { VAD } from './model'

/**
 * Cuts a stream of frames into utterances from the voice activity detector's chances that each
 * frame is speech. Whisper must never get silence alone: it writes text for it ("Thank you.").
 *
 * Speech starts when a frame reaches `start` and ends after `endAfter` frames below `stop` (a
 * lower bar, so a soft syllable doesn't end it). The values follow Silero's own recommendations
 * and those of the `vad-web` package; the pauses are longer, since a move is often said with one
 * ("knight … f3").
 */
export interface SegmenterOptions {
  /** A frame at least this likely is speech. */
  start: number
  /** Below this, a frame counts as silence. */
  stop: number
  /** Silent frames that end an utterance. */
  endAfter: number
  /** Frames of audio kept from before the speech started, so its first sound isn't cut. */
  before: number
  /** Speech frames an utterance needs; fewer are a cough or a click. */
  minSpeech: number
  /** Frames after which an utterance is cut off however it goes on (nobody says a move that long). */
  maxFrames: number
}

const MS_PER_FRAME = (VAD.frame / 16_000) * 1000 // 32 ms

export const DEFAULT_SEGMENTER: SegmenterOptions = {
  start: 0.5,
  stop: 0.35,
  endAfter: Math.round(700 / MS_PER_FRAME),
  before: Math.round(300 / MS_PER_FRAME),
  minSpeech: Math.round(200 / MS_PER_FRAME),
  maxFrames: Math.round(8000 / MS_PER_FRAME),
}

export interface SegmentEvents {
  onSpeechStart(): void
  onMisfire(): void
  onUtterance(audio: Float32Array): void
}

export class Segmenter {
  private readonly ring: Float32Array[] = []
  private speech: Float32Array[] | undefined
  private speechFrames = 0
  private silentFrames = 0

  private readonly events: SegmentEvents
  private readonly options: SegmenterOptions

  constructor(events: SegmentEvents, options: SegmenterOptions = DEFAULT_SEGMENTER) {
    this.events = events
    this.options = options
  }

  /** One frame of audio and the chance that it is speech. */
  push(frame: Float32Array, chance: number): void {
    const o = this.options
    if (!this.speech) {
      if (chance >= o.start) {
        this.speech = [...this.ring, frame]
        this.ring.length = 0
        this.speechFrames = 1
        this.silentFrames = 0
        this.events.onSpeechStart()
      } else {
        this.ring.push(frame)
        if (this.ring.length > o.before) this.ring.shift()
      }
      return
    }

    this.speech.push(frame)
    if (chance >= o.stop) {
      this.silentFrames = 0
      if (chance >= o.start) this.speechFrames++
    } else this.silentFrames++
    if (this.silentFrames >= o.endAfter || this.speech.length >= o.maxFrames) this.end()
  }

  /** Drops what was begun, as after a pause. */
  reset(): void {
    if (this.speech) this.events.onMisfire()
    this.speech = undefined
    this.ring.length = 0
  }

  private end() {
    const frames = this.speech!
    this.speech = undefined
    if (this.speechFrames < this.options.minSpeech) {
      this.events.onMisfire()
      return
    }
    // The trailing silence beyond a short tail adds nothing for Whisper.
    const keep = frames.length - Math.max(0, this.silentFrames - this.options.before)
    this.events.onUtterance(concat(frames.slice(0, keep)))
  }
}

export function concat(chunks: readonly Float32Array[]): Float32Array {
  const out = new Float32Array(chunks.reduce((n, c) => n + c.length, 0))
  let at = 0
  for (const chunk of chunks) {
    out.set(chunk, at)
    at += chunk.length
  }
  return out
}
