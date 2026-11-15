import { createGame, importPgn } from '@pawnia/chess'
import { describe, expect, it } from 'vitest'
import { BUILT_IN_LINES } from './builtIn'
import {
  builtInMoves,
  describeMove,
  moveChoices,
  moveKinds,
  movePool,
  movesOfGame,
  pickMove,
  sameMove,
  sanOf,
  slipKind,
  slipText,
  type NotationMove,
} from './moves'
import { recordAnswer } from './squares'

function seeded(seed = 1): () => number {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

const builtIn = builtInMoves()
const find = (san: string) => builtIn.find((m) => m.san === san)!

describe('the built-in lines', () => {
  it('are all legal, written as the board writes them', () => {
    for (const { fen, moves } of BUILT_IN_LINES) {
      const game = createGame(fen)
      for (const san of moves.split(' ')) expect(game.play(san)?.move?.san, san).toBe(san)
    }
  })

  it('have every kind of notation, castling both ways, mate and promotion below a queen', () => {
    const sans = builtIn.map((m) => m.san)
    for (const kind of ['capture', 'check', 'castling', 'promotion', 'disambiguation'] as const)
      expect(
        builtIn.some((m) => moveKinds(m.san).includes(kind)),
        kind,
      ).toBe(true)
    expect(sans).toContain('O-O')
    expect(sans).toContain('O-O-O')
    expect(sans.some((s) => s.endsWith('#'))).toBe(true)
    expect(sans.some((s) => /=Q/.test(s))).toBe(true)
    expect(sans.some((s) => /=[RBN]/.test(s))).toBe(true)
    expect(sans.some((s) => /^[NBRQ][a-h]x?[a-h][1-8]/.test(s))).toBe(true)
    expect(sans.some((s) => /^[NBRQ][1-8]x?[a-h][1-8]/.test(s))).toBe(true)
  })
})

describe('moveKinds', () => {
  it.each([
    ['e4', ['pawn']],
    ['Nf3', ['piece']],
    ['exd5', ['capture']],
    ['Bxb5+', ['capture', 'check']],
    ['Rd8#', ['check']],
    ['O-O-O', ['castling']],
    ['c8=R', ['promotion']],
    ['Nbd7', ['disambiguation']],
    ['R1a3', ['disambiguation']],
  ])('%s shows %j', (san, kinds) => {
    expect(moveKinds(san)).toEqual(kinds)
  })
})

describe('movesOfGame', () => {
  it('takes the main line with the position before each move', () => {
    const { game } = importPgn('1. e4 e5 2. Nf3 (2. f4) Nc6 *')
    const moves = movesOfGame(game, 'a game')
    expect(moves.map((m) => m.san)).toEqual(['e4', 'e5', 'Nf3', 'Nc6'])
    expect(moves[2]).toMatchObject({
      move: { from: 'g1', to: 'f3' },
      color: 'white',
      moveNumber: 2,
      source: 'a game',
    })
    expect(createGame(moves[2]!.fen).play(moves[2]!.san)).toBeDefined()
  })
})

describe('movePool', () => {
  it('is the built-in set without games of the user', () => {
    expect(movePool([], builtIn)).toHaveLength(builtIn.length)
  })

  it('adds only the built-in moves of forms the user’s games have too few of', () => {
    const own = movesOfGame(
      importPgn('1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. O-O Nf6 5. Re1 O-O 6. c3 d6 7. h3 h6 *').game,
      'mine',
    )
    const pool = movePool(own, builtIn)
    expect(pool.slice(0, own.length)).toEqual(own)
    const added = pool.slice(own.length)
    expect(added.some((m) => m.san === 'O-O-O')).toBe(true)
    expect(added.some((m) => m.san.includes('='))).toBe(true)
    // Plain moves the user has plenty of stay out.
    expect(added.every((m) => moveKinds(m.san).some((k) => k !== 'pawn' && k !== 'piece'))).toBe(
      true,
    )
  })
})

describe('pickMove', () => {
  it('brings up every kind of notation, castling on both sides', () => {
    const random = seeded(9)
    const seen = new Set<string>()
    let previous: NotationMove | undefined
    for (let i = 0; i < 400; i++) {
      const picked = pickMove(builtIn, {}, random, previous ? { previous } : {})!
      seen.add(picked.kind)
      if (picked.kind === 'castling') seen.add(picked.move.san)
      previous = picked.move
    }
    for (const k of [
      'pawn',
      'piece',
      'capture',
      'check',
      'castling',
      'promotion',
      'disambiguation',
    ])
      expect(seen, k).toContain(k)
    expect(seen).toContain('O-O')
    expect(seen).toContain('O-O-O')
  })

  it('keeps to the kind asked for', () => {
    const random = seeded(2)
    for (let i = 0; i < 50; i++) {
      const picked = pickMove(builtIn, {}, random, { only: 'promotion' })!
      expect(picked.kind).toBe('promotion')
      expect(picked.move.san).toContain('=')
    }
  })

  it('brings a kind missed lately back more often', () => {
    const random = seeded(4)
    const missed = recordAnswer(recordAnswer(undefined, false, 0), false, 0)
    let castling = 0
    for (let i = 0; i < 2000; i++)
      if (pickMove(builtIn, { castling: missed }, random)!.kind === 'castling') castling++
    // One of seven kinds: about 290 when all are alike, about 800 at four times the weight.
    expect(castling).toBeGreaterThan(600)
  })

  it('finds nothing in an empty pool or a kind it has none of', () => {
    expect(pickMove([], {}, Math.random)).toBeUndefined()
    const pawnsOnly = builtIn.filter((m) => moveKinds(m.san).includes('pawn'))
    expect(pickMove(pawnsOnly, {}, Math.random, { only: 'castling' })).toBeUndefined()
  })
})

describe('moveChoices', () => {
  it('offers the move and three wrong spellings, two of them about what the move shows', () => {
    const nbd7 = find('Nbd7')
    const choices = moveChoices(nbd7.fen, nbd7.san, seeded(1))
    expect(choices).toHaveLength(4)
    expect(choices.filter((c) => !c.slip).map((c) => c.san)).toEqual(['Nbd7'])
    expect(choices.map((c) => c.san)).toEqual(expect.arrayContaining(['Nd7']))
    expect(
      choices.filter((c) => c.slip?.startsWith('disambiguation')).length,
    ).toBeGreaterThanOrEqual(2)
  })

  it('offers the other castling for castling, and the other promotion for a promotion', () => {
    const long = find('O-O-O')
    expect(moveChoices(long.fen, long.san, seeded(3)).map((c) => c.san)).toContain('O-O')
    const rook = find('c8=R')
    expect(moveChoices(rook.fen, rook.san, seeded(3)).map((c) => c.san)).toEqual(
      expect.arrayContaining(['c8=Q', 'c8']),
    )
  })

  it('is all different spellings, whatever the move', () => {
    for (const m of builtIn) {
      const sans = moveChoices(m.fen, m.san, seeded(6)).map((c) => c.san)
      expect(new Set(sans).size, m.san).toBe(sans.length)
      expect(sans.length, m.san).toBeGreaterThanOrEqual(3)
    }
  })
})

describe('describeMove and slipText', () => {
  it('says a move in plain words', () => {
    expect(describeMove(find('Nbd7'))).toBe(
      'Nbd7: the knight on b8 goes to d7. The b says which knight: another one could go there too.',
    )
    expect(describeMove(find('O-O-O'))).toBe(
      'O-O-O: White castles long (on the queen’s side): the king goes to c1, the rook to d1.',
    )
    expect(describeMove(find('Rd8#'))).toBe('Rd8#: the rook on d1 goes to d8, and it is mate.')
    expect(describeMove(find('c8=R'))).toBe('c8=R: the pawn on c7 goes to c8 and becomes a rook.')
  })

  it('says why a wrong spelling is wrong', () => {
    const nbd7 = find('Nbd7')
    expect(slipText('disambiguation-missing', nbd7, 'Nd7')).toMatch(/^Two knights could go to d7/)
    expect(slipText('piece-letter', find('Nf3'), 'Kf3')).toBe('K is the king; the knight is N.')
    expect(slipText('check-missing', find('Rd8#'), 'Rd8')).toBe(
      'The move mates, so it ends with #.',
    )
  })

  it('counts a slip against the kind it is about', () => {
    expect(slipKind('check-missing')).toBe('check')
    expect(slipKind('pawn-file-missing')).toBe('capture')
    expect(slipKind('square')).toBeUndefined()
  })
})

describe('sameMove and sanOf', () => {
  it('tells the move played from the one asked, the promotion piece included', () => {
    expect(
      sameMove(
        { from: 'c7', to: 'c8', promotion: 'rook' },
        { from: 'c7', to: 'c8', promotion: 'rook' },
      ),
    ).toBe(true)
    expect(
      sameMove(
        { from: 'c7', to: 'c8', promotion: 'queen' },
        { from: 'c7', to: 'c8', promotion: 'rook' },
      ),
    ).toBe(false)
    expect(sanOf(find('Nbd7').fen, { from: 'f6', to: 'd7' })).toBe('Nfd7')
  })
})
