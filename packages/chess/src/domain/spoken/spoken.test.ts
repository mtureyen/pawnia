import { INITIAL_FEN } from 'chessops/fen'
import { describe, expect, it } from 'vitest'
import { createGame, InvalidPositionError } from '../game'
import { parseSanParts } from '../notation'
import { readSpokenMove, SPOKEN_COMMANDS, type SpokenCommand } from './spoken'

function after(moves: string, fen = INITIAL_FEN): string {
  const game = createGame(fen)
  for (const move of moves.split(' ').filter(Boolean)) {
    if (!game.play(move)) throw new Error(`illegal in test setup: ${move}`)
  }
  return game.fen()
}

/** The result in one line: "move Nf3", "ambiguous Nbd2 Nfd2", "command flip", "none". */
function read(fen: string, transcript: string): string {
  const result = readSpokenMove(fen, transcript)
  switch (result.kind) {
    case 'move':
      return `move ${result.move.san}`
    case 'ambiguous':
      return `ambiguous ${result.moves.map((m) => m.san).join(' ')}`
    case 'command':
      return `command ${result.command}`
    case 'none':
      return 'none'
  }
}

const START = INITIAL_FEN
const AFTER_E4 = after('e4')
/** Both knights can go to d2. */
const TWO_KNIGHTS = after('d4 d5 Nf3 Nf6')
/** Rooks on a1 and a5: both can go to a2, a3, a4. */
const TWO_ROOKS_ON_A_FILE = '4k3/8/8/R7/8/8/8/R3K3 w - - 0 1'
/** Rooks on a1 and f1: both can go to b1–e1. */
const TWO_ROOKS_ON_A_RANK = '7k/8/8/8/8/8/8/R4RK1 w - - 0 1'
/** The e- and c-pawns can both take on d5; nothing else can. */
const PAWN_TAKES_EITHER = after('e4 d5 c4 Nc6')
/** Black's e-pawn can take on d4 or on f4. */
const BLACK_PAWN_TAKES_EITHER_WAY = after('d4 e5 f4')
/** exd5 is White's only capture. */
const ONE_CAPTURE = after('e4 d5')
const CASTLE_EITHER_WHITE = 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1'
const CASTLE_EITHER_BLACK = 'r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 0 1'
const CASTLE_SHORT_ONLY = 'r3k2r/8/8/8/8/8/8/R3K2R w K - 0 1'
/** e7 can go to e8 or take on d8. */
const PROMOTE = 'k2r4/4P3/8/8/8/8/8/4K3 w - - 0 1'
/** Black's b2 can go to b1 or take on a1 or c1. */
const PROMOTE_BLACK = '4k3/8/8/8/8/8/1p6/N1N1K3 b - - 0 1'
/** The knight on a1 has one move, to c2. */
const ONE_KNIGHT_MOVE = 'k7/8/8/8/8/1P6/8/N3K3 w - - 0 1'
/** The knight on e3 can take the bishop on d5. */
const KNIGHT_TAKES_BISHOP = '4k3/8/8/3b4/8/4N3/8/4K3 w - - 0 1'
/** The b-pawn and the bishop can both take on c4. */
const PAWN_OR_BISHOP_TAKES = '4k3/8/8/8/2p5/1P1B4/8/4K3 w - - 0 1'
const ONE_ROOK = '4k3/8/8/8/8/8/8/R3K3 w - - 0 1'

describe('readSpokenMove: pawn moves', () => {
  it.each([
    [START, 'e4', 'e4'],
    [START, 'E4.', 'e4'],
    [START, 'e 4', 'e4'],
    [START, 'e four', 'e4'],
    [START, 'E-4', 'e4'],
    [START, 'echo four', 'e4'],
    [START, 'pawn e4', 'e4'],
    [START, 'Pawn to e4', 'e4'],
    [START, 'e2 e4', 'e4'],
    [START, 'e2e4', 'e4'],
    [START, 'e2 to e4', 'e4'],
    [START, 'd4', 'd4'],
    [START, 'delta four', 'd4'],
    [START, 'h3', 'h3'],
    [START, 'alpha 3', 'a3'],
    [AFTER_E4, 'c5', 'c5'],
    [AFTER_E4, 'e five', 'e5'],
    [AFTER_E4, 'g six', 'g6'],
  ])('%#: "%s" in the position plays %s', (fen, transcript, san) => {
    expect(read(fen, transcript)).toBe(`move ${san}`)
  })

  it('reads a bare square as the pawn, like notation does, when a piece could go there too', () => {
    expect(read(START, 'f3')).toBe('move f3')
    expect(read(START, 'c3')).toBe('move c3')
  })

  it('gives the move from and to as plain squares', () => {
    const result = readSpokenMove(START, 'e4')
    expect(result).toEqual({
      kind: 'move',
      move: { from: 'e2', to: 'e4', san: 'e4' },
      heard: 'e4',
    })
  })
})

