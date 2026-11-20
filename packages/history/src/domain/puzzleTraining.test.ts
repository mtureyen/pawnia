import { describe, expect, it } from 'vitest'
import type { ThemeTally } from './mistakeThemes'
import {
  pickNext,
  PROVISIONAL_ATTEMPTS,
  ratingAfter,
  START_PUZZLE_RATING,
  weakThemes,
} from './puzzleTraining'

const fresh = { rating: START_PUZZLE_RATING, rated: 0 }

describe('ratingAfter', () => {
  it('goes up for a puzzle solved at the first try, down for a miss, by Elo', () => {
    // An even puzzle: half the step either way.
    expect(ratingAfter(fresh, 1000, true)).toEqual({ rating: 1032, rated: 1 })
    expect(ratingAfter(fresh, 1000, false)).toEqual({ rating: 968, rated: 1 })
    // A hard one solved gains more than an easy one; an easy one missed loses more.
    expect(ratingAfter(fresh, 1400, true).rating).toBeGreaterThan(1055)
    expect(ratingAfter(fresh, 600, false).rating).toBeLessThan(945)
  })

  it('moves less once the first attempts are done', () => {
    const settled = { rating: 1000, rated: PROVISIONAL_ATTEMPTS }
    expect(ratingAfter(settled, 1000, true)).toEqual({ rating: 1012, rated: 21 })
  })

  it('never moves on a repeat', () => {
    expect(ratingAfter({ rating: 1234, rated: 7 }, 2000, true, true)).toEqual({
      rating: 1234,
      rated: 7,
    })
  })
})

describe('weakThemes', () => {
  const tally = (theme: string, missed: number, walkedInto: number): ThemeTally => ({
    theme: theme as ThemeTally['theme'],
    missed: Array.from({ length: missed }, (_, i) => ({ gameId: 'g', ply: i })),
    walkedInto: Array.from({ length: walkedInto }, (_, i) => ({ gameId: 'g', ply: i })),
  })

  it('counts missed and walked into together, the most frequent first, at most five', () => {
    const tallies = [
      tally('fork', 3, 2),
      tally('pin', 1, 3),
      tally('skewer', 2, 0),
      tally('hangingPiece', 1, 0),
      tally('sacrifice', 0, 1),
      tally('deflection', 1, 0),
    ]
    expect(weakThemes(tallies)).toEqual([
      { theme: 'fork', mistakes: 5 },
      { theme: 'pin', mistakes: 4 },
      { theme: 'skewer', mistakes: 2 },
      { theme: 'hangingPiece', mistakes: 1 },
      { theme: 'sacrifice', mistakes: 1 },
    ])
    expect(weakThemes([])).toEqual([])
  })
})

describe('pickNext', () => {
  const weak = [{ theme: 'fork', mistakes: 3 }]
  const draws = (...values: number[]) => {
    let i = 0
    return () => values[i++] ?? 0.99
  }

  it('hands out a due repeat about a third of the time, the longest due first', () => {
    expect(pickNext({ due: ['a', 'b'], weak }, draws(0.2))).toEqual({ kind: 'repeat', id: 'a' })
    expect(pickNext({ due: ['a'], weak }, draws(0.5, 0.5))).toEqual({
      kind: 'weak',
      themes: ['fork'],
    })
  })

  it('takes new ones from the weak themes about 70 % of the time, of any theme otherwise', () => {
    expect(pickNext({ due: [], weak }, draws(0.69))).toEqual({ kind: 'weak', themes: ['fork'] })
    expect(pickNext({ due: [], weak }, draws(0.71))).toEqual({ kind: 'mixed' })
    expect(pickNext({ due: [], weak: [] }, draws(0))).toEqual({ kind: 'mixed' })
  })
})
