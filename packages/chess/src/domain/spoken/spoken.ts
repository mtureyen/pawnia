/**
 * Spoken moves: a transcript of what a player said, read as a move or a command in a position.
 *
 * Every legal move is scored against what was heard: `words.ts` reads the words as tokens with
 * costs, `phrases.ts` lists the ways each move can be said, and the cheapest alignment of the two
 * is the move's cost. Scoring instead of a fixed grammar lets one misheard word cost a little
 * instead of losing the phrase. The approach is the one lichess's voice input takes
 * (github.com/lichess-org/lila, `ui/voice`, AGPL-3.0); the code and the word table are our own.
 */
import { castlingSide, normalizeMove } from 'chessops/chess'
import { makeSan } from 'chessops/san'
import type { Role } from 'chessops/types'
import { parseSquare } from 'chessops/util'
import { legalMovesOf, positionFromFen } from '../game'
import type { Move } from '../types'
import { phrasesOf, type MoveFacts } from './phrases'
import { cleanWords, slotsOf, type RoleTok, type Slot, type Tok } from './words'

/** A legal move that fits what was said, with its SAN for showing it ("Nf3", "O-O", "e8=Q"). */
export interface SpokenMove extends Move {
  san: string
}

/**
 * The commands a phrase can be instead of a move. `draw` offers a draw, or accepts the one on the
 * table; `cancel` and `confirm` answer a question the caller asked (e.g. which of two moves).
 */
export type SpokenCommand = 'takeBack' | 'flip' | 'resign' | 'draw' | 'cancel' | 'confirm'

/**
 * What a transcript says in a position. `heard` is always the transcript as given, trimmed, for
 * showing it back ("heard: knight to f3").
 *
 * - `move`: one legal move fits clearly; play it.
 * - `ambiguous`: one or more moves fit, but not clearly enough to play: several fit equally
 *   ("knight d2" with two knights that can go there), or the fit is weak (a misheard word too
 *   many, a lone "knight"). Best fit first; ask the player, never play one of them unasked.
 * - `command`: the whole phrase is a command.
 * - `none`: nothing fits. Show what was heard; a later step may ask an AI what was meant.
 */
export type SpokenResult =
  | { kind: 'move'; move: SpokenMove; heard: string }
  | { kind: 'ambiguous'; moves: SpokenMove[]; heard: string }
  | { kind: 'command'; command: SpokenCommand; heard: string }
  | { kind: 'none'; heard: string }

/**
 * The phrases each command answers to, as cleaned words (see `COMMAND_FILLER` for what may be said
 * around them: "take it back", "flip the board", "I resign", "offer a draw").
 */
export const SPOKEN_COMMANDS: Readonly<Record<SpokenCommand, readonly string[]>> = {
  takeBack: ['take back', 'takeback', 'undo'],
  flip: ['flip', 'rotate'],
  resign: ['resign', 'give up'],
  // "All for a draw" is how Whisper wrote "offer a draw" in an Irish voice. Only the whole phrase
  // counts, and it holds no move, so no move can become a draw offer by it.
  draw: ['draw', 'offer draw', 'draw offer', 'accept draw', 'all for draw'],
  cancel: ['cancel', 'no', 'never mind', 'nevermind'],
  confirm: ['yes', 'yeah', 'confirm'],
}

/** Words that may stand around a command without changing it. */
const COMMAND_FILLER = new Set(
  'a the it that this my move board please i lets can you we now ok okay so um uh thank thanks'.split(
    ' ',
  ),
)

/**
 * When a fit is good enough. Costs add up from the words (see `words.ts`) and the phrase
 * (`phrases.ts`): 0 is the move said outright, 0.1–0.2 per usual mishearing.
 *
 * A move is played when its cost is at most PLAY_AT_MOST and the next best move costs at least
 * CLEAR_LEAD more. So one or two usual mishearings ("night f3", "e for") still play, one unknown
 * word or a near miss ("kniht") asks. Moves up to FIT_AT_MOST count as fits at all; above it
 * nothing does, so a piece named that can't make the move ("knight f6" with no knight there)
 * gives `none` rather than another piece's move. An ambiguous answer lists the moves within
 * SHOW_WITHIN of the best.
 */
const PLAY_AT_MOST = 0.35
const CLEAR_LEAD = 0.3
const FIT_AT_MOST = 0.75
const SHOW_WITHIN = 0.4
/** Costs are sums of tenths; 0.15 + 0.2 must count as 0.35. */
const EPSILON = 1e-9