describe('readSpokenMove: piece moves', () => {
  it.each([
    [START, 'knight f3', 'Nf3'],
    [START, 'Knight to F3.', 'Nf3'],
    [START, 'knight c3', 'Nc3'],
    [START, 'Nf3', 'Nf3'],
    [START, 'g1 f3', 'Nf3'],
    [START, 'knight g1 f3', 'Nf3'],
    [START, 'knight from g1 to f3', 'Nf3'],
    [after('e4 e5'), 'bishop c4', 'Bc4'],
    [after('e4 e5'), 'Bishop to c4!', 'Bc4'],
    [after('e4 e5'), 'queen h5', 'Qh5'],
    [after('e4 e5'), 'queen d1 h5', 'Qh5'],
    [after('e4 e5'), 'Queen from D1 to H5', 'Qh5'],
    [after('e4 e5'), 'king e2', 'Ke2'],
    [after('e4 e5 Nf3 Nc6'), 'Bb5', 'Bb5'],
    [ONE_ROOK, 'rook a7', 'Ra7'],
    [ONE_ROOK, 'rook to d1', 'Rd1'],
  ])('%#: "%s" plays %s', (fen, transcript, san) => {
    expect(read(fen, transcript)).toBe(`move ${san}`)
  })

  it('plays a lone square for a piece only after asking', () => {
    // No pawn can go to g5, so "g5" can only mean the bishop; but notation would say Bg5.
    expect(read(after('d4 d5'), 'g5')).toBe('ambiguous Bg5')
    expect(read(after('d4 d5'), 'bishop g5')).toBe('move Bg5')
  })
})

