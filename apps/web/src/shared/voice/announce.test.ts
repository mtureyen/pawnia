import { describe, expect, it } from 'vitest'
import { announcement, sayComment, sayEnd } from './announce'

describe('sayEnd', () => {
  it('says who won, to the player or to both', () => {
    expect(sayEnd({ kind: 'checkmate', winner: 'white' }, 'white')).toBe('checkmate, you win')
    expect(sayEnd({ kind: 'checkmate', winner: 'white' }, 'black')).toBe('checkmate, you lost')
    expect(sayEnd({ kind: 'checkmate', winner: 'black' })).toBe('checkmate, black wins')
  })

  it('says why it is a draw', () => {
    expect(sayEnd({ kind: 'draw', reason: 'threefold-repetition' })).toBe('draw by repetition')
    expect(sayEnd({ kind: 'draw', reason: 'stalemate' }, 'white')).toBe('draw by stalemate')
  })

  it('says nothing while the game goes on', () => {
    expect(sayEnd({ kind: 'ongoing' })).toBeUndefined()
  })
})

describe('announcement', () => {
  it('says checkmate once', () => {
    expect(announcement('queen h7, checkmate', 'checkmate, you win')).toBe(
      'queen h7, checkmate, you win',
    )
  })

  it('puts a move and the end one after the other', () => {
    expect(announcement('king g2', 'draw by repetition')).toBe('king g2. draw by repetition')
    expect(announcement(undefined, 'checkmate, you lost')).toBe('checkmate, you lost')
    expect(announcement('e4', undefined)).toBe('e4')
    expect(announcement(undefined, undefined)).toBe('')
  })
})

describe('sayComment', () => {
  it('drops the Markdown and says the moves in it', () => {
    expect(sayComment('**Nice!** After 12... Qxb7 the `c6` pawn hangs; Bxe5+ wins it.')).toBe(
      'Nice! After 12... queen takes b7 the c6 pawn hangs; bishop takes e5, check wins it.',
    )
    expect(sayComment('Castling with O-O keeps the [king](x) safe.')).toBe(
      'Castling with castles kingside keeps the king safe.',
    )
  })

  it('leaves words alone that only look a bit like moves', () => {
    expect(sayComment('A bad move, and e.g. a plan for b-file pressure.')).toBe(
      'A bad move, and e.g. a plan for b-file pressure.',
    )
  })
})
