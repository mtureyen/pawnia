import { createGame, type Move } from '@pawnia/chess'
import type { LibraryPuzzleBody } from '@pawnia/contracts'

/**
 * Solving a puzzle of the library, as lichess runs it: the solver plays the solution's moves, the
 * board answers with the opponent's. A move off the solution is wrong and the first try is lost,
 * but the solver goes on from the same position. A move that mates solves the puzzle whatever the
 * solution says (lichess accepts any mate). "Show the answer" plays the rest of it (`answerFrom`),
 * and the puzzle counts as missed.
 */
export interface SolveState {
  /** The solution's moves on the board so far (UCI), the solver's and the opponent's. */
  readonly played: readonly string[]
  /** No wrong move yet, and the answer not shown. */
  readonly firstTry: boolean
  /** `solved`: found to the end; `shown`: the answer was played out. */
  readonly end?: 'solved' | 'shown'
}

export type TryResult =
  /** Right, and the opponent answers next (`reply`, UCI). */
  | { kind: 'right'; state: SolveState; reply: string }
  /** Right, and that was the last move (or a mate). */
  | { kind: 'solved'; state: SolveState }
  /** Not the move: the position stays as it was. */
  | { kind: 'wrong'; state: SolveState }

export function startSolve(): SolveState {
  return { played: [], firstTry: true }
}

/** The move as UCI, with the promotion letter. */
export function uciOf(move: Move): string {
  return `${move.from}${move.to}${move.promotion ? PROMOTION[move.promotion] : ''}`
}

const PROMOTION = { queen: 'q', rook: 'r', bishop: 'b', knight: 'n' } as const

/** The game from the puzzle's position with these moves played; the cursor at the last one. */
export function gameAt(puzzle: LibraryPuzzleBody, played: readonly string[]) {
  const game = createGame(puzzle.fen)
  for (const uci of played) game.play(uci)
  return game
}

/** Whether it is the solver's move (not over, not the opponent's turn to answer). */
export function solverToMove(state: SolveState): boolean {
  return state.end === undefined && state.played.length % 2 === 0
}

/** Judges the solver's move in the position the state is at. */
export function tryMove(puzzle: LibraryPuzzleBody, state: SolveState, move: Move): TryResult {
  if (!solverToMove(state)) return { kind: 'wrong', state }
  const uci = uciOf(move)
  const expected = puzzle.solution[state.played.length]
  const game = gameAt(puzzle, state.played)
  const node = game.play(uci)
  if (!node) return { kind: 'wrong', state }
  const mates = game.status().kind === 'checkmate'
  if (uci !== expected && !mates) return { kind: 'wrong', state: { ...state, firstTry: false } }

  const played = [...state.played, uci]
  const reply = puzzle.solution[played.length]
  if (mates || reply === undefined)
    return { kind: 'solved', state: { ...state, played, end: 'solved' } }
  return { kind: 'right', state: { ...state, played }, reply }
}

/** The opponent's answer played: the solver's turn again. */
export function playReply(state: SolveState, reply: string): SolveState {
  return { ...state, played: [...state.played, reply] }
}

/** The rest of the solution, from where the state is: what "Show the answer" plays out. */
export function answerFrom(puzzle: LibraryPuzzleBody, state: SolveState): string[] {
  return puzzle.solution.slice(state.played.length)
}
