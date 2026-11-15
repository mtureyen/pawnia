/**
 * Runs the speech models off the main thread: Whisper turns an utterance into text, Silero VAD
 * says which 32 ms frames hold speech. Both run on transformers.js, so they share one ONNX
 * runtime and one download cache (the browser's Cache Storage, "transformers-cache").
 *
 * Messages are answered one at a time, in the order they came: Silero carries a state from frame
 * to frame, and the runtime would queue the sessions anyway.
 */
import {
  AutoModel,
  AutoProcessor,
  AutoTokenizer,
  env,
  type PreTrainedModel,
  type PreTrainedTokenizer,
  type Processor,
  type ProgressInfo,
  Tensor,
  WhisperForConditionalGeneration,
} from '@huggingface/transformers'
import { SAMPLE_RATE, VAD, WHISPER, type SpeechModel } from './model'
import type { WorkerReply, WorkerRequest } from './protocol'

type Device = 'webgpu' | 'wasm'

interface Loaded {
  device: Device
  processor: Processor
  tokenizer: PreTrainedTokenizer
  whisper: WhisperForConditionalGeneration
  vad: PreTrainedModel
  /** The tokens Whisper starts from: the prompt (if any), then "transcribe, no timestamps". */
  start: number[]
}

let loaded: Promise<Loaded> | undefined
let vadState: Tensor | undefined
const send = (reply: WorkerReply, transfer: Transferable[] = []) =>
  self.postMessage(reply, { transfer })

let queue = Promise.resolve()
self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  queue = queue.then(() => handle(event.data)).catch(() => undefined)
}

async function handle(request: WorkerRequest): Promise<void> {
  switch (request.type) {
    case 'load': {
      try {
        loaded ??= load(request)
        const { device } = await loaded
        send({ type: 'ready', device })
      } catch (error) {
        loaded = undefined
        send({ type: 'error', message: messageOf(error) })
      }
      return
    }
    case 'transcribe': {
      try {
        const models = await need()
        const started = performance.now()
        const text = await transcribe(models, request.audio)
        send({ type: 'text', id: request.id, text, ms: performance.now() - started })
      } catch (error) {
        send({ type: 'error', id: request.id, message: messageOf(error) })
      }
      return
    }
    case 'speech': {
      try {
        const models = await need()
        const chances = await speechChances(models, request.audio)
        send({ type: 'speech', id: request.id, chances }, [chances.buffer])
      } catch (error) {
        send({ type: 'error', id: request.id, message: messageOf(error) })
      }
      return
    }
    case 'resetSpeech':
      vadState = undefined
      return
  }
}

function need(): Promise<Loaded> {
  if (!loaded) throw new Error('The speech model is not loaded.')
  return loaded
}

async function load(request: Extract<WorkerRequest, { type: 'load' }>): Promise<Loaded> {
  // The runtime's own WASM comes from this app, not from a CDN: one less outside server.
  if (request.wasmPaths && env.backends.onnx.wasm)
    env.backends.onnx.wasm.wasmPaths = request.wasmPaths
  env.allowLocalModels = false

  const model: SpeechModel = { ...WHISPER, ...request.model }
  const device = request.device === 'auto' ? await gpuDevice() : request.device
  const progress = downloadProgress(model[device].bytes + VAD.bytes)
  const options = { revision: model.revision, progress_callback: progress }

  const whisperOn = async (device: Device) =>
    (await WhisperForConditionalGeneration.from_pretrained(model.id, {
      ...options,
      device,
      dtype: model[device].dtype as never,
    })) as WhisperForConditionalGeneration

  let whisper: WhisperForConditionalGeneration
  let used: Device = device
  try {
    whisper = await whisperOn(device)
    if (device === 'webgpu') await warmUp(whisper)
  } catch (error) {
    // An adapter can exist and still fail on a model (an old driver, no 16-bit floats).
    if (device !== 'webgpu') throw error
    whisper = await whisperOn('wasm')
    used = 'wasm'
  }
  const [processor, tokenizer, vad] = await Promise.all([
    AutoProcessor.from_pretrained(model.id, options),
    AutoTokenizer.from_pretrained(model.id, options),
    AutoModel.from_pretrained(VAD.id, {
      revision: VAD.revision,
      progress_callback: progress,
      // Silero's ONNX file has no transformers config of its own.
      config: { model_type: 'custom' } as never,
      dtype: VAD.dtype,
      device: 'wasm',
    }),
  ])
  return { device: used, processor, tokenizer, whisper, vad, start: startTokens(tokenizer, model) }
}

