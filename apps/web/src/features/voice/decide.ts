import { readSpokenMove, type SpokenMove } from '@pawnia/chess'
import { cleanTranscript } from './transcript'

/** The commands a page can carry out. `confirm` and `cancel` answer the questions below. */
export type PageCommand = 'takeBack' | 'flip' | 'resign' | 'draw'

/** What the page lets the voice do right now. */
export interface VoiceContext {
  fen: string
  /** Why no move can be played now ("It's not your turn."); undefined when one can. */
  noMove?: string
  /** The commands the page has and allows at this moment. */
  commands: ReadonlySet<PageCommand>
}

/** A question to the player, answered by the next utterance or a click. */
export type Question =
  /** Which of these moves? In the position they were found in; a new position drops it. */
  | { kind: 'which'; moves: SpokenMove[]; fen: string }
  /** Resign or offer a draw, really? */
  | { kind: 'confirm'; command: 'resign' | 'draw' }

export type Outcome =
  | { kind: 'play'; move: SpokenMove }
  | { kind: 'command'; command: PageCommand }
  | { kind: 'ask'; question: Question }
  | { kind: 'nothing' }

export interface Decision {
  outcome: Outcome
  /** What was heard, cleaned up; empty when nothing was. */
  heard: string
  /** What came of it, in a few words ("Played Nf3.", "Not a move here."). */
  note: string
  /** The question still open afterwards (a `which` left unanswered stays). */
  question?: Question
  /**
   * Nothing fit what was said, no question was open and a move could be played: someone who reads
   * free words (the coach) may still tell which move was meant.
   */
  unread?: true
}

const COMMAND_DONE: Record<PageCommand, string> = {
  takeBack: 'Took the move back.',
  flip: 'Turned the board.',
  resign: 'Resigned.',
  draw: 'Offered a draw.',
}
const COMMAND_MISSING: Record<PageCommand, string> = {
  takeBack: 'No take-back here now.',
  flip: 'The board can’t be turned here.',
  resign: 'Nothing to resign here.',
  draw: 'No draw offer here now.',
}
const CONFIRM_ASK: Record<'resign' | 'draw', string> = {
  resign: 'Resign? Say “yes” or click Yes.',
  draw: 'Offer a draw? Say “yes” or click Yes.',
}

/**
 * What to do with a transcript, given what the page allows and any question asked before. A
 * question is answered first; what doesn't answer it is read as a phrase of its own (a new move,
 * a command), except that a `which` question stays open through words that fit nothing.
 */
