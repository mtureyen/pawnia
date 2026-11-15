import { sayMove, type Color, type GameStatus, type PlayedMove } from '@pawnia/chess'
import type { Termination } from '@pawnia/play'
import { announcement, sayEnd } from '@/shared/voice/announce'

/** How a game that didn't end on the board is said, to the player `you`. */
export function sayTermination(termination: Termination, you: Color): string {
  switch (termination.reason) {
    case 'agreement':
      return 'draw agreed'
    case 'resignation': // only the user resigns
      return 'you resigned'
    case 'timeout':
      if (termination.draw) return 'time out, draw by insufficient material'
      return termination.loser === you ? 'you lost on time' : 'you win on time'
  }
}

/**
 * What to say in a bot game when a move has been played (`move`) and/or the game has just ended
 * (`ended`): the bot's moves, the user's own only with `ownMoves`; then how it ended.
 */
export function botGameAnnouncement({
  move,
  ended,
  status,
  termination,
  you,
  ownMoves,
}: {
  move: PlayedMove | undefined
  ended: boolean
  status: GameStatus
  termination: Termination | undefined
  you: Color
  ownMoves: boolean
}): string {
  const said = move && (move.color !== you || ownMoves) ? sayMove(move.san) : undefined
  const end = !ended
    ? undefined
    : termination
      ? sayTermination(termination, you)
      : sayEnd(status, you)
  return announcement(said, end)
}
