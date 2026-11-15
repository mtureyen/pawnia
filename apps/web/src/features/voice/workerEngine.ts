/**
 * The real speech engine: Whisper and Silero VAD in a worker (`speech.worker.ts`). This module is
 * loaded only when voice input is turned on, and the worker with transformers.js is a chunk of its
 * own, so neither adds to what the app loads at the start.
 */
import ortMjs from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs?url'
import ortWasm from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url'
import { VAD, type SpeechModel } from './model'
import type { DetectorEvents, LoadProgress, SpeechEngine, UtteranceDetector } from './ports'
import type { WorkerReply, WorkerRequest } from './protocol'
import { DEFAULT_SEGMENTER, Segmenter } from './segmenter'

export interface WorkerEngineOptions {
  /** Another model, or the same one with other settings (for trying them out). */
  model?: Partial<SpeechModel>
  device?: 'auto' | 'webgpu' | 'wasm'
}

export function createWorkerEngine(options: WorkerEngineOptions = {}): SpeechEngine {
  const worker = new Worker(new URL('./speech.worker.ts', import.meta.url), { type: 'module' })
  let nextId = 1
  const waiting = new Map<number, { resolve(reply: WorkerReply): void; reject(e: Error): void }>()
  let loading:
    | { resolve(device: string): void; reject(e: Error): void; onProgress(p: LoadProgress): void }
    | undefined

  worker.onmessage = (event: MessageEvent<WorkerReply>) => {
    const reply = event.data
    if (reply.type === 'progress') loading?.onProgress(reply)
    else if (reply.type === 'ready') {
      loading?.resolve(reply.device)
      loading = undefined
    } else if (reply.type === 'error' && reply.id === undefined) {
      loading?.reject(new Error(reply.message))
      loading = undefined
    } else if ('id' in reply && reply.id !== undefined) {
      const call = waiting.get(reply.id)
      waiting.delete(reply.id)
      if (reply.type === 'error') call?.reject(new Error(reply.message))
      else call?.resolve(reply)
    }
  }
  worker.onerror = (event) => {
    const error = new Error(event.message || 'The speech worker stopped.')
    loading?.reject(error)
    loading = undefined
    for (const call of waiting.values()) call.reject(error)
    waiting.clear()
  }

  const post = (request: WorkerRequest, transfer: Transferable[] = []) =>
    worker.postMessage(request, transfer)
  const call = (request: (id: number) => WorkerRequest, transfer: Transferable[]) =>
    new Promise<WorkerReply>((resolve, reject) => {
      const id = nextId++
      waiting.set(id, { resolve, reject })
      post(request(id), transfer)
    })

  return {
    load: (onProgress) =>
      new Promise<{ device: string }>((resolve, reject) => {
        loading = { resolve: (device) => resolve({ device }), reject, onProgress }
        post({
          type: 'load',
          device: options.device ?? 'auto',
          wasmPaths: { mjs: absolute(ortMjs), wasm: absolute(ortWasm) },
          ...(options.model && { model: options.model }),
        })
      }),
    hasSpeech: async (audio) => {
      // On its own, without the state of a stream before it (push to talk has none running).
      post({ type: 'resetSpeech' })
      const copy = audio.slice()
      const reply = await call((id) => ({ type: 'speech', id, audio: copy }), [copy.buffer])
      post({ type: 'resetSpeech' })
      if (reply.type !== 'speech') return true
      let speech = 0
      for (const chance of reply.chances) if (chance >= DEFAULT_SEGMENTER.start) speech++
      return speech >= DEFAULT_SEGMENTER.minSpeech
    },
    transcribe: async (audio) => {
      const copy = audio.slice()
      const reply = await call((id) => ({ type: 'transcribe', id, audio: copy }), [copy.buffer])
      return reply.type === 'text' ? reply.text : ''
    },
    detector: (events) => workerDetector(events, call, () => post({ type: 'resetSpeech' })),
    dispose: () => {
      worker.terminate()
      for (const pending of waiting.values())
        pending.reject(new Error('Voice input was turned off.'))
      waiting.clear()
    },
  }
}

/** The worker resolves the URL against its own script, which lives elsewhere once built. */
function absolute(url: string): string {
  return new URL(url, location.href).href
}

/**
 * Sends the audio to the worker in whole frames, one batch at a time, and feeds the chances it
 * sends back to a `Segmenter`. Audio that comes while a batch is out waits for the next one, so
 * the frames stay in order and the worker never falls behind by more than a batch.
 */
function workerDetector(
  events: DetectorEvents,
  call: (request: (id: number) => WorkerRequest, transfer: Transferable[]) => Promise<WorkerReply>,
  resetWorker: () => void,
): UtteranceDetector {
  const segmenter = new Segmenter(events)
  let pending: Float32Array[] = []
  let pendingLength = 0
  let busy = false
  let generation = 0
  let closed = false

  const flush = () => {
    const frames = Math.floor(pendingLength / VAD.frame)
    if (busy || frames === 0) return
    const all = new Float32Array(pendingLength)
    let at = 0
    for (const chunk of pending) {
      all.set(chunk, at)
      at += chunk.length
    }
    const batch = all.slice(0, frames * VAD.frame)
    const rest = all.slice(frames * VAD.frame)
    pending = rest.length > 0 ? [rest] : []
    pendingLength = rest.length
    busy = true
    const sent = generation
    const audio = batch.slice()
    call((id) => ({ type: 'speech', id, audio }), [audio.buffer])
      .then((reply) => {
        if (sent !== generation || reply.type !== 'speech') return
        reply.chances.forEach((chance, i) =>
          segmenter.push(batch.subarray(i * VAD.frame, (i + 1) * VAD.frame), chance),
        )
      })
      .catch(() => undefined)
      .finally(() => {
        busy = false
        flush()
      })
  }

  return {
    push: (audio) => {
      if (closed) return
      pending.push(audio)
      pendingLength += audio.length
      flush()
    },
    reset: () => {
      generation++
      pending = []
      pendingLength = 0
      segmenter.reset()
      resetWorker()
    },
    close: () => {
      closed = true
      generation++
      pending = []
      pendingLength = 0
    },
  }
}