describe('readSpokenMove: captures', () => {
  it.each([
    [PAWN_TAKES_EITHER, 'e takes d5', 'exd5'],
    [PAWN_TAKES_EITHER, 'E takes D5.', 'exd5'],
    [PAWN_TAKES_EITHER, 'e captures d5', 'exd5'],
    [PAWN_TAKES_EITHER, 'exd5', 'exd5'],
    [PAWN_TAKES_EITHER, 'e x d 5', 'exd5'],
    [PAWN_TAKES_EITHER, 'c takes d5', 'cxd5'],
    [PAWN_TAKES_EITHER, 'cxd5', 'cxd5'],
    [PAWN_TAKES_EITHER, 'e4 takes d5', 'exd5'],
    [ONE_CAPTURE, 'takes d5', 'exd5'],
    [ONE_CAPTURE, 'pawn takes', 'exd5'],
    [ONE_CAPTURE, 'e takes', 'exd5'],
    [ONE_CAPTURE, 'takes', 'exd5'],
    [ONE_CAPTURE, 'ex d5', 'exd5'],
    [ONE_CAPTURE, 'takes the pawn', 'exd5'],
    [ONE_CAPTURE, 'pawn takes pawn', 'exd5'],
    [BLACK_PAWN_TAKES_EITHER_WAY, 'e takes f4', 'exf4'],
    [BLACK_PAWN_TAKES_EITHER_WAY, 'exd4', 'exd4'],
    [KNIGHT_TAKES_BISHOP, 'knight takes d5', 'Nxd5'],
    [KNIGHT_TAKES_BISHOP, 'knight captures on d5', 'Nxd5'],
    [KNIGHT_TAKES_BISHOP, 'Nxd5', 'Nxd5'],
    [KNIGHT_TAKES_BISHOP, 'knight d5', 'Nxd5'],
    [KNIGHT_TAKES_BISHOP, 'knight takes', 'Nxd5'],
    [KNIGHT_TAKES_BISHOP, 'knight takes bishop', 'Nxd5'],
    [KNIGHT_TAKES_BISHOP, 'takes bishop', 'Nxd5'],
    [after('e4 e5 Bc4 Nc6 Qh5 Nf6'), 'queen takes f7', 'Qxf7#'],
    [after('e4 e5 Bc4 Nc6 Qh5 Nf6'), 'Queen takes F7, checkmate!', 'Qxf7#'],
  ])('%#: "%s" plays %s', (fen, transcript, san) => {
    expect(read(fen, transcript)).toBe(`move ${san}`)
  })

  it('takes en passant', () => {
    const fen = after('e4 h6 e5 d5')
    expect(read(fen, 'e takes d6')).toBe('move exd6')
    expect(read(fen, 'takes')).toBe('move exd6')
  })

  it('asks when two pieces can take', () => {
    expect(read(PAWN_TAKES_EITHER, 'takes d5')).toBe('ambiguous cxd5 exd5')
    expect(read(PAWN_TAKES_EITHER, 'pawn takes')).toBe('ambiguous cxd5 exd5')
    expect(read(PAWN_TAKES_EITHER, 'takes')).toBe('ambiguous cxd5 exd5')
    // "ex" is "e x" or the letter x said alone; the first reading comes first.
    expect(read(PAWN_TAKES_EITHER, 'ex d5')).toBe('ambiguous exd5 cxd5')
    expect(read(BLACK_PAWN_TAKES_EITHER_WAY, 'e takes')).toBe('ambiguous exd4 exf4')
    expect(read(BLACK_PAWN_TAKES_EITHER_WAY, 'pawn takes')).toBe('ambiguous exd4 exf4')
  })

  it('asks between the b-pawn and the bishop on a written "bxc4", whose case we cannot trust', () => {
    expect(read(PAWN_OR_BISHOP_TAKES, 'bxc4')).toBe('ambiguous bxc4 Bxc4')
    expect(read(PAWN_OR_BISHOP_TAKES, 'bishop takes c4')).toBe('move Bxc4')
    expect(read(PAWN_OR_BISHOP_TAKES, 'b takes c4')).toBe('move bxc4')
  })

  it('asks when "takes" is heard but nothing is taken', () => {
    expect(read(START, 'knight takes f3')).toBe('ambiguous Nf3')
  })
})

describe('readSpokenMove: castling', () => {
  it.each([
    ['castle short', 'O-O'],
    ['castles short', 'O-O'],
    ['Castle kingside.', 'O-O'],
    ['castle king side', 'O-O'],
    ['king side castle', 'O-O'],
    ['short castle', 'O-O'],
    ['O-O', 'O-O'],
    ['0-0', 'O-O'],
    ['o o', 'O-O'],
    ['zero zero', 'O-O'],
    ['oh oh', 'O-O'],
    ['king g1', 'O-O'],
    ['castle long', 'O-O-O'],
    ['castles queenside', 'O-O-O'],
    ['castle queen side', 'O-O-O'],
    ['long castle', 'O-O-O'],
    ['O-O-O', 'O-O-O'],
    ['0-0-0', 'O-O-O'],
    ['zero zero zero', 'O-O-O'],
    ['king c1', 'O-O-O'],
  ])('%#: "%s" plays %s for White', (transcript, san) => {
    expect(read(CASTLE_EITHER_WHITE, transcript)).toBe(`move ${san}`)
  })

  it.each([
    ['castle short', 'O-O', 'g8'],
    ['O-O', 'O-O', 'g8'],
    ['castles long', 'O-O-O', 'c8'],
    ['zero zero zero', 'O-O-O', 'c8'],
  ])('%#: "%s" plays %s for Black', (transcript, san, to) => {
    const result = readSpokenMove(CASTLE_EITHER_BLACK, transcript)
    expect(result).toMatchObject({ kind: 'move', move: { from: 'e8', to, san } })
  })

  it('asks which side on a bare "castle" when both are possible', () => {
    expect(read(CASTLE_EITHER_WHITE, 'castle')).toBe('ambiguous O-O-O O-O')
    expect(read(CASTLE_EITHER_BLACK, 'castles')).toBe('ambiguous O-O-O O-O')
  })

  it('castles on a bare "castle" when only one side is possible', () => {
    expect(read(CASTLE_SHORT_ONLY, 'castle')).toBe('move O-O')
  })

  it('does not castle where castling is impossible', () => {
    expect(read(START, 'castle')).toBe('none')
    expect(read(CASTLE_SHORT_ONLY, 'castle long')).toBe('none')
    expect(read(START, 'O-O')).toBe('none')
  })
})

