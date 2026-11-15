import { describe, expect, it } from 'vitest'
import {
  drilledSquares,
  pickSquare,
  recordAnswer,
  squareChoices,
  squareWeight,
  typedSquare,
  weakestSquares,
  weakness,
  weightedPick,
  type AnswerStat,
} from './squares'

/** A repeatable stand-in for Math.random. */
function seeded(seed = 1): () => number {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

function answers(...results: [boolean, number][]): AnswerStat | undefined {
  return results.reduce<AnswerStat | undefined>(
    (s, [right, ms]) => recordAnswer(s, right, ms),
    undefined,
  )
}

describe('drilledSquares', () => {
  it('is the whole board by default, files a to h with ranks 1 to 8', () => {
    const all = drilledSquares()
    expect(all).toHaveLength(64)
    expect(all.slice(0, 3)).toEqual(['a1', 'a2', 'a3'])
  })

  it('crosses the chosen files with the chosen ranks', () => {
    expect(drilledSquares(['e'], [])).toEqual(['e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'e7', 'e8'])
    expect(drilledSquares([], ['1', '2', '3', '4'])).toHaveLength(32)
    expect(drilledSquares(['e', 'f'], ['4'])).toEqual(['e4', 'f4'])
  })
})

describe('recordAnswer and weakness', () => {
  it('counts answers and misses', () => {
    expect(answers([true, 1000], [false, 3000], [true, 2000])).toMatchObject({ seen: 3, missed: 1 })
  })

  it('a square missed lately is weak; got right again and again, it stops being weak', () => {
    const missed = answers([false, 0])!
    expect(weakness(missed)).toBe(1)
    let healed = missed
    for (let i = 0; i < 8; i++) healed = recordAnswer(healed, true, 800)
    expect(weakness(healed)).toBeLessThan(0.05)
    expect(healed.missed).toBe(1)
  })

  it('a slow square is weaker than a quick one, a long pause counts as ten seconds', () => {
    expect(weakness(answers([true, 900]))).toBe(0)
    expect(weakness(answers([true, 4000]))).toBeGreaterThan(0.2)
    expect(answers([true, 60_000])!.ms).toBe(10_000)
  })

  it('only right answers tell the speed', () => {
    expect(answers([true, 1000], [false, 9000])!.ms).toBe(1000)
  })
})

describe('squareWeight and pickSquare', () => {
  it('weighs a weak square above an unseen one, and that above a known one', () => {
    const known = squareWeight(answers([true, 800]))
    const unseen = squareWeight(undefined)
    const weak = squareWeight(answers([false, 0]))
    expect(known).toBe(1)
    expect(unseen).toBeGreaterThan(known)
    expect(weak).toBeGreaterThan(unseen)
  })

  it('brings a missed square back far more often than a known one', () => {
    const stats = {
      e4: answers([false, 0]),
      d4: answers([true, 800]),
      c4: answers([true, 800]),
    }
    const random = seeded(7)
    const counts: Record<string, number> = {}
    for (let i = 0; i < 3000; i++) {
      const s = pickSquare(['e4', 'd4', 'c4'], stats, random)
      counts[s] = (counts[s] ?? 0) + 1
    }
    expect(counts.e4! / counts.d4!).toBeGreaterThan(4)
  })

  it('never asks the same square twice in a row, unless it is the only one', () => {
    const random = seeded(3)
    let previous = pickSquare(drilledSquares(), {}, random)
    for (let i = 0; i < 200; i++) {
      const next = pickSquare(drilledSquares(), {}, random, previous)
      expect(next).not.toBe(previous)
      previous = next
    }
    expect(pickSquare(['e4'], {}, random, 'e4')).toBe('e4')
  })

  it('weightedPick follows the weights at the edges', () => {
    expect(
      weightedPick(
        ['a', 'b'],
        (x) => (x === 'a' ? 1 : 3),
        () => 0,
      ),
    ).toBe('a')
    expect(
      weightedPick(
        ['a', 'b'],
        (x) => (x === 'a' ? 1 : 3),
        () => 0.3,
      ),
    ).toBe('b')
    expect(
      weightedPick(
        ['a', 'b'],
        (x) => (x === 'a' ? 1 : 3),
        () => 0.9999,
      ),
    ).toBe('b')
  })
})

describe('weakestSquares', () => {
  it('lists the weak squares, weakest first, and leaves out the known ones', () => {
    const weakest = weakestSquares({
      e4: answers([false, 0], [false, 0]),
      d5: answers([true, 900]),
      f6: answers([true, 900], [false, 0], [true, 900]),
    })
    expect(weakest.map((w) => w.square)).toEqual(['e4', 'f6'])
  })
})

describe('squareChoices', () => {
  it('offers the square and the ones it is taken for from the other side', () => {
    const choices = squareChoices('f6', seeded(5))
    expect(choices).toHaveLength(4)
    expect(choices).toContain('f6')
    expect(new Set(choices).size).toBe(4)
    expect(choices.filter((s) => ['f3', 'c6', 'c3'].includes(s))).toHaveLength(3)
  })

  it('works in a corner, where the neighbours run out', () => {
    for (const square of ['a1', 'h8', 'd4', 'e5'] as const) {
      const choices = squareChoices(square, seeded(11))
      expect(choices).toContain(square)
      expect(new Set(choices).size).toBe(4)
    }
  })
})

describe('typedSquare', () => {
  it('reads a typed square, case and spaces aside', () => {
    expect(typedSquare(' F6 ')).toBe('f6')
    expect(typedSquare('f')).toBeUndefined()
    expect(typedSquare('i9')).toBeUndefined()
  })
})
