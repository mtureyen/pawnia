import type { LibraryPuzzleBody } from '@pawnia/contracts'
import { describe, expect, it } from 'vitest'
import { answerFrom, gameAt, playReply, solverToMove, startSolve, tryMove, uciOf } from './solve'
import { orderedThemes, themeName } from './themes'

/** lichess 0000D: Black wins the queen on d8 with Rd8, Qxd8+ Bxd8. */
const PUZZLE: LibraryPuzzleBody = {
  id: '0000D',
  url: 'https://lichess.org/training/0000D',
  fen: '5rk1/1p3ppp/pq1Q1b2/8/8/1P3N2/P4PPP/3R2K1 b - - 3 27',
  opponentMove: 'd3d6',
  color: 'black',
  solution: ['f8d8', 'd6d8', 'f6d8'],
  rating: 1500,
  themes: ['advantage', 'endgame', 'short'],
}

/** Two rooks, two back-rank mates; the solution names Ra8#. */
const TWO_MATES: LibraryPuzzleBody = {
  ...PUZZLE,
  id: 'mates',
  fen: '7k/6pp/8/8/8/8/8/RR4K1 w - - 0 1',
  opponentMove: 'h6h7',
  color: 'white',
  solution: ['a1a8'],
  themes: ['mate', 'mateIn1', 'backRankMate', 'oneMove'],
}

describe('solving a puzzle', () => {
  it('plays the solution: the solver’s move, the reply, the last move', () => {
    let state = startSolve()
    expect(solverToMove(state)).toBe(true)
    const first = tryMove(PUZZLE, state, { from: 'f8', to: 'd8' })
    expect(first).toMatchObject({ kind: 'right', reply: 'd6d8' })
    state = first.state
    expect(solverToMove(state)).toBe(false)
    state = playReply(state, 'd6d8')
    const last = tryMove(PUZZLE, state, { from: 'f6', to: 'd8' })
    expect(last.kind).toBe('solved')
    expect(last.state).toEqual({ played: PUZZLE.solution, firstTry: true, end: 'solved' })
    expect(solverToMove(last.state)).toBe(false)
  })

  it('takes a wrong move as wrong: the position stays, the first try is lost', () => {
    const wrong = tryMove(PUZZLE, startSolve(), { from: 'b6', to: 'd6' })
    expect(wrong).toEqual({ kind: 'wrong', state: { played: [], firstTry: false } })
    // Found after that, it is solved, but not at the first try.
    const right = tryMove(PUZZLE, wrong.state, { from: 'f8', to: 'd8' })
    expect(right.state.firstTry).toBe(false)
  })

  it('ignores an illegal move, and moves while it isn’t the solver’s turn', () => {
    const illegal = tryMove(PUZZLE, startSolve(), { from: 'f8', to: 'f1' })
    expect(illegal).toEqual({ kind: 'wrong', state: startSolve() })
    const waiting = tryMove(PUZZLE, startSolve(), { from: 'f8', to: 'd8' }).state
    expect(tryMove(PUZZLE, waiting, { from: 'f6', to: 'd8' }).state).toBe(waiting)
  })

  it('accepts any mate, as lichess does', () => {
    expect(tryMove(TWO_MATES, startSolve(), { from: 'b1', to: 'b8' })).toMatchObject({
      kind: 'solved',
      state: { firstTry: true, end: 'solved' },
    })
    expect(tryMove(TWO_MATES, startSolve(), { from: 'a1', to: 'a8' }).kind).toBe('solved')
    expect(tryMove(TWO_MATES, startSolve(), { from: 'a1', to: 'a7' }).kind).toBe('wrong')
  })

  it('gives the rest of the answer from where the solver is', () => {
    const state = tryMove(PUZZLE, startSolve(), { from: 'f8', to: 'd8' }).state
    const back = playReply(state, 'd6d8')
    expect(answerFrom(PUZZLE, back)).toEqual(['f6d8'])
    expect(answerFrom(PUZZLE, startSolve())).toEqual(PUZZLE.solution)
  })

  it('writes moves as UCI with the promotion letter, and replays them', () => {
    expect(uciOf({ from: 'e7', to: 'e8', promotion: 'knight' })).toBe('e7e8n')
    expect(gameAt(PUZZLE, ['f8d8', 'd6d8']).fen()).toBe(
      '3Q2k1/1p3ppp/pq3b2/8/8/1P3N2/P4PPP/3R2K1 b - - 0 28',
    )
  })
})

describe('theme names', () => {
  it('reads lichess’ keys as words', () => {
    expect(themeName('hangingPiece')).toBe('Hanging piece')
    expect(themeName('mateIn2')).toBe('Mate in 2')
    expect(themeName('backRankMate')).toBe('Back rank mate')
    expect(themeName('fork')).toBe('Fork')
    expect(themeName('attackingF2F7')).toBe('Attacking f2 or f7')
    expect(themeName('xRayAttack')).toBe('X-ray attack')
    expect(themeName('crushing')).toBe('Wins decisively')
  })

  it('puts the motifs before length, phase and outcome', () => {
    expect(orderedThemes(['crushing', 'fork', 'middlegame', 'short', 'pin'])).toEqual([
      'fork',
      'pin',
      'crushing',
      'middlegame',
      'short',
    ])
    expect(orderedThemes(['mate', 'mateIn2', 'hookMate'])).toEqual(['mateIn2', 'hookMate'])
    expect(orderedThemes(['mate', 'smotheredMate'])).toEqual(['mate', 'smotheredMate'])
  })
})