describe('readSpokenMove: promotion', () => {
  it.each([
    [PROMOTE, 'e8 queen', 'e8=Q'],
    [PROMOTE, 'e8 equals queen', 'e8=Q'],
    [PROMOTE, 'e8=Q', 'e8=Q'],
    [PROMOTE, 'e8q', 'e8=Q'],
    [PROMOTE, 'e eight queen', 'e8=Q'],
    [PROMOTE, 'e8 promote to queen', 'e8=Q'],
    [PROMOTE, 'pawn e8 queen', 'e8=Q'],
    [PROMOTE, 'e8 knight', 'e8=N'],
    [PROMOTE, 'e8 rook', 'e8=R'],
    [PROMOTE, 'e8 promotes to bishop', 'e8=B'],
    // How Whisper writes "promote to knight".
    [PROMOTE, 'e8 promote tonight', 'e8=N'],
    [PROMOTE, 'e8=N', 'e8=N'],
    [PROMOTE, 'e takes d8 queen', 'exd8=Q+'],
    [PROMOTE, 'exd8=N', 'exd8=N'],
    [PROMOTE, 'takes d8 knight', 'exd8=N'],
    [PROMOTE, 'e7 d8 rook', 'exd8=R+'],
    [PROMOTE_BLACK, 'b1 queen', 'b1=Q'],
    [PROMOTE_BLACK, 'b one rook', 'b1=R'],
    [PROMOTE_BLACK, 'b takes a1 queen', 'bxa1=Q'],
    [PROMOTE_BLACK, 'bxc1=N', 'bxc1=N'],
    [PROMOTE_BLACK, 'takes c1 knight', 'bxc1=N'],
    ['4k3/8/8/8/8/8/p7/4K3 b - - 0 1', 'a1 rook', 'a1=R+'],
    ['4k3/8/8/8/8/8/p7/4K3 b - - 0 1', 'a one queen', 'a1=Q+'],
  ])('%#: "%s" plays %s', (fen, transcript, san) => {
    expect(read(fen, transcript)).toBe(`move ${san}`)
  })

  it('gives the promotion piece', () => {
    const result = readSpokenMove(PROMOTE, 'e8 knight')
    expect(result).toMatchObject({
      kind: 'move',
      move: { from: 'e7', to: 'e8', promotion: 'knight', san: 'e8=N' },
    })
  })

  it('asks for the piece when none is named', () => {
    expect(read(PROMOTE, 'e8')).toBe('ambiguous e8=Q e8=R e8=B e8=N')
    expect(read(PROMOTE, 'e takes d8')).toBe('ambiguous exd8=Q+ exd8=R+ exd8=B exd8=N')
  })

  it('promotes on "promote to …" when only one pawn can, and asks where when it could go twice', () => {
    expect(read(PROMOTE, 'promote to knight')).toBe('ambiguous exd8=N e8=N')
    expect(read('k7/4P3/8/8/8/8/8/4K3 w - - 0 1', 'promote to knight')).toBe('move e8=N')
  })
})

