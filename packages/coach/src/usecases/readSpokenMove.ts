import type { CancelSignal } from '../domain/messages'
import {
  parseSpokenMove,
  SPOKEN_MOVE_PROMPT,
  spokenMoveText,
  type SpokenMoveFacts,
} from '../domain/spokenMove'
import type { CoachAgent } from '../ports/coachAgent'

/** Tries for a reply that can be used: models sometimes wrap their JSON or name a move not listed. */
const ATTEMPTS = 2

/**
 * Which legal move the player meant by what they said, as the coach reads it: one model turn, no
 * tools (a game is going on: nothing may reach an engine), no conversation. Null when the coach
 * can't tell; only ever a SAN from `facts.moves`.
 */
export async function readSpokenMoveWithCoach(
  agent: CoachAgent,
  facts: SpokenMoveFacts,
  signal?: CancelSignal,
): Promise<string | null> {
  if (facts.moves.length === 0) return null
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const text = await agent.compose({
      system: SPOKEN_MOVE_PROMPT,
      text: spokenMoveText(facts),
      ...(signal && { signal }),
    })
    const move = parseSpokenMove(text, facts)
    if (move !== undefined) return move
  }
  throw new Error('The coach gave no usable move')
}
