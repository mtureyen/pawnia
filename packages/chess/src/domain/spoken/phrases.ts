import type { PromotionRole, SquareName } from '../types'
import type { FileTok, RankTok, RoleTok, Tok } from './words'

/** What a legal move is, as far as saying it goes. */
export interface MoveFacts {
  from: SquareName
  to: SquareName
  role: RoleTok
  /** The piece taken (a pawn for en passant); absent if nothing is. */
  victim?: RoleTok
  promotion?: PromotionRole
  castle?: 'short' | 'long'
}

/**
 * One way to say a move, in tokens. A phrase is all or nothing: every token must be heard. `cost`
 * is how far the phrase is from saying the move outright, e.g. a bare square for a knight move
 * ("f3"), which in notation would mean the pawn.
 */
export interface Phrase {
  toks: Tok[]
  cost: number
}

/** A bare destination for anything but a pawn push: answers, but never plays on its own. */
const BARE_SQUARE = 0.4
/** "e d5" for exd5: the "takes" is dropped, which happens, but is also how a mishearing looks. */
const PAWN_CAPTURE_WITHOUT_TAKES = 0.2
/** A piece, its file and the destination's rank, the destination's file lost ("rook f1"). */
const LOST_FILE = 0.4
/** "Takes" alone: plays the one capture there is. */
const TAKES_ALONE = 0.2
/**
 * A piece named, nothing else ("knight"): never enough to play, even when the piece has only one
 * move; the caller can show the moves it has.
 */
const PIECE_ALONE = 0.6

const PROMOTION_TOK: Record<PromotionRole, RoleTok> = {
  queen: 'Q',
  rook: 'R',
  bishop: 'B',
  knight: 'N',
}

/** Every phrase we accept for the move. Phrases that can't tell two moves apart are fine. */
export function phrasesOf(move: MoveFacts): Phrase[] {
  const phrases: Phrase[] = []
  const add = (cost: number, ...toks: Tok[]) => phrases.push({ toks, cost })
  const file = move.from[0] as FileTok
  const rank = move.from[1] as RankTok
  const dest = [move.to[0], move.to[1]] as [FileTok, RankTok]
  const { role, victim } = move

  // From and to, as in UCI ("g1 f3", "knight from g1 to f3"), said by anything.
  add(0, file, rank, ...dest)
  add(0, role, file, rank, ...dest)
  if (victim) {
    add(0, file, rank, 'x', ...dest)
    add(0, role, file, rank, 'x', ...dest)
  }

  if (role === 'P') {
    if (!victim) {
      add(0, ...dest)
      add(0, 'P', ...dest)
    } else {
      add(0, file, 'x', ...dest) // "e takes d5", "exd5"
      add(PAWN_CAPTURE_WITHOUT_TAKES, file, ...dest)
      add(0, 'x', ...dest)
      add(0, 'P', 'x', ...dest)
      add(BARE_SQUARE, ...dest)
      add(0, file, 'x') // "e takes"
      add(0, 'P', 'x') // "pawn takes"
      add(0, file, 'x', victim)
      add(0, 'P', 'x', victim)
      add(0, 'x', victim)
      add(TAKES_ALONE, 'x')
    }
  } else {
    // A piece, told apart from its twin by file or rank when needed ("knight b d2", "rook one e1").
    for (const from of [[], [file], [rank]] as Tok[][]) {
      add(0, role, ...from, ...dest)
      if (victim) add(0, role, ...from, 'x', ...dest)
    }
    add(BARE_SQUARE, ...dest)
    // "rook f e1" comes out of Whisper as "rook f1": the destination's file is swallowed after the
    // file the piece comes from. Never played from that alone, only asked about.
    if (file !== dest[0]) add(LOST_FILE, role, file, dest[1])
    if (victim) {
      add(0, 'x', ...dest)
      add(0, role, 'x') // "knight takes"
      add(0, role, 'x', victim) // "knight takes bishop"
      add(0, 'x', victim)
      add(TAKES_ALONE, 'x')
    }
  }

  if (move.castle) {
    add(0, 'O')
    add(0, 'O', move.castle) // "castle short", "castles kingside"
    add(0, move.castle, 'O') // "short castle", "queenside castle"
    add(0.3, move.castle) // "kingside" alone
  }

  if (move.promotion) {
    // Without the piece the phrase fits all four promotions alike, so the caller is asked.
    const piece = PROMOTION_TOK[move.promotion]
    const bases = [...phrases]
    for (const base of bases) {
      add(base.cost, ...base.toks, piece) // "e8 queen"
      add(base.cost, ...base.toks, '=', piece) // "e8 equals queen", "e8 promote to queen"
    }
    add(0, '=', piece) // "promote to knight"
    add(0, 'P', '=', piece)
  }

  add(PIECE_ALONE, role)
  return phrases
}