describe('readSpokenMove: disambiguation', () => {
  it.each([
    [TWO_KNIGHTS, 'knight b d2', 'Nbd2'],
    [TWO_KNIGHTS, 'knight f d2', 'Nfd2'],
    [TWO_KNIGHTS, 'knight bravo d2', 'Nbd2'],
    [TWO_KNIGHTS, 'knight from b1 to d2', 'Nbd2'],
    [TWO_KNIGHTS, 'knight f3 d2', 'Nfd2'],
    [TWO_KNIGHTS, 'b1 d2', 'Nbd2'],
    [TWO_KNIGHTS, 'Nbd2', 'Nbd2'],
    [TWO_KNIGHTS, 'Nfd2', 'Nfd2'],
    [TWO_ROOKS_ON_A_FILE, 'rook one a3', 'R1a3'],
    [TWO_ROOKS_ON_A_FILE, 'rook 5 a3', 'R5a3'],
    [TWO_ROOKS_ON_A_FILE, 'rook five to a3', 'R5a3'],
    [TWO_ROOKS_ON_A_FILE, 'R1a3', 'R1a3'],
    [TWO_ROOKS_ON_A_FILE, 'rook a5 a3', 'R5a3'],
    [TWO_ROOKS_ON_A_RANK, 'rook a e1', 'Rae1'],
    [TWO_ROOKS_ON_A_RANK, 'rook f e1', 'Rfe1'],
    [TWO_ROOKS_ON_A_RANK, 'Rae1', 'Rae1'],
    [TWO_ROOKS_ON_A_RANK, 'rook f1 to e1', 'Rfe1'],
  ])('%#: "%s" plays %s', (fen, transcript, san) => {
    expect(read(fen, transcript)).toBe(`move ${san}`)
  })

  it.each([
    [TWO_KNIGHTS, 'knight d2', 'Nbd2 Nfd2'],
    [TWO_KNIGHTS, 'knight to d2', 'Nbd2 Nfd2'],
    [TWO_ROOKS_ON_A_FILE, 'rook a3', 'R1a3 R5a3'],
    [TWO_ROOKS_ON_A_RANK, 'rook e1', 'Rae1 Rfe1'],
    [TWO_ROOKS_ON_A_RANK, 'rook to c1', 'Rac1 Rfc1'],
  ])('%#: "%s" asks between %s', (fen, transcript, sans) => {
    expect(read(fen, transcript)).toBe(`ambiguous ${sans}`)
  })

  it('plays the one piece that can go there, even with a twin on the board', () => {
    expect(read(TWO_KNIGHTS, 'knight c3')).toBe('move Nc3')
    expect(read(TWO_ROOKS_ON_A_FILE, 'rook a7')).toBe('move Ra7')
  })
})

describe('readSpokenMove: noise', () => {
  it.each([
    [START, 'knight f3 check', 'Nf3'],
    [START, 'e4, checkmate', 'e4'],
    [START, 'Um, e4.', 'e4'],
    [START, 'Uh, knight to f3, please.', 'Nf3'],
    [START, 'E4. Thank you.', 'e4'],
    [START, 'Okay, so, e4.', 'e4'],
    [START, "Let's play e4", 'e4'],
    [START, 'move my knight to f3', 'Nf3'],
    [START, 'the knight to f3', 'Nf3'],
    [START, 'Knight F3!?', 'Nf3'],
    [START, 'Nf3+', 'Nf3'],
    [after('e4 e5 Bc4 Nc6 Qh5 Nf6'), 'Qxf7#', 'Qxf7#'],
    [after('e4 e5'), "bishop's c4", 'Bc4'],
  ])('%#: "%s" plays %s', (fen, transcript, san) => {
    expect(read(fen, transcript)).toBe(`move ${san}`)
  })

  it('keeps the transcript as heard', () => {
    expect(readSpokenMove(START, '  Night   to F3! ').heard).toBe('Night to F3!')
  })
})

describe('readSpokenMove: mishearings', () => {
  it.each([
    [START, 'night f3', 'Nf3'],
    [START, 'Night to F3.', 'Nf3'],
    [START, 'nite f three', 'Nf3'],
    [START, 'knights f3', 'Nf3'],
    [after('e4 e5'), 'bishops c4', 'Bc4'],
    [ONE_ROOK, 'rock a7', 'Ra7'],
    [ONE_ROOK, 'Rock to D1.', 'Rd1'],
    [START, 'e for', 'e4'],
    [START, 'e fore', 'e4'],
    [START, 'e tree', 'e3'],
    [START, 'b four', 'b4'],
    [START, 'bee four', 'b4'],
    [START, 'be four', 'b4'],
    [START, 'see four', 'c4'],
    [START, 'sea four', 'c4'],
    [START, 'dee four', 'd4'],
    [START, 'ee four', 'e4'],
    [START, 'ef four', 'f4'],
    [START, 'gee three', 'g3'],
    [START, 'jee three', 'g3'],
    [START, 'aitch four', 'h4'],
    [START, 'e to e4', 'e4'],
    [START, 'd to d4', 'd4'],
    [AFTER_E4, 'a sex', 'a6'],
    [AFTER_E4, 'e six', 'e6'],
    [PROMOTE, 'e ate queen', 'e8=Q'],
    [TWO_ROOKS_ON_A_FILE, 'rock one a3', 'R1a3'],
  ])('%#: "%s" plays %s', (fen, transcript, san) => {
    expect(read(fen, transcript)).toBe(`move ${san}`)
  })

  it('asks when the mishearings add up', () => {
    expect(read(START, 'night ef tree')).toBe('ambiguous Nf3')
  })

  it('asks when the only word that tells two moves apart is misheard', () => {
    // "won" is probably "one" here, but it is all that tells the two rooks apart.
    expect(read(TWO_ROOKS_ON_A_FILE, 'rook won a3')).toBe('ambiguous R1a3 R5a3')
  })

  it('asks on a word close to a piece name but not one', () => {
    expect(read(START, 'kniht f3')).toBe('ambiguous Nf3 f3')
    expect(read(after('e4 e5'), 'bishup c4')).toBe('ambiguous Bc4 c4')
    // Even when nothing else fits.
    expect(read(after('e4 e5'), 'bishup b5')).toBe('ambiguous Bb5')
  })

  it('asks on an unknown word next to a move', () => {
    expect(read(START, 'banana e4')).toBe('ambiguous e4')
  })
})