/** WebGPU when the browser has an adapter for it; it can still fail later (see `load`). */
async function gpuDevice(): Promise<Device> {
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu
  if (!gpu) return 'wasm'
  try {
    return (await gpu.requestAdapter()) ? 'webgpu' : 'wasm'
  } catch {
    return 'wasm'
  }
}

/** One run on silence: a WebGPU backend that can't run the model fails here, not on first use. */
async function warmUp(whisper: WhisperForConditionalGeneration) {
  const features = new Tensor('float32', new Float32Array(80 * 3000), [1, 80, 3000])
  await whisper.generate({ inputs: features, max_new_tokens: 1 } as never)
}

/**
 * Whisper's start: `<|startofprev|>` and the prompt, as if it had been said before, then
 * `<|startoftranscript|>` and `<|notimestamps|>` (and a language and task for a multilingual
 * model). transformers.js has no `prompt_ids` for Whisper, so the tokens are built here.
 */
function startTokens(tokenizer: PreTrainedTokenizer, model: SpeechModel): number[] {
  const id = (token: string) => {
    const found = tokenizer.convert_tokens_to_ids(token)
    if (typeof found !== 'number') throw new Error(`No token ${token}`)
    return found
  }
  const start = [id('<|startoftranscript|>')]
  if (model.language) start.push(id(`<|${model.language}|>`), id('<|transcribe|>'))
  start.push(id('<|notimestamps|>'))
  if (!model.prompt) return start
  const prompt = tokenizer.encode(` ${model.prompt.trim()}`, { add_special_tokens: false })
  return [id('<|startofprev|>'), ...prompt, ...start]
}

async function transcribe(models: Loaded, audio: Float32Array): Promise<string> {
  const { input_features } = (await models.processor(audio)) as { input_features: Tensor }
  const output = (await models.whisper.generate({
    inputs: input_features,
    decoder_input_ids: models.start,
    // A move or a command is a few words; a long answer is Whisper making something up.
    max_new_tokens: 32,
  } as never)) as Tensor
  const tokens = Array.from(output.tolist()[0] as bigint[], Number).slice(models.start.length)
  return models.tokenizer.decode(tokens, { skip_special_tokens: true }).trim()
}

/** The chance that each `VAD.frame` samples of the audio are speech. */
async function speechChances(models: Loaded, audio: Float32Array): Promise<Float32Array> {
  const frames = Math.floor(audio.length / VAD.frame)
  const chances = new Float32Array(frames)
  const sr = new Tensor('int64', [BigInt(SAMPLE_RATE)], [])
  for (let i = 0; i < frames; i++) {
    vadState ??= new Tensor('float32', new Float32Array(2 * 128), [2, 1, 128])
    const input = new Tensor('float32', audio.subarray(i * VAD.frame, (i + 1) * VAD.frame), [
      1,
      VAD.frame,
    ])
    const { output, stateN } = (await models.vad({ input, sr, state: vadState })) as {
      output: Tensor
      stateN: Tensor
    }
    vadState = stateN
    chances[i] = Number((output.data as Float32Array)[0])
  }
  return chances
}

/**
 * Sums the files' progress into one share of what the first-time notice promised. A file read
 * from the cache reports as well, so a later visit fills the bar in a moment.
 */
function downloadProgress(expected: number) {
  const files = new Map<string, { loaded: number; total: number }>()
  let last = 0
  return (info: ProgressInfo) => {
    if (info.status !== 'progress') return
    files.set(`${info.name}/${info.file}`, { loaded: info.loaded, total: info.total })
    let loadedBytes = 0
    let totalBytes = 0
    for (const file of files.values()) {
      loadedBytes += file.loaded
      totalBytes += file.total
    }
    const total = Math.max(expected, totalBytes)
    // At most one message per percent: the callback fires for every chunk.
    if (loadedBytes - last < total / 100 && loadedBytes < totalBytes) return
    last = loadedBytes
    send({ type: 'progress', loaded: loadedBytes, total })
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
