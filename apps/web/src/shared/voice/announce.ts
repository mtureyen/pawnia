import { sayMove, type Color, type GameStatus } from '@pawnia/chess'

const DRAWS: Record<Extract<GameStatus, { kind: 'draw' }>['reason'], string> = {
  stalemate: 'draw by stalemate',
  'insufficient-material': 'draw, insufficient material',
  'threefold-repetition': 'draw by repetition',
  'fifty-move-rule': 'draw by the fifty move rule',
}

/**
 * How a game that ended on the board is said: "checkmate, you win" to the player `you`, else
 * "checkmate, white wins"; "draw by repetition". Undefined while it goes on.
 */
export function sayEnd(status: GameStatus, you?: Color): string | undefined {
  switch (status.kind) {
    case 'ongoing':
      return undefined
    case 'draw':
      return DRAWS[status.reason]
    case 'checkmate':
      if (!you) return `checkmate, ${status.winner} wins`
      return status.winner === you ? 'checkmate, you win' : 'checkmate, you lost'
  }
}

/**
 * A move and how the game ended, as one thing to say. A mating move already says "checkmate":
 * "queen h7, checkmate, you win", not "checkmate" twice.
 */
export function announcement(move: string | undefined, end: string | undefined): string {
  if (!move) return end ?? ''
  if (!end) return move
  if (move.endsWith(', checkmate') && end.startsWith('checkmate, '))
    return `${move}, ${end.slice('checkmate, '.length)}`
  return `${move}. ${end}`
}

/** SAN in running text: "Nf3" but not "Nf" or "a" alone; a number before it ("12...") stays. */
const SAN_IN_TEXT =
  /(?<![\w-])(O-O-O|O-O|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[+#]?)(?![\w-])/g

/**
 * A coach comment (Markdown) as it is said: without the marks, and with the moves in it said
 * as moves ("Nf3" as "knight f3").
 */
export function sayComment(markdown: string): string {
  return (
    markdown
      // Links: their text.
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/[*_`#>~]+/g, '')
      .replace(SAN_IN_TEXT, (san: string) => sayMove(san))
      .replace(/\s+/g, ' ')
      .trim()
  )
}
