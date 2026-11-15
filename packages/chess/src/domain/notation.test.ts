import { INITIAL_FEN } from 'chessops/fen'
import { describe, expect, it } from 'vitest'
import { createGame } from './game'
import { formatSan, parseSanParts, sanVariants, type NotationSlip } from './notation'

function after(moves: string, fen = INITIAL_FEN): string {
  const game = createGame(fen)
  for (const move of moves.split(' ').filter(Boolean)) {
    if (!game.play(move)) throw new Error(`illegal in test setup: ${move}`)
  }
  return game.fen()
}

function bySlip(fen: string, san: string): Partial<Record<NotationSlip, string>> {
  return Object.fromEntries(sanVariants(fen, san).map((v) => [v.slip, v.san]))
}

describe('parseSanParts / formatSan', () => {
  it.each([
    ['e4', { capture: false, to: 'e4', suffix: '' }],
    ['exd5+', { fromFile: 'e', capture: true, to: 'd5', suffix: '+' }],
    ['Nbd2', { piece: 'N', fromFile: 'b', capture: false, to: 'd2', suffix: '' }],
    ['R1e3', { piece: 'R', fromRank: '1', capture: false, to: 'e3', suffix: '' }],
    ['Qh4xe1#', { piece: 'Q', fromFile: 'h', fromRank: '4', capture: true, to: 'e1', suffix: '#' }],
    ['e8=Q', { capture: false, to: 'e8', promotion: 'Q', suffix: '' }],
    ['O-O', { castling: 'short', capture: false, suffix: '' }],
    ['O-O-O+', { castling: 'long', capture: false, suffix: '+' }],
  ])('takes %s apart and puts it back together', (san, parts) => {
    expect(parseSanParts(san)).toEqual(parts)
    expect(formatSan(parseSanParts(san)!)).toBe(san)
  })

  it('knows a non-SAN when it sees one', () => {
    expect(parseSanParts('e2e4')).toBeUndefined()
    expect(parseSanParts('0-0')).toBeUndefined()
    expect(parseSanParts('Ni3')).toBeUndefined()
  })
})

describe('sanVariants', () => {
  it('spells a piece move wrong in the letter, the x, the square and the +', () => {
    expect(bySlip(after('e4 e5'), 'Nf3')).toEqual({
      'piece-letter': 'Kf3',
      'disambiguation-extra': 'Ngf3',
      'capture-extra': 'Nxf3',
      square: 'Nf6',
      'check-extra': 'Nf3+',
    })
  })

  it('gives a pawn no letter and a pawn capture its file', () => {
    expect(bySlip(after('e4 d5'), 'exd5')).toEqual({
      'pawn-letter': 'Pexd5',
      'capture-missing': 'ed5',
      'pawn-file-missing': 'xd5',
      square: 'exd4',
      'check-extra': 'exd5+',
    })
  })

  it('names the other knight, leaves out the b, or uses the rank where two could go', () => {
    const fen = after('d4 d5 Nf3 Nf6')
    expect(bySlip(fen, 'Nbd2')).toMatchObject({
      'disambiguation-missing': 'Nd2',
      'disambiguation-wrong': 'Nfd2',
      'disambiguation-rank': 'N1d2',
    })
    expect(bySlip(fen, 'Nbd2')['disambiguation-extra']).toBeUndefined()
  })

  it('swaps the rank of two rooks on one file', () => {
    expect(bySlip('6k1/8/8/4R3/8/8/8/4R1K1 w - - 0 1', 'R1e3')).toMatchObject({
      'disambiguation-missing': 'Re3',
      'disambiguation-wrong': 'R5e3',
    })
  })

  it('castles on the other side or writes the king’s move', () => {
    const fen = after('e4 e5 Nf3 Nc6 Bc4 Bc5')
    expect(bySlip(fen, 'O-O')).toEqual({
      'castling-side': 'O-O-O',
      'castling-as-king-move': 'Kg1',
      'check-extra': 'O-O+',
    })
  })

  it('promotes to another piece or forgets what the pawn becomes', () => {
    expect(bySlip('3r2k1/4P3/8/8/8/8/6K1/8 w - - 0 1', 'exd8=Q+')).toMatchObject({
      'promotion-piece': 'exd8=N+',
      'promotion-missing': 'exd8+',
      'check-missing': 'exd8=Q',
    })
  })

  it('writes a mate as a check or as nothing', () => {
    const fen = after('f3 e5 g4')
    expect(bySlip(fen, 'Qh4#')).toMatchObject({ 'mate-as-check': 'Qh4+', 'check-missing': 'Qh4' })
  })

  it('never offers the right spelling, nor one twice, and nothing for an illegal move', () => {
    for (const [fen, san] of [
      [INITIAL_FEN, 'e4'],
      [after('d4 d5 Nf3 Nf6'), 'Nbd2'],
      [after('f3 e5 g4'), 'Qh4#'],
    ] as const) {
      const variants = sanVariants(fen, san).map((v) => v.san)
      expect(variants).not.toContain(san)
      expect(new Set(variants).size).toBe(variants.length)
    }
    expect(sanVariants(INITIAL_FEN, 'e5')).toEqual([])
  })
})