export function decide(transcript: string, context: VoiceContext, question?: Question): Decision {
  const heard = cleanTranscript(transcript)
  const open = question?.kind === 'which' && question.fen !== context.fen ? undefined : question
  if (!heard) return { outcome: { kind: 'nothing' }, heard, note: 'Heard nothing.', question: open }
  const result = readSpokenMove(context.fen, heard)

  if (open?.kind === 'confirm') {
    if (result.kind === 'command' && result.command === 'confirm') return command(open.command)
    if (result.kind === 'command' && result.command === 'cancel')
      return nothing(open.command === 'resign' ? 'Not resigning.' : 'No draw offered.')
  }
  if (open?.kind === 'which') {
    if (result.kind === 'command' && result.command === 'cancel') return nothing('Cancelled.')
    if (result.kind === 'command' && result.command === 'confirm' && open.moves.length === 1)
      return play(open.moves[0]!)
    const picked = pickMove(heard, open.moves, context.fen)
    if (picked) return play(picked)
    if (result.kind === 'none')
      return { outcome: { kind: 'nothing' }, heard, note: 'Which one?', question: open }
  }

  switch (result.kind) {
    case 'move':
      return play(result.move)
    case 'ambiguous': {
      if (context.noMove) return nothing(context.noMove)
      const ask: Question = { kind: 'which', moves: result.moves, fen: context.fen }
      const note =
        result.moves.length === 1
          ? `${result.moves[0]!.san}? Say “yes”, or click it.`
          : 'Say the square it comes from, or click one.'
      return { outcome: { kind: 'ask', question: ask }, heard, note, question: ask }
    }
    case 'command': {
      const said = result.command
      if (said === 'confirm' || said === 'cancel') return nothing('Nothing to answer.')
      if (!context.commands.has(said)) return nothing(COMMAND_MISSING[said])
      if (said === 'resign' || said === 'draw') {
        const ask: Question = { kind: 'confirm', command: said }
        return {
          outcome: { kind: 'ask', question: ask },
          heard,
          note: CONFIRM_ASK[said],
          question: ask,
        }
      }
      return command(said)
    }
    case 'none':
      if (context.noMove || open) return nothing('Not a move here.')
      return { ...nothing('Not a move here.'), unread: true }
  }

  function play(move: SpokenMove): Decision {
    if (context.noMove) return nothing(context.noMove)
    return { outcome: { kind: 'play', move }, heard, note: `Played ${move.san}.` }
  }
  function command(said: PageCommand): Decision {
    if (!context.commands.has(said)) return nothing(COMMAND_MISSING[said])
    return { outcome: { kind: 'command', command: said }, heard, note: COMMAND_DONE[said] }
  }
  function nothing(note: string): Decision {
    return { outcome: { kind: 'nothing' }, heard, note }
  }
}

const ORDINALS: Record<string, number> = {
  one: 0,
  first: 0,
  '1': 0,
  '1st': 0,
  two: 1,
  second: 1,
  '2': 1,
  '2nd': 1,
  three: 2,
  third: 2,
  '3': 2,
  '3rd': 2,
  four: 3,
  fourth: 3,
  '4': 3,
  '4th': 3,
}
const ORDINAL_FILLER = new Set(['the', 'number', 'move', 'please', 'arrow'])

const ROLE_WORD: Record<string, string> = {
  N: 'knight',
  B: 'bishop',
  R: 'rook',
  Q: 'queen',
  K: 'king',
}

/**
 * Which of the moves a follow-up means: "the second one", or something that tells them apart
 * ("b1", "the one on b", "queen" for a promotion). The follow-up is read together with what the
 * moves have in common, by `readSpokenMove` itself: "the one on b1" for two knights going to d2
 * becomes "knight b1 d2", which fits Nbd2 alone. Undefined unless exactly one fits.
 */
export function pickMove(
  followUp: string,
  moves: readonly SpokenMove[],
  fen: string,
): SpokenMove | undefined {
  // "two", "the second one", "number 2": the moves are numbered on the board and in the list.
  const words = followUp
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !ORDINAL_FILLER.has(w))
  if (words.length === 2 && words[1] === 'one') words.pop()
  const index = words.length === 1 ? ORDINALS[words[0]!] : undefined
  if (index !== undefined && moves[index]) return moves[index]

  // "the one on b1" says no more than "b1"; a lone "one" stays, it may be a rank ("b one").
  const said = followUp.replace(/\b(the one|that one|the|on|from|at)\b/gi, ' ').trim()
  const tries = new Set<string>([followUp])
  for (const move of moves) {
    const role = ROLE_WORD[move.san[0]!] ?? 'pawn'
    tries.add(`${said} ${move.to}`)
    tries.add(`${move.to} ${said}`)
    tries.add(`${role} ${said} ${move.to}`)
  }
  const fits = new Set<SpokenMove>()
  for (const text of tries) {
    const result = readSpokenMove(fen, text)
    if (result.kind !== 'move') continue
    const match = moves.find((m) => sameMove(m, result.move))
    if (match) fits.add(match)
  }
  return fits.size === 1 ? [...fits][0] : undefined
}

function sameMove(a: SpokenMove, b: SpokenMove): boolean {
  return a.from === b.from && a.to === b.to && a.promotion === b.promotion
}
