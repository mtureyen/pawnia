import {
  boardView,
  createGame,
  parseSanParts,
  sanVariants,
  type Color,
  type GameState,
  type Move,
  type NotationSlip,
  type Role,
} from '@pawnia/chess'
import { BUILT_IN_LINES } from './builtIn'
import { shuffle, weakness, weightedPick, type AnswerStat } from './squares'

/** A move to read or write: the position before it and the move. */
export interface NotationMove {
  fen: string
  san: string
  move: Move
  color: Color
  moveNumber: number
  /** Where the position comes from, in words: "your game Ann – Bob, 2 Oct 2026". */
  source: string
}

/**
 * What a move's notation has to say beyond the square: the kinds drilled. Plain pawn and piece
 * moves only come up when all kinds are.
 */
export type MoveKind =
  'pawn' | 'piece' | 'capture' | 'check' | 'castling' | 'promotion' | 'disambiguation'

export const MOVE_KINDS: readonly MoveKind[] = [
  'pawn',
  'piece',
  'capture',
  'check',
  'castling',
  'promotion',
  'disambiguation',
]

/** The kinds a move's SAN shows; a plain move is a pawn's or a piece's. */
export function moveKinds(san: string): MoveKind[] {
  const parts = parseSanParts(san)
  if (!parts) return []
  const kinds: MoveKind[] = []
  if (parts.castling) kinds.push('castling')
  if (parts.capture) kinds.push('capture')
  if (parts.suffix) kinds.push('check')
  if (parts.promotion) kinds.push('promotion')
  if (parts.piece && (parts.fromFile || parts.fromRank)) kinds.push('disambiguation')
  if (kinds.length === 0) kinds.push(parts.piece ? 'piece' : 'pawn')
  return kinds
}

/**
 * Within a kind, the forms that should each come up: castling short and long, check and mate,
 * a queen and less, which piece by file and by rank.
 */
function flavour(san: string, kind: MoveKind): string {
  const parts = parseSanParts(san)
  if (!parts) return ''
  switch (kind) {
    case 'castling':
      return parts.castling ?? ''
    case 'check':
      return parts.suffix
    case 'promotion':
      return parts.promotion === 'Q' ? 'queen' : 'under'
    case 'disambiguation':
      return parts.fromRank ? 'rank' : 'file'
    default:
      return ''
  }
}

/** Every move of the game's main line, each with the position before it. */
export function movesOfGame(game: GameState, source: string): NotationMove[] {
  game.toStart()
  return game.line().flatMap((node): NotationMove[] => {
    const { parent, move } = node
    if (!parent || !move) return []
    const { from, to, promotion } = move
    return [
      {
        fen: parent.fen,
        san: move.san,
        move: { from, to, ...(promotion && { promotion }) },
        color: move.color,
        moveNumber: move.moveNumber,
        source,
      },
    ]
  })
}

/** The built-in lines' moves. */
export function builtInMoves(): NotationMove[] {
  return BUILT_IN_LINES.flatMap(({ source, fen, moves }) => {
    const game = createGame(fen)
    for (const san of moves.split(' ')) game.play(san)
    return movesOfGame(game, source)
  })
}

/** Fewer moves than this of a form in the user's games, and the built-in ones of it join them. */
const ENOUGH_OF_A_FORM = 3

/**
 * The moves to drill: the user's own, and the built-in ones of every form their games have too
 * few of (most have no promotion, many no long castling), so each kind of notation comes up.
 */
export function movePool(own: readonly NotationMove[], builtIn = builtInMoves()): NotationMove[] {
  const forms = (m: NotationMove) =>
    moveKinds(m.san).map((kind) => `${kind}:${flavour(m.san, kind)}`)
  const count = new Map<string, number>()
  for (const m of own) for (const f of forms(m)) count.set(f, (count.get(f) ?? 0) + 1)
  const missing = (m: NotationMove) => forms(m).some((f) => (count.get(f) ?? 0) < ENOUGH_OF_A_FORM)
  return [...own, ...builtIn.filter(missing)]
}

