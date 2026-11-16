import { boardView, legalSpokenMoves, type Role, type SpokenMove } from '@pawnia/chess'
import {
  readSpokenMoveWithCoach,
  type CancelSignal,
  type CoachAgent,
  type SpokenMoveFacts,
} from '@pawnia/coach'
import type { CoachSpokenMoveBody } from '@pawnia/contracts'

const LETTER: Record<Role, string> = {
  king: 'K',
  queen: 'Q',
  rook: 'R',
  bishop: 'B',
  knight: 'N',
  pawn: '',
}

/**
 * What the coach reads to tell the move meant by `said` in the position: the pieces, and every
 * legal move with what it does in words. Throws on a FEN that isn't a legal position.
 */
export function spokenMoveFacts(fen: string, said: string): SpokenMoveFacts {
  const board = boardView(fen)
  const pieces: SpokenMoveFacts['pieces'] = { white: [], black: [] }
  // Kings first, pawns last: the order a player reads a position in.
  const order: Role[] = ['king', 'queen', 'rook', 'bishop', 'knight', 'pawn']
  const placed = board
    .pieces()
    .sort((a, b) => order.indexOf(a.piece.role) - order.indexOf(b.piece.role))
  for (const { square, piece } of placed) pieces[piece.color].push(LETTER[piece.role] + square)
  const moves = legalSpokenMoves(fen).map((move) => ({ san: move.san, does: does(board, move) }))
  return { said, turn: board.turn, pieces, moves }
}

function does(board: ReturnType<typeof boardView>, move: SpokenMove): string {
  const mover = board.pieceAt(move.from)!
  const check = move.san.endsWith('#') ? ', checkmate' : move.san.endsWith('+') ? ', check' : ''
  if (move.san.startsWith('O-O')) {
    const side = move.san.startsWith('O-O-O') ? 'queenside' : 'kingside'
    return `castles ${side}${check}`
  }
  const victim = board.pieceAt(move.to)
  const enPassant = mover.role === 'pawn' && !victim && move.from[0] !== move.to[0]
  const what = victim
    ? `takes the ${victim.role} on ${move.to}`
    : enPassant
      ? `takes the pawn en passant, to ${move.to}`
      : `to ${move.to}`
  const promotion = move.promotion ? `, becomes a ${move.promotion}` : ''
  return `${mover.role} ${move.from} ${what}${promotion}${check}`
}

/**
 * The coach reading free words as a move. Asked the same in the same position while the coach is
 * still on it (a repeated press), this waits for that answer: the coach is not paid twice.
 */
export class SpokenMoveReader {
  private readonly reading = new Map<string, Promise<CoachSpokenMoveBody>>()

  read(
    fen: string,
    said: string,
    agent: CoachAgent,
    signal?: CancelSignal,
  ): Promise<CoachSpokenMoveBody> {
    const facts = spokenMoveFacts(fen, said)
    const key = [fen, said.toLowerCase(), agent.id].join('\n')
    const going = this.reading.get(key)
    if (going) return going
    const started = readSpokenMoveWithCoach(agent, facts, signal)
      .then((san) => ({ move: san === null ? null : moveOf(fen, san) }))
      .finally(() => this.reading.delete(key))
    this.reading.set(key, started)
    return started
  }
}

function moveOf(fen: string, san: string): CoachSpokenMoveBody['move'] {
  const move = legalSpokenMoves(fen).find((m) => m.san === san)
  if (!move) return null
  const { from, to, promotion } = move
  return { from, to, san, ...(promotion && { promotion }) }
}
