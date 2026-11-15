/**
 * Turns the microphone's samples (44.1 or 48 kHz as a rule) into the 16 kHz Whisper and Silero
 * take, chunk by chunk. Each output sample is the mean of the input samples it stands for: a box
 * filter, which keeps most of what lies above 8 kHz from folding back into the speech band, and
 * is plenty for recognising words.
 */
export class Resampler {
  private readonly ratio: number
  /** Output samples made so far; output k stands for input [k·ratio, (k+1)·ratio). */
  private produced = 0
  /** Input samples dropped so far: `carry` starts there. */
  private dropped = 0
  private carry = new Float32Array(0)

  constructor(fromRate: number, toRate: number) {
    if (fromRate < toRate) throw new Error(`Can't resample up from ${fromRate} Hz`)
    this.ratio = fromRate / toRate
  }

  push(chunk: Float32Array): Float32Array {
    const input = new Float32Array(this.carry.length + chunk.length)
    input.set(this.carry)
    input.set(chunk, this.carry.length)
    const end = this.dropped + input.length
    const out: number[] = []
    // Positions from counts, not sums, so chunks of any size give the same samples.
    while ((this.produced + 1) * this.ratio <= end) {
      const from = this.produced * this.ratio - this.dropped
      out.push(mean(input, from, from + this.ratio))
      this.produced++
    }
    const keepFrom = Math.floor(this.produced * this.ratio) - this.dropped
    this.carry = input.slice(keepFrom)
    this.dropped += keepFrom
    return Float32Array.from(out)
  }
}

/** The mean of input over [start, end), counting the partial samples at both ends by their share. */
function mean(input: Float32Array, start: number, end: number): number {
  let sum = 0
  let i = Math.floor(start)
  const first = i + 1 - start
  sum += input[i]! * first
  for (i++; i < Math.floor(end); i++) sum += input[i]!
  const last = end - Math.floor(end)
  if (last > 0 && i < input.length) sum += input[i]! * last
  return sum / (end - start)
}

/** All of a recording at once. */
export function resample(audio: Float32Array, fromRate: number, toRate: number): Float32Array {
  return fromRate === toRate ? audio : new Resampler(fromRate, toRate).push(audio)
}
