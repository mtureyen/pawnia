/**
 * The models voice input runs on, in one place: which speech recogniser, which voice activity
 * detector, at which revision, and how much they download. Another language means another entry
 * here (a multilingual Whisper, its `language` and a prompt in that language); nothing else names
 * a model.
 */

/** The sample rate both models take. */
export const SAMPLE_RATE = 16_000

export interface SpeechModel {
  /** A Hugging Face repository with ONNX exports transformers.js can run. */
  id: string
  /** A commit of that repository, so a changed upload can't change what the app runs. */
  revision: string
  /** The quantisation of each part on the WASM backend, and what that downloads (bytes). */
  wasm: { dtype: Record<string, string>; bytes: number }
  /** The same on WebGPU, which runs 8-bit weights on slow paths but half floats fast. */
  webgpu: { dtype: Record<string, string>; bytes: number }
  /** For a multilingual model, the language to transcribe; undefined for an English-only one. */
  language?: string
  /**
   * Text Whisper takes as said just before, so it expects chess words: "knight" over "night",
   * "e4" over "before". It is short and plain on purpose: a longer prompt made Whisper repeat
   * parts of it as what it heard.
   */
  prompt?: string
}

/**
 * Whisper base.en (OpenAI, MIT licence; ONNX export by onnx-community). Tried on 168 clips of
 * chess phrases in four voices: 86–89% read as the intended move or command, none as a wrong one;
 * small.en got 91% at three times the time and download, so base.en it is.
 */
export const WHISPER: SpeechModel = {
  id: 'onnx-community/whisper-base.en',
  revision: '51eefc0af78b103839eda9e7e4f4186acc6517fe',
  // encoder 23.2 MB, merged decoder 53.7 MB, tokenizer and configs 3.8 MB
  wasm: { dtype: { encoder_model: 'q8', decoder_model_merged: 'q8' }, bytes: 80_700_000 },
  // the encoder at 16 bits: 41.3 MB, as fast as at 32 bits and 4× faster than at 8 on WebGPU
  webgpu: { dtype: { encoder_model: 'fp16', decoder_model_merged: 'q8' }, bytes: 98_800_000 },
  prompt:
    'Chess moves: knight f3, bishop c4, rook a1, queen h5, king e2, pawn d4, e takes d5, castles kingside, a8 queen, take back.',
}

/** Silero VAD (MIT licence; ONNX export by onnx-community): is this 32 ms frame speech? */
export const VAD = {
  id: 'onnx-community/silero-vad',
  revision: 'e71cae966052b992a7eca6b17738916ce0eca4ec',
  dtype: 'fp32',
  bytes: 2_300_000,
  /** Samples per frame the model takes at 16 kHz. */
  frame: 512,
} as const

/** The ONNX runtime's WebAssembly, served by the app itself, fetched once with the models. */
const RUNTIME_BYTES = 26_900_000

/** What the first-time notice says is downloaded at most, in MB, to the nearest ten. */
export const DOWNLOAD_MB =
  Math.round(
    (Math.max(WHISPER.wasm.bytes, WHISPER.webgpu.bytes) + VAD.bytes + RUNTIME_BYTES) / 1e7,
  ) * 10
