import type { PlayedMove } from '@pawnia/chess'
import { describe, expect, it } from 'vitest'
import { botGameAnnouncement, sayTermination } from './botVoice'

const move = (san: string, color: 'white' | 'black'): PlayedMove => ({
  from: 'e2',
  to: 'e4',
  uci: 'e2e4',
  san,
  color,
  moveNumber: 1,
})
const ongoing = { kind: 'ongoing' } as const
const base = { ended: false, status: ongoing, termination: undefined, you: 'white' as const }

describe('botGameAnnouncement', () => {
  it("says the bot's moves, the user's own only when asked", () => {
    expect(botGameAnnouncement({ ...base, move: move('Nc6', 'black'), ownMoves: false })).toBe(
      'knight c6',
    )
    expect(botGameAnnouncement({ ...base, move: move('Nf3', 'white'), ownMoves: false })).toBe('')
    expect(botGameAnnouncement({ ...base, move: move('Nf3', 'white'), ownMoves: true })).toBe(
      'knight f3',
    )
  })

  it('says how the game ended, after the move that ended it', () => {
    expect(
      botGameAnnouncement({
        ...base,
        move: move('Qxf7#', 'white'),
        ended: true,
        status: { kind: 'checkmate', winner: 'white' },
        ownMoves: true,
      }),
    ).toBe('queen takes f7, checkmate, you win')
    // The user's mating move isn't read, the end still is.
    expect(
      botGameAnnouncement({
        ...base,
        move: move('Qxf7#', 'white'),
        ended: true,
        status: { kind: 'checkmate', winner: 'white' },
        ownMoves: false,
      }),
    ).toBe('checkmate, you win')
    expect(
      botGameAnnouncement({
        ...base,
        move: move('Kg7', 'black'),
        ended: true,
        status: { kind: 'draw', reason: 'threefold-repetition' },
        ownMoves: false,
      }),
    ).toBe('king g7. draw by repetition')
  })

  it('says an end that came off the board', () => {
    expect(
      botGameAnnouncement({
        ...base,
        move: undefined,
        ended: true,
        termination: { reason: 'timeout', loser: 'white', draw: false },
        ownMoves: false,
      }),
    ).toBe('you lost on time')
  })
})

describe('sayTermination', () => {
  it('says each way a game can end off the board', () => {
    expect(sayTermination({ reason: 'agreement' }, 'white')).toBe('draw agreed')
    expect(sayTermination({ reason: 'resignation', loser: 'black' }, 'black')).toBe('you resigned')
    expect(sayTermination({ reason: 'timeout', loser: 'black', draw: false }, 'white')).toBe(
      'you win on time',
    )
    expect(sayTermination({ reason: 'timeout', loser: 'black', draw: true }, 'white')).toBe(
      'time out, draw by insufficient material',
    )
  })
})
