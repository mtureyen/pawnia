import { z } from 'zod'
import { jsonIn } from './openingGuide'

/**
 * What the coach reads to tell which move a player meant by something said in free words ("take
 * the bishop with my knight"): the words as the speech recogniser wrote them, the position as a
 * list of pieces, and every legal move with what it does. Nothing about the game beyond that.
 */
export interface SpokenMoveFacts {
  /** What was heard, as the speech recogniser wrote it. */
  said: string
  /** The side to move: the player who spoke. */
  turn: 'white' | 'black'
  /** Where each side's pieces stand, as in "Kg1", "Nf3", "e4" (a pawn). */
  pieces: { white: string[]; black: string[] }
  /** Every legal move: its SAN and what it does in words ("knight f3 takes the pawn on e5"). */
  moves: { san: string; does: string }[]
}

export const SPOKEN_MOVE_PROMPT = `You help a chess player who moves by speaking. A speech recogniser wrote down what they said, and it could not be read as a move by simple rules: either the player said it in their own words ("take the bishop with my knight", "push the pawn in front of my king") or the recogniser misheard chess words ("night" for knight, "for" for 4, "see" for c, odd spellings of letters).

You get what was heard, the side to move (the player), where the pieces stand, and every legal move with what it does. Decide which one legal move the player meant.

Rules:
- Answer only with a move from the list, written exactly as its "san". Never a move that is not in the list.
- Only when the words point to one move clearly. If they could mean two or more of the moves, if they are not about a move at all (talk in the room, a question, a command like "take back" or "resign"), or if you are unsure, answer null. A wrong move is much worse than none: the player is asked to confirm either way, but null is always safe.
- Judge only what was said. Never pick a move because it is good or bad: you are not the player's opponent or their coach here.

Answer with one JSON object and nothing else: {"move": "<san from the list>"} or {"move": null}.`

/** The facts as the model reads them. */
export function spokenMoveText(facts: SpokenMoveFacts): string {
  return JSON.stringify(facts)
}

const Reply = z.object({ move: z.string().trim().min(1).nullable() })

/**
 * The move the reply names: a SAN from the facts' list, or null for none. Undefined when the
 * reply can't be used: not the JSON asked for, or a move that isn't in the list.
 */
export function parseSpokenMove(text: string, facts: SpokenMoveFacts): string | null | undefined {
  const parsed = Reply.safeParse(jsonIn(text))
  if (!parsed.success) return undefined
  const { move } = parsed.data
  if (move === null) return null
  return facts.moves.find((m) => m.san === move)?.san
}
