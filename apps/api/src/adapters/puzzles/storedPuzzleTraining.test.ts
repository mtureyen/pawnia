import type { LibraryPuzzleBody, NextPuzzleRequestBody, WeakThemesBody } from '@pawnia/contracts'
import type { PuzzleProgress } from '@pawnia/history'
import { describe, expect, it } from 'vitest'
import type { StoredPuzzleAttempt } from '../db/puzzleStore'
import type { PuzzleLibraryService } from './puzzleLibraryService'
import { UnknownPuzzleError } from './puzzleTrainingService'
import { StoredPuzzleTraining, type PuzzleTrainingLibrary } from './storedPuzzleTraining'

const puzzle = (id: string, rating: number, themes: string[]): LibraryPuzzleBody => ({
  id,
  url: `https://lichess.org/training/${id}`,
  fen: '7k/6pp/8/8/8/8/8/RR4K1 w - - 0 1',
  opponentMove: 'h6h7',
  color: 'white',
  solution: ['a1a8'],
  rating,
  themes,
})

const SET = [
  puzzle('fork1', 1000, ['fork', 'short']),
  puzzle('fork2', 1050, ['fork', 'middlegame']),
  puzzle('pin1', 1000, ['pin']),
  puzzle('mate1', 1000, ['mateIn1']),
]

/** The library's puzzles: of the wanted themes, not excluded, the first one; and what was asked. */
function fakeLibrary() {
  const asked: NextPuzzleRequestBody[] = []
  const service: PuzzleLibraryService = {
    library: () => Promise.reject(new Error('not used')),
    next: async (wish) => {
      asked.push(wish)
      return SET.find(
        (p) =>
          !wish.exclude.includes(p.id) &&
          (wish.themes.length === 0 || p.themes.some((t) => wish.themes.includes(t))),
      )
    },
    puzzle: async (id) => SET.find((p) => p.id === id),
  }
  return { service, asked }
}

function fakeStore() {
  const attempts: StoredPuzzleAttempt[] = []
  const progress = new Map<string, PuzzleProgress>()
  const store: PuzzleTrainingLibrary = {
    summaries: async () => [],
    profile: async () => undefined,
    game: async () => undefined,
    findReview: async () => undefined,
    puzzleAttempts: async () => [...attempts],
    addPuzzleAttempt: async (attempt) => {
      attempts.push(attempt)
    },
    puzzleProgress: async () => new Map(progress),
    savePuzzleProgress: async (id, p) => {
      progress.set(id, p)
    },
  }
  return { store, attempts, progress }
}

/** A trainer with a clock the test moves, chance it scripts, and weak themes it sets. */
function trainer(draws: number[], weak: string[] = []) {
  const { store, attempts, progress } = fakeStore()
  const { service, asked } = fakeLibrary()
  const clock = { now: new Date('2026-11-20T12:00:00.000Z') }
  let i = 0
  let id = 0
  const training = new (class extends StoredPuzzleTraining {
    override async weakThemes(): Promise<WeakThemesBody> {
      return {
        games: 30,
        reviewed: 10,
        mistakes: 12,
        themes: weak.map((theme) => ({ theme, missed: [{ gameId: 'g', ply: 9 }], walkedInto: [] })),
      }
    }
  })(store, service, {
    now: () => clock.now,
    random: () => draws[i++] ?? 0.99,
    newId: () => `attempt-${++id}`,
  })
  const days = (n: number) => {
    clock.now = new Date(clock.now.getTime() + n * 86_400_000)
  }
  return { training, attempts, progress, asked, days }
}