describe('readSpokenMove: partial phrases', () => {
  it('never plays on a lone piece name, even when the piece has a single move', () => {
    expect(read(ONE_KNIGHT_MOVE, 'knight')).toBe('ambiguous Nc2')
    expect(read(ONE_KNIGHT_MOVE, 'knight c2')).toBe('move Nc2')
    expect(read(START, 'knight')).toBe('ambiguous Na3 Nc3 Nf3 Nh3')
  })

  it('plays "takes" alone only when there is exactly one capture', () => {
    expect(read(ONE_CAPTURE, 'takes')).toBe('move exd5')
    expect(read(START, 'takes')).toBe('none')
  })
})

describe('readSpokenMove: commands', () => {
  it.each<[string, SpokenCommand]>([
    ['take back', 'takeBack'],
    ['Take back.', 'takeBack'],
    ['takeback', 'takeBack'],
    ['take it back', 'takeBack'],
    ['Take that back, please.', 'takeBack'],
    ['undo', 'takeBack'],
    ['Undo that move.', 'takeBack'],
    ['flip', 'flip'],
    ['Flip the board.', 'flip'],
    ['rotate the board', 'flip'],
    ['resign', 'resign'],
    ['I resign.', 'resign'],
    ['I give up', 'resign'],
    ['draw', 'draw'],
    ['Draw?', 'draw'],
    ['offer a draw', 'draw'],
    ['Offer draw.', 'draw'],
    ['accept the draw', 'draw'],
    ['All for a draw.', 'draw'],
    ['cancel', 'cancel'],
    ['No.', 'cancel'],
    ['never mind', 'cancel'],
    ['yes', 'confirm'],
    ['Yeah.', 'confirm'],
    ['confirm', 'confirm'],
  ])('%#: "%s" is %s', (transcript, command) => {
    expect(readSpokenMove(START, transcript)).toEqual({
      kind: 'command',
      command,
      heard: transcript,
    })
  })

  it('answers to every phrase it lists', () => {
    for (const [command, phrases] of Object.entries(SPOKEN_COMMANDS)) {
      for (const phrase of phrases) expect(read(START, phrase)).toBe(`command ${command}`)
    }
  })

  it('is only a command when the whole phrase is one', () => {
    expect(read(START, 'take b4')).not.toMatch(/^command/)
    expect(read(START, 'draw e4')).not.toMatch(/^command/)
    expect(read(START, 'no e4')).not.toMatch(/^command/)
    expect(read(START, 'all for')).not.toMatch(/^command/)
    expect(read(START, 'all for a draw e4')).not.toMatch(/^command/)
    expect(read(ONE_CAPTURE, 'take')).toBe('move exd5')
  })
})

