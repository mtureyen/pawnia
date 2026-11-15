import type { SpeechModel } from './model'

/** What the page asks the speech worker (`speech.worker.ts`). Audio is mono, 16 kHz. */
export type WorkerRequest =
  | {
      type: 'load'
      /** 'auto' takes WebGPU when the browser has it and it runs the model, else WASM. */
      device: 'auto' | 'webgpu' | 'wasm'
      /** Where the ONNX runtime's WASM files are served. */
      wasmPaths?: { mjs: string; wasm: string }
      /** Overrides of the configured model, for trying another one out. */
      model?: Partial<SpeechModel>
    }
  | { type: 'transcribe'; id: number; audio: Float32Array }
  | { type: 'speech'; id: number; audio: Float32Array }
  /** Forget the detector's state: what comes next is not a continuation. */
  | { type: 'resetSpeech' }

export type WorkerReply =
  | { type: 'progress'; loaded: number; total: number }
  | { type: 'ready'; device: 'webgpu' | 'wasm' }
  | { type: 'text'; id: number; text: string; ms: number }
  | { type: 'speech'; id: number; chances: Float32Array }
  | { type: 'error'; id?: number; message: string }
