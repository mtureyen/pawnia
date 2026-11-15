import { createGame } from '@pawnia/chess'
import { describe, expect, it } from 'vitest'
import { decide, pickMove, type PageCommand, type Question, type VoiceContext } from './decide'

function after(moves: string, fen?: string): string {
  const game = createGame(fen)
  for (const move of moves.split(' ').filter(Boolean)) {
    if (!game.play(move)) throw new Error(`illegal in test setup: ${move}`)
  }
  return game.fen()
}

const START = after('')
/** Both knights can go to d2. */
const TWO_KNIGHTS = after('d4 d5 Nf3 Nf6')
const PROMOTE = '8/P6k/8/8/8/8/6K1/8 w - - 0 1'
const ALL: ReadonlySet<PageCommand> = new Set(['takeBack', 'flip', 'resign', 'draw'])

const context = (fen: string, extra: Partial<VoiceContext> = {}): VoiceContext => ({
  fen,
  commands: ALL,
  ...extra,
})

/** The outcome in one line: "play Nf3", "ask Nbd2 Nfd2", "confirm resign", "command flip". */
function outcome(transcript: string, ctx: VoiceContext, question?: Question): string {
  const { outcome } = decide(transcript, ctx, question)
  switch (outcome.kind) {
    case 'play':
      return `play ${outcome.move.san}`
    case 'command':
      return `command ${outcome.command}`
    case 'ask':
      return outcome.question.kind === 'which'
        ? `ask ${outcome.question.moves.map((m) => m.san).join(' ')}`
        : `confirm ${outcome.question.command}`
    case 'nothing':
      return 'nothing'
  }
}

function whichOf(transcript: string, fen: string): Extract<Question, { kind: 'which' }> {
  const decision = decide(transcript, context(fen))
  if (decision.question?.kind !== 'which') throw new Error(`no question for ${transcript}`)
  return decision.question
}

describe('decide', () => {
  it('plays a clear move and says so', () => {
    const decision = decide('Knight f3.', context(START))
    expect(decision.outcome).toMatchObject({ kind: 'play', move: { from: 'g1', to: 'f3' } })
    expect(decision.note).toBe('Played Nf3.')
    expect(decision.heard).toBe('Knight f3.')
  })

  it('plays nothing when the page allows no move, and says why', () => {
    const decision = decide('e4', context(START, { noMove: 'It’s not your turn.' }))
    expect(decision.outcome.kind).toBe('nothing')
    expect(decision.note).toBe('It’s not your turn.')
  })

  it('asks which move when several fit, best first', () => {
    expect(outcome('knight d2', context(TWO_KNIGHTS))).toBe('ask Nbd2 Nfd2')
  })

  it('shows what was heard when nothing fits, and does nothing', () => {
    const decision = decide('What a lovely day.', context(START))
    expect(decision.outcome.kind).toBe('nothing')
    expect(decision.note).toBe('Not a move here.')
    expect(decision.heard).toBe('What a lovely day.')
  })

  it('drops what Whisper writes for silence', () => {
    expect(decide('[BLANK_AUDIO]', context(START)).note).toBe('Heard nothing.')
    expect(decide(' 4, 4, 4, 4, 4, 4', context(START)).note).toBe('Heard nothing.')
  })

  it('carries out a command the page has', () => {
    expect(outcome('Flip the board.', context(START))).toBe('command flip')
    expect(outcome('Take back.', context(START))).toBe('command takeBack')
  })

  it('says so when the page lacks a command', () => {
    const decision = decide('take back', context(START, { commands: new Set(['flip']) }))
    expect(decision.outcome.kind).toBe('nothing')
    expect(decision.note).toBe('No take-back here now.')
  })

  it('asks before resigning or offering a draw, and acts on yes', () => {
    const ask = decide('I resign.', context(START))
    expect(ask.outcome).toEqual({ kind: 'ask', question: { kind: 'confirm', command: 'resign' } })
    expect(outcome('Yes.', context(START), ask.question)).toBe('command resign')
    expect(outcome('no', context(START), ask.question)).toBe('nothing')
    expect(outcome('offer a draw', context(START))).toBe('confirm draw')
  })

  it('reads anything else after a confirmation question as a phrase of its own', () => {
    const ask = decide('I resign.', context(START)).question
    expect(outcome('e4', context(START), ask)).toBe('play e4')
  })

  it('answers "yes" with nothing when nothing was asked', () => {
    expect(decide('yes', context(START)).note).toBe('Nothing to answer.')
  })
})

describe('decide: answering "which one?"', () => {
  const which = () => whichOf('knight d2', TWO_KNIGHTS)

  it.each([
    ['b1', 'Nbd2'],
    ['the one on b1', 'Nbd2'],
    ['from f3', 'Nfd2'],
    ['f', 'Nfd2'],
    ['knight b d2', 'Nbd2'],
    ['the first one', 'Nbd2'],
    ['two', 'Nfd2'],
    ['Number 2.', 'Nfd2'],
  ])('"%s" picks %s', (followUp, san) => {
    expect(outcome(followUp, context(TWO_KNIGHTS), which())).toBe(`play ${san}`)
  })

  it('"cancel" drops the question', () => {
    const decision = decide('cancel', context(TWO_KNIGHTS), which())
    expect(decision.outcome.kind).toBe('nothing')
    expect(decision.question).toBeUndefined()
  })

  it('keeps asking through words that fit nothing', () => {
    const decision = decide('hmm what', context(TWO_KNIGHTS), which())
    expect(decision.note).toBe('Which one?')
    expect(decision.question).toEqual(which())
  })

  it('plays another clear move said instead', () => {
    expect(outcome('c4', context(TWO_KNIGHTS), which())).toBe('play c4')
  })

  it('forgets the question once the position has changed', () => {
    const moved = after('Nbd2', TWO_KNIGHTS)
    expect(decide('b1', context(moved), which()).question).toBeUndefined()
  })

  it('"yes" takes the one move a weak fit found', () => {
    // The knight on a1 has one move; a piece named alone never plays outright.
    const question = whichOf('knight', 'k7/8/8/8/8/1P6/8/N3K3 w - - 0 1')
    expect(question.moves).toHaveLength(1)
    expect(outcome('yes', context(question.fen), question)).toBe('play Nc2')
  })
})

describe('pickMove', () => {
  it('tells promotions apart by the piece', () => {
    const question = whichOf('a8', PROMOTE)
    if (question.kind !== 'which') throw new Error('expected a question')
    expect(pickMove('queen', question.moves, PROMOTE)?.san).toBe('a8=Q')
    expect(pickMove('knight', question.moves, PROMOTE)?.san).toBe('a8=N')
  })

  it('picks nothing when the follow-up fits several or none', () => {
    const question = whichOf('knight d2', TWO_KNIGHTS)
    if (question.kind !== 'which') throw new Error('expected a question')
    expect(pickMove('d2', question.moves, TWO_KNIGHTS)).toBeUndefined()
    expect(pickMove('banana', question.moves, TWO_KNIGHTS)).toBeUndefined()
  })
})