/** A kind of move missed every time lately comes up this many times as often as a known one. */
const WEAK_KIND_WEIGHT = 4

/**
 * The next move to drill. First a kind (all of the pool's, or the one asked for), the weak ones
 * more often; then a form of it (castling short or long, …), each as likely; then a move of
 * that form, never the one just asked.
 */
export function pickMove(
  pool: readonly NotationMove[],
  stats: Readonly<Partial<Record<MoveKind, AnswerStat>>>,
  random: () => number,
  { only, previous }: { only?: MoveKind; previous?: NotationMove } = {},
): { move: NotationMove; kind: MoveKind } | undefined {
  const fresh = pool.filter((m) => m !== previous)
  const candidates = fresh.length > 0 ? fresh : pool
  const kinds = MOVE_KINDS.filter(
    (k) => (!only || k === only) && candidates.some((m) => moveKinds(m.san).includes(k)),
  )
  if (kinds.length === 0) return undefined
  const kind = weightedPick(kinds, (k) => 1 + (WEAK_KIND_WEIGHT - 1) * weakness(stats[k]), random)
  const ofKind = candidates.filter((m) => moveKinds(m.san).includes(kind))
  const forms = [...new Set(ofKind.map((m) => flavour(m.san, kind)))]
  const form = forms[Math.floor(random() * forms.length)]
  const ofForm = ofKind.filter((m) => flavour(m.san, kind) === form)
  return { move: ofForm[Math.floor(random() * ofForm.length)]!, kind }
}

/** Slips about what the move itself shows: offered first, they are the ones worth telling apart. */
const OWN_SLIPS: ReadonlySet<NotationSlip> = new Set([
  'capture-missing',
  'pawn-file-missing',
  'check-missing',
  'mate-as-check',
  'disambiguation-missing',
  'disambiguation-wrong',
  'castling-side',
  'promotion-piece',
  'promotion-missing',
])

export interface MoveChoice {
  san: string
  /** How a wrong choice differs from the right one; none on the right one. */
  slip?: NotationSlip
}

/**
 * The answers offered for "name the move": its SAN and wrong spellings of it, each wrong in one
 * detail. Up to two about what the move itself shows (its x, its +, which piece), the rest
 * about what it doesn't; in random order.
 */
export function moveChoices(
  fen: string,
  san: string,
  random: () => number,
  count = 4,
): MoveChoice[] {
  const variants = shuffle(sanVariants(fen, san), random)
  const own = variants.filter((v) => OWN_SLIPS.has(v.slip))
  const other = variants.filter((v) => !OWN_SLIPS.has(v.slip))
  const wrong = [...own.slice(0, 2), ...other, ...own.slice(2)].slice(0, count - 1)
  return shuffle([{ san }, ...wrong], random)
}

/** Which kind of notation a slip is about, so a miss counts against that kind. */
export function slipKind(slip: NotationSlip): MoveKind | undefined {
  if (slip.startsWith('capture') || slip === 'pawn-file-missing') return 'capture'
  if (slip.startsWith('check') || slip === 'mate-as-check') return 'check'
  if (slip.startsWith('castling')) return 'castling'
  if (slip.startsWith('promotion')) return 'promotion'
  if (slip.startsWith('disambiguation')) return 'disambiguation'
  return undefined
}

const ROLE_NAMES: Record<Role, string> = {
  pawn: 'pawn',
  knight: 'knight',
  bishop: 'bishop',
  rook: 'rook',
  queen: 'queen',
  king: 'king',
}
const LETTER_ROLES: Record<string, Role> = {
  K: 'king',
  Q: 'queen',
  R: 'rook',
  B: 'bishop',
  N: 'knight',
}

