import { describe, expect, it } from 'vitest'
import {
  drillKey,
  emptyProgress,
  forget,
  loadProgress,
  parseProgress,
  saveProgress,
  withMoveAnswer,
  withRoundScore,
  withSquareAnswer,
} from './progress'

function memoryStorage(): Pick<Storage, 'getItem' | 'setItem'> {
  const items = new Map<string, string>()
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
  }
}

describe('notation progress', () => {
  it('keeps a square’s answers per side', () => {
    let p = withSquareAnswer(emptyProgress(), 'white', 'f6', false, 2000)
    p = withSquareAnswer(p, 'black', 'f6', true, 900)
    expect(p.squares.white.f6).toMatchObject({ seen: 1, missed: 1 })
    expect(p.squares.black.f6).toMatchObject({ seen: 1, missed: 0 })
  })

  it('keeps a kind of move’s answers', () => {
    const p = withMoveAnswer(withMoveAnswer(emptyProgress(), 'castling', false), 'castling', true)
    expect(p.moves.castling).toMatchObject({ seen: 2, missed: 1 })
  })

  it('keeps a round’s score when it beats the best one, per drill', () => {
    const key = drillKey('find', 'white', [], [])
    const first = withRoundScore(emptyProgress(), key, 12)
    expect(first.best).toBe(true)
    expect(withRoundScore(first.progress, key, 12).best).toBe(false)
    const second = withRoundScore(first.progress, key, 15)
    expect(second.best).toBe(true)
    expect(second.progress.best[key]).toBe(15)
    expect(withRoundScore(emptyProgress(), key, 0).best).toBe(false)
  })

  it('tells drills apart by mode, side and the part of the board, in any order', () => {
    expect(drillKey('find', 'white', [], [])).toBe('find:white:all:all')
    expect(drillKey('name', 'both', ['f', 'e'], ['4'])).toBe(
      drillKey('name', 'both', ['e', 'f'], ['4']),
    )
    expect(drillKey('find', 'black', ['e'], [])).not.toBe(drillKey('find', 'white', ['e'], []))
  })

  it('survives a trip through storage', () => {
    const storage = memoryStorage()
    let p = withSquareAnswer(emptyProgress(), 'white', 'e4', false, 0)
    p = withMoveAnswer(p, 'check', true)
    p = withRoundScore(p, 'find:white:all:all', 9).progress
    saveProgress(p, storage)
    expect(loadProgress(storage)).toEqual(p)
  })

  it('drops what doesn’t fit instead of breaking', () => {
    expect(
      parseProgress({
        squares: { white: { e4: { seen: 1, missed: 2, recentMiss: 0, ms: 0 }, z9: {} }, black: 5 },
        moves: { castling: { seen: 'x' }, check: { seen: 2, missed: 1, recentMiss: 0.5, ms: 0 } },
        best: { a: -1, b: 4, c: 'x' },
      }),
    ).toEqual({
      squares: { white: {}, black: {} },
      moves: { check: { seen: 2, missed: 1, recentMiss: 0.5, ms: 0 } },
      best: { b: 4 },
    })
    expect(parseProgress('nonsense')).toEqual(emptyProgress())
  })

  it('starts empty when storage is blocked or holds no JSON', () => {
    const throwing = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    }
    expect(loadProgress(throwing)).toEqual(emptyProgress())
    expect(() => saveProgress(emptyProgress(), throwing)).not.toThrow()
    expect(loadProgress({ getItem: () => '{oops' })).toEqual(emptyProgress())
    expect(loadProgress(undefined)).toEqual(emptyProgress())
  })

  it('forgets the squares with their best scores, or the moves', () => {
    let p = withSquareAnswer(emptyProgress(), 'white', 'e4', false, 0)
    p = withMoveAnswer(withRoundScore(p, 'k', 3).progress, 'check', false)
    expect(forget(p, 'squares')).toEqual({ ...emptyProgress(), moves: p.moves })
    expect(forget(p, 'moves').squares).toEqual(p.squares)
  })
})