/**
 * Reads a transcript of something said (as a speech recogniser writes it) as a move or a command
 * in the position. Only legal moves can come out, and only one that fits clearly is a `move`.
 * Throws `InvalidPositionError` on a FEN that isn't a legal position.
 */
export function readSpokenMove(fen: string, transcript: string): SpokenResult {
  const pos = positionFromFen(fen)
  const heard = transcript.trim().replace(/\s+/g, ' ')
  const words = cleanWords(transcript)

  const command = commandOf(words)
  if (command) return { kind: 'command', command, heard }

  const slots = slotsOf(words)
  const ranked = legalMovesOf(pos)
    .map((move) => {
      const facts = factsOf(pos, move)
      const cost = Math.min(...phrasesOf(facts).map((p) => p.cost + alignCost(slots, p.toks)))
      return { move, cost }
    })
    .filter((fit) => fit.cost <= FIT_AT_MOST + EPSILON)
    .sort((a, b) => a.cost - b.cost)

  const [best, next] = ranked
  if (!best) return { kind: 'none', heard }
  const spoken = (move: Move): SpokenMove => ({ ...move, san: sanOf(pos, move) })
  if (
    best.cost <= PLAY_AT_MOST + EPSILON &&
    (!next || next.cost - best.cost >= CLEAR_LEAD - EPSILON)
  )
    return { kind: 'move', move: spoken(best.move), heard }
  const moves = ranked.filter((fit) => fit.cost - best.cost <= SHOW_WITHIN + EPSILON)
  return { kind: 'ambiguous', moves: moves.map((fit) => spoken(fit.move)), heard }
}

function commandOf(words: readonly string[]): SpokenCommand | undefined {
  const phrase = words.filter((word) => !COMMAND_FILLER.has(word)).join(' ')
  if (!phrase) return undefined
  return (Object.keys(SPOKEN_COMMANDS) as SpokenCommand[]).find((command) =>
    SPOKEN_COMMANDS[command].includes(phrase),
  )
}

/**
 * The cheapest way to read the heard slots as exactly the phrase's tokens, in order: each slot is
 * either read (as one of its readings, which must match the next tokens) or skipped at its skip
 * cost. Every token of the phrase must be covered; Infinity if they can't be.
 */
function alignCost(slots: readonly Slot[], toks: readonly Tok[]): number {
  const width = toks.length + 1
  const best = new Array<number>((slots.length + 1) * width).fill(Infinity)
  best[0] = 0
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i]!
    for (let j = 0; j <= toks.length; j++) {
      const here = best[i * width + j]!
      if (here === Infinity) continue
      const skip = (i + 1) * width + j
      best[skip] = Math.min(best[skip]!, here + slot.skip)
      for (const reading of slot.readings) {
        const end = j + reading.toks.length
        if (end > toks.length || reading.toks.some((tok, k) => toks[j + k] !== tok)) continue
        const read = (i + 1) * width + end
        best[read] = Math.min(best[read]!, here + reading.cost)
      }
    }
  }
  return best[slots.length * width + toks.length]!
}

const ROLE_TOK: Record<Role, RoleTok> = {
  pawn: 'P',
  knight: 'N',
  bishop: 'B',
  rook: 'R',
  queen: 'Q',
  king: 'K',
}

type Position = ReturnType<typeof positionFromFen>

function factsOf(pos: Position, move: Move): MoveFacts {
  const from = parseSquare(move.from)
  const to = parseSquare(move.to)
  const role = pos.board.getRole(from)!
  const target = pos.board.get(to)
  const facts: MoveFacts = { from: move.from, to: move.to, role: ROLE_TOK[role] }
  if (target && target.color !== pos.turn) facts.victim = ROLE_TOK[target.role]
  else if (role === 'pawn' && move.from[0] !== move.to[0]) facts.victim = 'P' // en passant
  if (move.promotion) facts.promotion = move.promotion
  const side = castlingSide(pos, normalizeMove(pos, { from, to }))
  if (side) facts.castle = side === 'h' ? 'short' : 'long'
  return facts
}

function sanOf(pos: Position, move: Move): string {
  const from = parseSquare(move.from)
  const to = parseSquare(move.to)
  return makeSan(pos, normalizeMove(pos, { from, to, promotion: move.promotion }))
}