describe('readSpokenMove: nothing fits', () => {
  it.each([
    [START, ''],
    [START, '   '],
    [START, '...'],
    [START, 'hello there'],
    [START, 'pizza'],
    [START, 'Thank you.'],
    [START, 'you'],
    [START, 'e9'],
    [START, 'knight z9'],
    [START, 'e5'],
    [START, 'e2 e5'],
    [START, 'e4 e5'],
    [START, 'knight f6'],
    [START, 'knight e4'],
    [START, 'bishop c4'],
    [START, 'queen h5'],
    [START, 'king e2'],
    [START, 'rook a3'],
    [START, 'e8 queen'],
    [START, 'promote to queen'],
    [START, 'pawn takes'],
    [START, 'e takes d5'],
    [ONE_CAPTURE, 'knight takes d5'],
    [ONE_CAPTURE, 'queen takes'],
    [KNIGHT_TAKES_BISHOP, 'knight takes queen'],
    [KNIGHT_TAKES_BISHOP, 'bishop takes d5'],
    [after('e4 e5 Nf3 Nc6 Bb5 a6'), 'knight takes bishop'],
    [PROMOTE, 'e8 king'],
    [PROMOTE, 'e8 pawn'],
  ])('%#: "%s" in %s gives none', (fen, transcript) => {
    expect(read(fen, transcript)).toBe('none')
  })

  it('gives none where there are no legal moves', () => {
    const mate = after('f3 e5 g4 Qh4')
    expect(read(mate, 'e4')).toBe('none')
    expect(read(mate, 'king f2')).toBe('none')
  })

  it('never turns a phrase into an illegal move', () => {
    // The king on d1 is in check from a1: the knight may only block on b1.
    const inCheck = '4k3/8/8/8/8/8/3N4/r2K4 w - - 0 1'
    expect(read(inCheck, 'knight b3')).toBe('none')
    expect(read(inCheck, 'knight b1')).toBe('move Nb1')
    expect(read(inCheck, 'king e2')).toBe('move Ke2')
  })

  it('throws on a FEN that is not a position', () => {
    expect(() => readSpokenMove('not a fen', 'e4')).toThrow(InvalidPositionError)
  })
})

describe('readSpokenMove: every legal move, said plainly, comes back as itself', () => {
  const UCI_PROMOTION: Record<string, string> = { queen: 'q', rook: 'r', bishop: 'b', knight: 'n' }
  const PIECE_WORDS: Record<string, string> = {
    K: 'king',
    Q: 'queen',
    R: 'rook',
    B: 'bishop',
    N: 'knight',
  }

  /** The move in words, the way a player says it: "knight b d2", "e takes d5", "castle long". */
  function spoken(san: string): string {
    const parts = parseSanParts(san)!
    if (parts.castling) return `castle ${parts.castling}`
    return [
      parts.piece ? PIECE_WORDS[parts.piece] : '',
      parts.fromFile ?? '',
      parts.fromRank ?? '',
      parts.capture ? 'takes' : '',
      parts.to!,
      parts.promotion ? PIECE_WORDS[parts.promotion] : '',
    ]
      .filter(Boolean)
      .join(' ')
  }

  it.each([
    ['the start', START],
    ['an open game', after('e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d4 exd4 cxd4 Bb4+')],
    ['a middlegame', 'r1bq1rk1/pp2bppp/2n1pn2/2pp4/3P4/2PBPN2/PP1N1PPP/R1BQ1RK1 w - - 0 8'],
    ['two knights', TWO_KNIGHTS],
    ['two rooks', TWO_ROOKS_ON_A_FILE],
    ['castling', CASTLE_EITHER_BLACK],
    ['promotion', PROMOTE],
    ['black promotion', PROMOTE_BLACK],
    ['queens and knights', 'k7/8/2N1N3/8/1Q3Q2/8/2N1N3/7K w - - 0 1'],
  ])('in %s', (_, fen) => {
    const sans = createGame(fen)
      .legalMoves()
      .map((move) =>
        readSpokenMove(fen, `${move.from}${move.to}${UCI_PROMOTION[move.promotion ?? ''] ?? ''}`),
      )
      .map((result) => (result.kind === 'move' ? result.move.san : `?${result.kind}`))
    expect(sans.every((san) => !san.startsWith('?'))).toBe(true)
    for (const san of sans) {
      const plain = san.replace(/[+#]$/, '')
      // A written "bxc4" could be the bishop too; the board decides whether that's a question.
      const pawnOnB = /^bx/.test(plain)
      if (!pawnOnB) expect(read(fen, san), san).toBe(`move ${san}`)
      expect(read(fen, spoken(san)), spoken(san)).toBe(`move ${san}`)
    }
  })
})
