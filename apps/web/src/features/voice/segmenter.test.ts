import { describe, expect, it, vi } from 'vitest'
import { Segmenter, type SegmenterOptions } from './segmenter'

const OPTIONS: SegmenterOptions = {
  start: 0.5,
  stop: 0.35,
  endAfter: 3,
  before: 2,
  minSpeech: 2,
  maxFrames: 20,
}

/** Frames whose single sample is their index, so the output shows which frames it holds. */
function run(chances: number[], options = OPTIONS) {
  const events = { onSpeechStart: vi.fn(), onMisfire: vi.fn(), onUtterance: vi.fn() }
  const segmenter = new Segmenter(events, options)
  chances.forEach((chance, i) => segmenter.push(Float32Array.of(i), chance))
  const utterances = events.onUtterance.mock.calls.map(([audio]) =>
    Array.from(audio as Float32Array),
  )
  return { events, utterances, segmenter }
}

describe('Segmenter', () => {
  it('cuts out speech with a little before it and a short tail after', () => {
    const { utterances, events } = run([0, 0, 0, 0.9, 0.8, 0.9, 0.1, 0.1, 0.1, 0, 0])
    expect(events.onSpeechStart).toHaveBeenCalledTimes(1)
    // Two frames before (1, 2), the speech (3–5), and the tail up to `before` silent frames.
    expect(utterances).toEqual([[1, 2, 3, 4, 5, 6, 7]])
  })

  it('keeps going through a soft stretch above the lower bar', () => {
    const { utterances } = run([0.9, 0.9, 0.4, 0.4, 0.4, 0.4, 0.9, 0, 0, 0])
    expect(utterances).toHaveLength(1)
    expect(utterances[0]).toContain(6)
  })

  it('drops a click too short to be speech, and sends nothing for silence', () => {
    const { utterances, events } = run([0, 0.9, 0, 0, 0, 0, 0, 0, 0])
    expect(utterances).toEqual([])
    expect(events.onMisfire).toHaveBeenCalledTimes(1)
  })

  it('cuts off an utterance that goes on and on', () => {
    const { utterances } = run(new Array(30).fill(0.9))
    expect(utterances[0]).toHaveLength(OPTIONS.maxFrames)
  })

  it('forgets speech begun when reset', () => {
    const { segmenter, events } = run([0.9, 0.9])
    segmenter.reset()
    expect(events.onMisfire).toHaveBeenCalledTimes(1)
    for (let i = 0; i < 5; i++) segmenter.push(Float32Array.of(9), 0)
    expect(events.onUtterance).not.toHaveBeenCalled()
  })
})