/** A move in plain words: "Nbd2: the knight on b1 goes to d2. The b says which knight." */
export function describeMove({ fen, san, move, color }: NotationMove): string {
  const parts = parseSanParts(san)
  if (!parts) return san
  const side = color === 'white' ? 'White' : 'Black'
  const check =
    parts.suffix === '#' ? ', and it is mate' : parts.suffix === '+' ? ', with check' : ''
  if (parts.castling) {
    const short = parts.castling === 'short'
    const rank = color === 'white' ? '1' : '8'
    return (
      `${san}: ${side} castles ${short ? 'short (on the king’s side)' : 'long (on the queen’s side)'}` +
      `: the king goes to ${short ? 'g' : 'c'}${rank}, the rook to ${short ? 'f' : 'd'}${rank}${check}.`
    )
  }
  const role = boardView(fen).pieceAt(move.from)?.role ?? 'pawn'
  const piece = ROLE_NAMES[role]
  const becomes = parts.promotion
    ? ` and becomes a ${ROLE_NAMES[LETTER_ROLES[parts.promotion]!]}`
    : ''
  const action = parts.capture ? 'takes on' : 'goes to'
  let text = `${san}: the ${piece} on ${move.from} ${action} ${move.to}${becomes}${check}.`
  if (parts.piece && (parts.fromFile || parts.fromRank)) {
    const which = `${parts.fromFile ?? ''}${parts.fromRank ?? ''}`
    text += ` The ${which} says which ${piece}: another one could go there too.`
  }
  return text
}

/** Why a wrong spelling is wrong, in plain words. */
export function slipText(slip: NotationSlip, right: NotationMove, chosen: string): string {
  const parts = parseSanParts(right.san)
  const role = boardView(right.fen).pieceAt(right.move.from)?.role ?? 'pawn'
  const piece = ROLE_NAMES[role]
  switch (slip) {
    case 'piece-letter': {
      const letter = chosen[0] ?? ''
      return `${letter} is the ${ROLE_NAMES[LETTER_ROLES[letter] ?? 'pawn']}; the ${piece} is ${parts?.piece ?? ''}.`
    }
    case 'pawn-letter':
      return 'A pawn has no letter: its move is just the square, like e4.'
    case 'capture-missing':
      return 'Something is taken, so an x goes before the square.'
    case 'capture-extra':
      return 'Nothing is taken, so there is no x.'
    case 'pawn-file-missing':
      return `A pawn capture starts with the file the pawn came from: ${right.san}.`
    case 'check-missing':
      return parts?.suffix === '#'
        ? 'The move mates, so it ends with #.'
        : 'The move gives check, so it ends with +.'
    case 'check-extra':
      return 'The move gives no check, so there is no +.'
    case 'mate-as-check':
      return 'It is mate, not just check: # instead of +.'
    case 'disambiguation-missing':
      return `Two ${piece}s could go to ${right.move.to}, so the letter or number after the ${piece}’s letter says which one moves.`
    case 'disambiguation-wrong':
      return `That would be the other ${piece}; the one that moves stands on ${right.move.from}.`
    case 'disambiguation-rank':
      return 'When the file already tells which piece moves, the file is written, not the rank.'
    case 'disambiguation-extra':
      return `Only one ${piece} can go to ${right.move.to}, so nothing more is needed.`
    case 'castling-side':
      return 'O-O castles short, on the king’s side; O-O-O long, on the queen’s side.'
    case 'castling-as-king-move':
      return 'Castling has its own sign, O-O or O-O-O, not the king’s move.'
    case 'promotion-piece':
      return `The pawn becomes a ${ROLE_NAMES[LETTER_ROLES[parts?.promotion ?? 'Q']!]}: =${parts?.promotion ?? 'Q'}.`
    case 'promotion-missing':
      return 'A pawn reaching the last rank says what it becomes: =Q for a queen.'
    case 'square':
      return `Mind the square: ${right.move.to}. Rank 1 is White’s side of the board, rank 8 Black’s.`
  }
}

/** The same move: what the user played against the one asked. */
export function sameMove(a: Move, b: Move): boolean {
  return a.from === b.from && a.to === b.to && a.promotion === b.promotion
}

/** The SAN of a move in a position; undefined if it isn't legal there. */
export function sanOf(fen: string, move: Move): string | undefined {
  return createGame(fen).play(move)?.move?.san
}