describe('StoredPuzzleTraining', () => {
  it('starts at 1000, moves on new puzzles, never on repeats, and keeps every attempt', async () => {
    const { training, attempts } = trainer([])
    expect(await training.record({ puzzleId: 'fork1', solvedFirstTry: true })).toEqual({
      rating: 1032,
      change: 32,
      repeat: false,
    })
    const missed = await training.record({ puzzleId: 'pin1', solvedFirstTry: false })
    expect(missed).toMatchObject({ rating: 997, change: -35, repeat: false })
    expect(missed.dueAt).toBe('2026-11-21T12:00:00.000Z')
    expect(await training.record({ puzzleId: 'pin1', solvedFirstTry: true })).toEqual({
      rating: 997,
      change: 0,
      repeat: true,
    })
    expect(attempts.map((a) => [a.puzzleId, a.ratingBefore, a.ratingAfter, a.repeat])).toEqual([
      ['fork1', 1000, 1032, false],
      ['pin1', 1032, 997, false],
      ['pin1', 997, 997, true],
    ])
    expect(attempts[0]).toMatchObject({
      id: 'attempt-1',
      puzzleRating: 1000,
      themes: ['fork', 'short'],
    })
  })

  it('sums up the rating, the repeats and the solve rate per theme of the new puzzles', async () => {
    const { training, days } = trainer([])
    await training.record({ puzzleId: 'fork1', solvedFirstTry: true })
    await training.record({ puzzleId: 'fork2', solvedFirstTry: false })
    await training.record({ puzzleId: 'pin1', solvedFirstTry: false })
    days(2)
    await training.record({ puzzleId: 'pin1', solvedFirstTry: false })
    const summary = await training.summary()
    expect(summary).toMatchObject({
      rated: 3,
      provisional: true,
      attempts: 4,
      solvedFirstTry: 1,
      // fork2 is due again (a day passed); pin1 was missed again and waits three days.
      due: 1,
      waiting: 1,
    })
    expect(summary.history).toHaveLength(3)
    expect(summary.themes).toEqual([
      { theme: 'fork', attempts: 2, solved: 1 },
      { theme: 'middlegame', attempts: 1, solved: 0 },
      { theme: 'pin', attempts: 1, solved: 0 },
      { theme: 'short', attempts: 1, solved: 1 },
    ])
  })

  it('hands out a due repeat first when chance says so, the longest due first', async () => {
    const { training, days } = trainer([0.1])
    await training.record({ puzzleId: 'pin1', solvedFirstTry: false })
    await training.record({ puzzleId: 'fork1', solvedFirstTry: false })
    days(1)
    expect(await training.next({})).toMatchObject({ id: 'pin1', reason: 'repeat' })
  })

  it('takes new puzzles from the weak themes, at the rating, leaving out the ones tried', async () => {
    const { training, asked } = trainer([0.5], ['pin', 'fork'])
    await training.record({ puzzleId: 'pin1', solvedFirstTry: true })
    expect(await training.next({})).toMatchObject({ id: 'fork1', reason: 'weak' })
    expect(asked.at(-1)).toEqual({ themes: ['pin', 'fork'], rating: 1032, exclude: ['pin1'] })
  })

  it('falls back to any theme when the weak ones have nothing left, or chance says so', async () => {
    const run = trainer([0.5], ['backRankMate'])
    expect(await run.training.next({})).toMatchObject({ id: 'fork1', reason: 'mixed' })
    const mixed = trainer([0.9], ['pin'])
    expect(await mixed.training.next({})).toMatchObject({ id: 'fork1', reason: 'mixed' })
  })

  it('hands out the themes asked for, never a repeat', async () => {
    const { training, days } = trainer([0])
    await training.record({ puzzleId: 'pin1', solvedFirstTry: false })
    days(1)
    expect(await training.next({ themes: ['mateIn1'] })).toMatchObject({
      id: 'mate1',
      reason: 'chosen',
    })
    expect(await training.next({ themes: ['skewer'] })).toBeUndefined()
  })

  it('refuses an attempt at a puzzle the library doesn’t have', async () => {
    const { training } = trainer([])
    await expect(training.record({ puzzleId: 'nope', solvedFirstTry: true })).rejects.toThrow(
      UnknownPuzzleError,
    )
  })
})
