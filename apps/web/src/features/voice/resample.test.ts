import { describe, expect, it } from 'vitest'
import { resample, Resampler } from './resample'

const sine = (rate: number, hz: number, seconds: number) =>
  Float32Array.from({ length: Math.round(rate * seconds) }, (_, i) =>
    Math.sin((2 * Math.PI * hz * i) / rate),
  )

describe('Resampler', () => {
  it('makes a third of the samples from 48 kHz, as their means', () => {
    expect(Array.from(resample(Float32Array.of(1, 2, 3, 4, 5, 6), 48_000, 16_000))).toEqual([2, 5])
  })

  it('gives the same samples chunk by chunk as all at once', () => {
    const audio = sine(44_100, 440, 0.5)
    const whole = resample(audio, 44_100, 16_000)
    const resampler = new Resampler(44_100, 16_000)
    const parts: number[] = []
    for (let at = 0; at < audio.length; at += 1000)
      parts.push(...resampler.push(audio.subarray(at, at + 1000)))
    expect(parts).toHaveLength(whole.length)
    parts.forEach((value, i) => expect(value).toBeCloseTo(whole[i]!, 5))
  })

  it('keeps a tone in the speech band', () => {
    const out = resample(sine(48_000, 440, 1), 48_000, 16_000)
    expect(out).toHaveLength(16_000)
    const peak = Math.max(...out.map(Math.abs))
    expect(peak).toBeGreaterThan(0.95)
  })

  it('damps a tone above what 16 kHz can hold', () => {
    const out = resample(sine(48_000, 15_000, 1), 48_000, 16_000)
    const rms = Math.sqrt(out.reduce((sum, v) => sum + v * v, 0) / out.length)
    expect(rms).toBeLessThan(0.3)
  })

  it('leaves 16 kHz audio as it is', () => {
    const audio = Float32Array.of(0.1, 0.2)
    expect(resample(audio, 16_000, 16_000)).toBe(audio)
  })
})
