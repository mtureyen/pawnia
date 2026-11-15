import { parseSanParts, type PieceLetter, type PromotionLetter } from './notation'

const PIECE_WORDS: Record<PieceLetter, string> = {
  K: 'king',
  Q: 'queen',
  R: 'rook',
  B: 'bishop',
  N: 'knight',
}

const PROMOTION_WORDS: Record<PromotionLetter, string> = {
  Q: 'queen',
  R: 'rook',
  B: 'bishop',
  N: 'knight',
}

/**
 * A file as speech synthesis says it right. "b" to "h" are read as letters, a lone one and one
 * in a square ("b4" sounds like "bee four") alike. A lowercase "a" is read as the article: "a4"
 * comes out as "uh four" in the common English voices, so the a-file is written "A". A lone "A"
 * that opens a phrase is still the article; with a period ("A.") it is the letter.
 */
function file(letter: string, opensPhrase = false): string {
  if (letter !== 'a') return letter
  return opensPhrase ? 'A.' : 'A'
}

function square(name: string): string {
  return file(name.charAt(0)) + name.slice(1)
}

/**
 * A move in SAN as a person would say it, written for speech synthesis: "Nf3" is "knight f3",
 * "exd5" "e takes d5", "Bxe5+" "bishop takes e5, check", "O-O" "castles kingside", "e8=Q#"
 * "e8 promotes to queen, checkmate", "Nbd2" "knight b d2". Squares stay written as squares
 * ("e4"): the voices read them letter by letter, as they should. Annotations ("!", "?!") are
 * not said. Anything that isn't SAN comes back as it was.
 */
export function sayMove(san: string): string {
  const bare = san.trim().replace(/[!?]+$/, '')
  const parts = parseSanParts(bare)
  if (!parts) return san
  const words: string[] = []
  if (parts.castling) {
    words.push(parts.castling === 'short' ? 'castles kingside' : 'castles queenside')
  } else {
    if (parts.piece) words.push(PIECE_WORDS[parts.piece])
    // Both file and rank: the piece's square, said as one ("queen h4 takes e1"). On a pawn
    // capture the file is the pawn's own, and the first thing said.
    if (parts.fromFile && parts.fromRank) words.push(square(parts.fromFile + parts.fromRank))
    else if (parts.fromFile) words.push(file(parts.fromFile, !parts.piece))
    else if (parts.fromRank) words.push(parts.fromRank)
    if (parts.capture) words.push('takes')
    if (parts.to) words.push(square(parts.to))
    if (parts.promotion) words.push('promotes to', PROMOTION_WORDS[parts.promotion])
  }
  const said = words.join(' ')
  if (parts.suffix === '+') return `${said}, check`
  if (parts.suffix === '#') return `${said}, checkmate`
  return said
}
