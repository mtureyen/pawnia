import { boardView } from './board'
import { createGame } from './game'
import type { SquareName } from './types'

export type PieceLetter = 'K' | 'Q' | 'R' | 'B' | 'N'
export type PromotionLetter = 'Q' | 'R' | 'B' | 'N'

/** A move in standard algebraic notation (SAN), taken apart. */
export interface SanParts {
  castling?: 'short' | 'long'
  /** The piece's letter; absent for a pawn and for castling. */
  piece?: PieceLetter
  /**
   * What tells which piece moves when two of the same kind could: its file, rank or both. On a
   * pawn capture the file is the pawn's own and always written.
   */
  fromFile?: string
  fromRank?: string
  capture: boolean
  /** Where the piece goes; absent for castling. */
  to?: SquareName
  promotion?: PromotionLetter
  /** "+" gives check, "#" mates. */
  suffix: '' | '+' | '#'
}

const SAN = /^([KQRBN])?([a-h])?([1-8])?(x)?([a-h][1-8])(?:=([QRBN]))?([+#])?$/
const CASTLING = /^(O-O-O|O-O)([+#])?$/

/** Takes a SAN apart; undefined if it isn't one (the move need not be legal anywhere). */
export function parseSanParts(san: string): SanParts | undefined {
  const castle = CASTLING.exec(san)
  if (castle)
    return {
      castling: castle[1] === 'O-O' ? 'short' : 'long',
      capture: false,
      suffix: (castle[2] ?? '') as SanParts['suffix'],
    }
  const m = SAN.exec(san)
  if (!m) return undefined
  const [, piece, file, rank, x, to, promotion, suffix] = m
  // A pawn is told apart by its file only, and only when it captures; only a pawn promotes.
  if (!piece && (rank || (file && !x))) return undefined
  if (piece && promotion) return undefined
  return {
    ...(piece && { piece: piece as PieceLetter }),
    ...(file && { fromFile: file }),
    ...(rank && { fromRank: rank }),
    capture: x === 'x',
    to: to as SquareName,
    ...(promotion && { promotion: promotion as PromotionLetter }),
    suffix: (suffix ?? '') as SanParts['suffix'],
  }
}

/** Puts a SAN back together. */
export function formatSan(parts: SanParts): string {
  if (parts.castling) return (parts.castling === 'short' ? 'O-O' : 'O-O-O') + parts.suffix
  return [
    parts.piece ?? '',
    parts.fromFile ?? '',
    parts.fromRank ?? '',
    parts.capture ? 'x' : '',
    parts.to ?? '',
    parts.promotion ? `=${parts.promotion}` : '',
    parts.suffix,
  ].join('')
}

/** The one detail in which a wrong spelling of a move differs from the right one. */
export type NotationSlip =
  /** Another piece's letter. */
  | 'piece-letter'
  /** A "P" for a pawn, which has no letter. */
  | 'pawn-letter'
  /** A capture written without its "x". */
  | 'capture-missing'
  /** An "x" where nothing is taken. */
  | 'capture-extra'
  /** A pawn capture without the file the pawn came from. */
  | 'pawn-file-missing'
  /** A check written without its "+". */
  | 'check-missing'
  /** A "+" where there is no check. */
  | 'check-extra'
  /** A mate written as a mere check. */
  | 'mate-as-check'
  /** Two pieces of the kind could go there, and nothing says which. */
  | 'disambiguation-missing'
  /** Names the other piece that could go there. */
  | 'disambiguation-wrong'
  /** The rank where the file would already tell. */
  | 'disambiguation-rank'
  /** Says which piece where only one could go. */
  | 'disambiguation-extra'
  /** The other side's castling. */
  | 'castling-side'
  /** Castling written as the king's move. */
  | 'castling-as-king-move'
  /** Another piece to promote to. */
  | 'promotion-piece'
  /** A pawn reaching the last rank without what it becomes. */
  | 'promotion-missing'
  /** The square as seen from the other side (rank 3 for rank 6). */
  | 'square'

export interface SanVariant {
  san: string
  slip: NotationSlip
}

const OTHER_LETTER: Record<PieceLetter, PieceLetter> = { N: 'K', K: 'N', B: 'N', R: 'Q', Q: 'K' }

/**
 * Wrong ways to write a move, each wrong in a single detail: the piece letter, the "x", the "+"
 * or "#", which of two pieces, the castling side, the promotion piece, the square. Only details
 * that make sense for the move come up: a pawn capture can lose its file, only a check its "+".
 * `san` is the move's SAN in the position `fen` (e.g. from `createGame(fen).play(move)`); a move
 * that isn't legal there has no variants.
 */
export function sanVariants(fen: string, san: string): SanVariant[] {
  const played = createGame(fen).play(san)?.move
  const parts = parseSanParts(played?.san ?? '')
  if (!played || !parts) return []
  const out: SanVariant[] = []
  const add = (slip: NotationSlip, change: Partial<SanParts>) => {
    const next = { ...parts, ...change }
    for (const key of Object.keys(change) as (keyof SanParts)[])
      if (change[key] === undefined) delete next[key]
    out.push({ san: formatSan(next), slip })
  }

  if (parts.castling) {
    add('castling-side', { castling: parts.castling === 'short' ? 'long' : 'short' })
    out.push({ san: `K${played.to}${parts.suffix}`, slip: 'castling-as-king-move' })
  } else if (parts.piece) {
    add('piece-letter', { piece: OTHER_LETTER[parts.piece] })
    const board = boardView(fen)
    const rivals = board
      .legalMoves()
      .filter(
        (m) =>
          m.to === played.to &&
          m.from !== played.from &&
          board.pieceAt(m.from)?.role === board.pieceAt(played.from)?.role,
      )
      .map((m) => m.from)
    const [rival] = rivals
    if (parts.fromFile || parts.fromRank) {
      add('disambiguation-missing', { fromFile: undefined, fromRank: undefined })
      if (rival)
        add('disambiguation-wrong', {
          ...(parts.fromFile && { fromFile: rival[0] }),
          ...(parts.fromRank && { fromRank: rival[1] }),
        })
      if (parts.fromFile && !parts.fromRank)
        add('disambiguation-rank', { fromFile: undefined, fromRank: played.from[1] })
    } else if (parts.piece !== 'K') {
      add('disambiguation-extra', { fromFile: played.from[0] })
    }
    add(parts.capture ? 'capture-missing' : 'capture-extra', { capture: !parts.capture })
  } else {
    out.push({ san: `P${played.san}`, slip: 'pawn-letter' })
    if (parts.capture) {
      add('capture-missing', { capture: false })
      add('pawn-file-missing', { fromFile: undefined })
    }
  }

  if (parts.promotion) {
    add('promotion-piece', { promotion: parts.promotion === 'Q' ? 'N' : 'Q' })
    add('promotion-missing', { promotion: undefined })
  } else if (parts.to) {
    add('square', { to: `${parts.to[0]}${9 - Number(parts.to[1])}` as SquareName })
  }

  if (parts.suffix === '#') {
    add('mate-as-check', { suffix: '+' })
    add('check-missing', { suffix: '' })
  } else if (parts.suffix === '+') {
    add('check-missing', { suffix: '' })
  } else {
    add('check-extra', { suffix: '+' })
  }

  const seen = new Set([played.san])
  return out.filter((v) => !seen.has(v.san) && (seen.add(v.san), true))
}
