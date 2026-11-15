import { SAMPLE_RATE } from './model'
import { Resampler } from './resample'

/** Why the microphone can't be used, in words the voice panel shows. */
export class MicrophoneError extends Error {
  readonly reason: 'denied' | 'missing' | 'busy' | 'unsupported'
  constructor(reason: MicrophoneError['reason'], message: string) {
    super(message)
    this.reason = reason
  }
}

export interface Microphone {
  /** The device in use, by its label (empty before the user allowed the microphone once). */
  label: string
  /** Starts the audio flowing where the browser held it back until a click or key press. */
  wake(): void
  stop(): void
}

/**
 * Collects the first input channel in blocks of 2048 samples (43 ms at 48 kHz) and posts them to
 * the page. A worklet runs on the audio thread, so nothing is lost while the page is busy. It is
 * inline: a separate file would need its own build step for so few lines.
 */
const WORKLET = `
class PawniaCapture extends AudioWorkletProcessor {
  constructor() { super(); this.block = new Float32Array(2048); this.filled = 0 }
  process(inputs) {
    const channel = inputs[0] && inputs[0][0]
    if (!channel) return true
    let at = 0
    while (at < channel.length) {
      const n = Math.min(channel.length - at, this.block.length - this.filled)
      this.block.set(channel.subarray(at, at + n), this.filled)
      this.filled += n
      at += n
      if (this.filled === this.block.length) {
        this.port.postMessage(this.block, [this.block.buffer])
        this.block = new Float32Array(2048)
        this.filled = 0
      }
    }
    return true
  }
}
registerProcessor('pawnia-capture', PawniaCapture)
`

/**
 * Opens a microphone (the one asked for, else the default) and hands its sound to `onAudio` as
 * mono 16 kHz samples, from now until `stop`. Throws a `MicrophoneError` saying what went wrong.
 */
export async function openMicrophone(
  deviceId: string | undefined,
  onAudio: (samples: Float32Array) => void,
): Promise<Microphone> {
  if (!navigator.mediaDevices?.getUserMedia || typeof AudioWorkletNode === 'undefined')
    throw new MicrophoneError('unsupported', 'This browser can’t record from a microphone here.')

  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        ...(deviceId && { deviceId: { exact: deviceId } }),
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    })
  } catch (error) {
    throw microphoneError(error)
  }

  const context = new AudioContext()
  try {
    const url = URL.createObjectURL(new Blob([WORKLET], { type: 'text/javascript' }))
    await context.audioWorklet.addModule(url)
    URL.revokeObjectURL(url)
  } catch (error) {
    stream.getTracks().forEach((t) => t.stop())
    void context.close()
    throw new MicrophoneError('unsupported', `Could not start recording: ${messageOf(error)}`)
  }
  const source = context.createMediaStreamSource(stream)
  const capture = new AudioWorkletNode(context, 'pawnia-capture', { numberOfOutputs: 0 })
  const resampler = new Resampler(context.sampleRate, SAMPLE_RATE)
  capture.port.onmessage = (event: MessageEvent<Float32Array>) => {
    const samples = resampler.push(event.data)
    if (samples.length > 0) onAudio(samples)
  }
  source.connect(capture)
  void context.resume().catch(() => undefined)

  const track = stream.getAudioTracks()[0]
  return {
    label: track?.label ?? '',
    wake: () => {
      if (context.state === 'suspended') void context.resume().catch(() => undefined)
    },
    stop: () => {
      capture.port.onmessage = null
      source.disconnect()
      stream.getTracks().forEach((t) => t.stop())
      void context.close().catch(() => undefined)
    },
  }
}

/** The microphones the browser lists (with labels once the user has allowed one). */
export async function listMicrophones(): Promise<{ id: string; label: string }[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return []
  const devices = await navigator.mediaDevices.enumerateDevices()
  return devices
    .filter((d) => d.kind === 'audioinput' && d.deviceId)
    .map((d, i) => ({ id: d.deviceId, label: d.label || `Microphone ${i + 1}` }))
}

function microphoneError(error: unknown): MicrophoneError {
  const name = error instanceof DOMException ? error.name : ''
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return new MicrophoneError(
        'denied',
        'The microphone is blocked. Allow it for this site in the browser (the icon in the address bar), then try again.',
      )
    case 'NotFoundError':
    case 'OverconstrainedError':
      return new MicrophoneError('missing', 'No microphone found. Connect one and try again.')
    case 'NotReadableError':
    case 'AbortError':
      return new MicrophoneError(
        'busy',
        'The microphone can’t be opened; another app may be using it.',
      )
    default:
      return new MicrophoneError(
        'unsupported',
        `Could not open the microphone: ${messageOf(error)}`,
      )
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
