/**
 * From a transcript to what was heard: a row of slots, one per heard word (or per letter of a
 * word like "exd5"), each with the chess tokens it may stand for and what each reading costs.
 *
 * The approach follows the voice move input of lichess (github.com/lichess-org/lila, `ui/voice`,
 * AGPL-3.0): heard words become tokens with substitution costs, and a phrase is matched against
 * the phrases every legal move could be described by (see `phrases.ts` and `spoken.ts`). lichess
 * learns its substitution table from transcripts of Vosk, a recogniser with a closed vocabulary;
 * Whisper writes any English word, so it mishears differently and the table here is our own.
 */

export type FileTok = 'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g' | 'h'
export type RankTok = '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8'
/** Pieces by their SAN letter, P for a pawn. */
export type RoleTok = 'P' | 'N' | 'B' | 'R' | 'Q' | 'K'
/**
 * What a phrase is made of: files, ranks, pieces, "x" for a capture, "=" for a promotion, "O" for
 * castling and the side it castles to.
 */
export type Tok = FileTok | RankTok | RoleTok | 'x' | '=' | 'O' | 'short' | 'long'

/** One way to read a heard word: the tokens it stands for and how unsure that reading is. */
export interface Reading {
  readonly toks: readonly Tok[]
  readonly cost: number
}

/**
 * A heard word. `skip` is the cost of reading it as nothing at all: zero for filler ("check",
 * "the", "please"), high for a piece name, since a piece named but not moved points to another
 * move rather than to noise.
 */
export interface Slot {
  readonly word: string
  readonly readings: readonly Reading[]
  readonly skip: number
}

/** A square's file or rank left over: likely a different square was meant. */
const SKIP_SQUARE_PART = 0.5
/** A piece named that the move doesn't use: above what any fit may cost (see `spoken.ts`). */
const SKIP_PIECE = 0.8
/** "Takes" heard but nothing taken, or "promote" without a promotion. */
const SKIP_SIGN = 0.5
/** A word we don't know. Enough to keep a move from being played outright, not to rule it out. */
const SKIP_UNKNOWN = 0.4
/**
 * A word close to a chess word but not one we know ("kniht"): just above what plays, and just below
 * an unknown word, so the near miss comes first among the moves the player is asked about.
 */
const NEAR_MISS = 0.38

type Entry = [toks: string, cost: number][]

function entry(skip: number, ...readings: Entry): Omit<Slot, 'word'> {
  return {
    readings: readings.map(([toks, cost]) => ({ toks: toks.split(' ') as Tok[], cost })),
    skip,
  }
}

const square = (tok: string, cost = 0, skip = SKIP_SQUARE_PART) => entry(skip, [tok, cost])
const piece = (tok: RoleTok, cost = 0) => entry(SKIP_PIECE, [tok, cost])
const noise = entry(0)

/**
 * Words as Whisper writes them, with the chess tokens they stand for. A cost says how sure we are
 * that the word means the token: 0 for the word itself, 0.1–0.2 for the usual spellings of a
 * spoken letter or a near-certain homophone, 0.3–0.4 where the word is common English that only
 * sometimes means the token. Words that are also everyday English get a low `skip`.
 */
const LEXICON: Record<string, Omit<Slot, 'word'>> = {
  // Files, as letters, the way they are spelled out, and in the NATO alphabet.
  a: square('a', 0, 0.3), // also the article: "knight takes a pawn"
  ay: square('a', 0.2),
  alpha: square('a'),
  alfa: square('a'),
  b: square('b'),
  bee: square('b', 0.1),
  be: square('b', 0.15, 0.3),
  bravo: square('b'),
  c: square('c'),
  cee: square('c', 0.1),
  see: square('c', 0.15, 0.3),
  sea: square('c', 0.15, 0.3),
  charlie: square('c'),
  d: square('d'),
  dee: square('d', 0.1),
  de: square('d', 0.2),
  delta: square('d'),
  the: entry(0, ['d', 0.4]), // mostly filler, sometimes a swallowed "d"
  e: square('e'),
  ee: square('e', 0.1),
  echo: square('e'),
  f: square('f'),
  ef: square('f', 0.1),
  eff: square('f', 0.1),
  if: square('f', 0.4, 0.2),
  foxtrot: square('f'),
  g: square('g'),
  gee: square('g', 0.1),
  jee: square('g', 0.1),
  ji: square('g', 0.3),
  golf: square('g'),
  h: square('h'),
  aitch: square('h', 0.1),
  haitch: square('h', 0.1),
  age: square('h', 0.4, 0.3),
  each: square('h', 0.4, 0.3),
  hotel: square('h'),

  // Ranks, as digits and words. "to" is mostly the connector ("knight to f3"), so reading it as
  // nothing is free and as "2" costs a little; "two" and "too" lean the other way.
  1: square('1'),
  one: square('1'),
  won: square('1', 0.2, 0.4),
  2: square('2'),
  two: square('2', 0, 0.3),
  too: square('2', 0.2, 0.2),
  to: entry(0, ['2', 0.2]),
  3: square('3'),
  three: square('3'),
  tree: square('3', 0.25, 0.4),
  free: square('3', 0.4, 0.3),
  4: square('4'),
  four: square('4'),
  for: square('4', 0.2, 0.2),
  fore: square('4', 0.2),
  5: square('5'),
  five: square('5'),
  fife: square('5', 0.3),
  6: square('6'),
  six: square('6'),
  sex: square('6', 0.3, 0.4),
  sicks: square('6', 0.3),
  7: square('7'),
  seven: square('7'),
  8: square('8'),
  eight: square('8'),
  ate: square('8', 0.2, 0.4),

  // Whole squares Whisper writes as a word: "Evil" for "e4" in an Australian voice.
  evil: entry(SKIP_UNKNOWN, ['e 4', 0.3]),

  // Pieces, plurals and possessives included ("bishop's" loses its apostrophe on the way in).
  pawn: piece('P'),
  pawns: piece('P'),
  pon: piece('P', 0.3),
  pond: piece('P', 0.4),
  porn: piece('P', 0.4),
  knight: piece('N'),
  knights: piece('N'),
  night: piece('N', 0.1),
  nights: piece('N', 0.1),
  nite: piece('N', 0.1),
  knite: piece('N', 0.1),
  n: piece('N', 0.2),
  bishop: piece('B'),
  bishops: piece('B'),
  rook: piece('R'),
  rooks: piece('R'),
  rock: piece('R', 0.15),
  rocks: piece('R', 0.15),
  rok: piece('R', 0.2),
  ruck: piece('R', 0.3),
  r: piece('R', 0.2),
  queen: piece('Q'),
  queens: piece('Q'),
  q: piece('Q', 0.2),
  king: piece('K'),
  kings: piece('K'),
  k: piece('K', 0.2),

  // Captures and promotions. "ex" is how "exd5" sometimes comes out when spoken letter by letter.
  x: entry(SKIP_SIGN, ['x', 0]),
  takes: entry(SKIP_SIGN, ['x', 0]),
  take: entry(SKIP_SIGN, ['x', 0]),
  taking: entry(SKIP_SIGN, ['x', 0]),
  captures: entry(SKIP_SIGN, ['x', 0]),
  capture: entry(SKIP_SIGN, ['x', 0]),
  capturing: entry(SKIP_SIGN, ['x', 0]),
  ex: entry(SKIP_UNKNOWN, ['e x', 0.2], ['x', 0.3]),
  '=': entry(SKIP_SIGN, ['=', 0]),
  equals: entry(SKIP_SIGN, ['=', 0]),
  equal: entry(SKIP_SIGN, ['=', 0]),
  promote: entry(SKIP_SIGN, ['=', 0]),
  promotes: entry(SKIP_SIGN, ['=', 0]),
  promoting: entry(SKIP_SIGN, ['=', 0]),
  promotion: entry(SKIP_SIGN, ['=', 0]),
  becomes: entry(SKIP_SIGN, ['=', 0]),

  // Castling. "O-O", "zero zero", "king side" and the like are rewritten into these words first.
  castle: entry(SKIP_SIGN, ['O', 0]),
  castles: entry(SKIP_SIGN, ['O', 0]),
  castling: entry(SKIP_SIGN, ['O', 0]),
  cassel: entry(SKIP_SIGN, ['O', 0.3]),
  // "Parcels queen side": "castles" in an Australian voice.
  parcels: entry(SKIP_UNKNOWN, ['O', 0.3]),
  parcel: entry(SKIP_UNKNOWN, ['O', 0.3]),
  // A side named is as telling as a piece named: "castle long" must not castle short.
  short: entry(SKIP_PIECE, ['short', 0]),
  kingside: entry(SKIP_PIECE, ['short', 0]),
  long: entry(SKIP_PIECE, ['long', 0]),
  queenside: entry(SKIP_PIECE, ['long', 0]),

  // Filler: check signs, connectors, hesitations and what Whisper adds on silence ("Thank you.").
  ...Object.fromEntries(
    [
      'check',
      'checks',
      'checkmate',
      'mate',
      'on',
      'from',
      'at',
      'square',
      'with',
      'and',
      'then',
      'please',
      'move',
      'moves',
      'play',
      'plays',
      'go',
      'goes',
      'piece',
      'my',
      'i',
      'ill',
      'lets',
      'now',
      'so',
      'well',
      'okay',
      'ok',
      'oh',
      'o',
      'um',
      'uh',
      'uhm',
      'hmm',
      'er',
      'ah',
      'thank',
      'thanks',
      'you',
    ].map((word) => [word, noise]),
  ),
}

/** Words a near miss may be taken for, with the token they stand for. */
const NEAR_MISS_TARGETS: [string, Tok][] = [
  ['pawn', 'P'],
  ['knight', 'N'],
  ['bishop', 'B'],
  ['rook', 'R'],
  ['queen', 'Q'],
  ['king', 'K'],
  ['castle', 'O'],
  ['takes', 'x'],
  ['captures', 'x'],
]

/** What a transcript comes down to before it is read: lower case, no punctuation, one form. */
export function cleanWords(transcript: string): string[] {
  const text = ` ${transcript.toLowerCase()} `
    // Apostrophes join ("bishop's" → "bishops", "let's" → "lets") instead of splitting a word.
    .replace(/['’]/g, '')
    // Whisper sometimes frames a short clip like a heading ("== Takes =="); one "=" is a promotion.
    .replace(/={2,}/g, ' ')
    // Anything else that isn't a letter, digit or "=" separates words ("E4.", "e-4", "Nf3+",
    // "O-O" → "o o"). Spaces around each word let the patterns below match on " word ".
    .replace(/[^a-z0-9=]+/g, '  ')
    .replace(CASTLING, (match) =>
      match.trim().split(/\s+/).length === 3 ? ' castle long ' : ' castle short ',
    )
    // Whisper hears "promote to knight" as "promote tonight", with every voice tried.
    .replace(/ tonight /g, ' to knight ')
    .replace(/ kings? +side /g, ' kingside ')
    .replace(/ queens? +side /g, ' queenside ')
  return text.split(' ').filter(Boolean)
}

/**
 * Castling as noughts: "O-O", "0-0-0", "oh, oh", "zero zero zero", also run together ("000").
 * Three noughts are tried first, so "o-o-o" is long.
 */
const NOUGHT = '(?:o|0|zero|oh)'
const CASTLING = new RegExp(
  ` (?:${NOUGHT} +${NOUGHT} +${NOUGHT}|${NOUGHT} +${NOUGHT}|000|ooo|00|oo) `,
  'g',
)

/** Reads cleaned words as slots. */
export function slotsOf(words: readonly string[]): Slot[] {
  return words.flatMap((word) => {
    const known = LEXICON[word]
    if (known) return [{ word, ...known }]
    if (SAN_LIKE.test(word) && /[1-8]/.test(word)) return sanSlots(word)
    const near = nearMiss(word)
    if (near) return [{ word, ...entry(SKIP_UNKNOWN, [near, NEAR_MISS]) }]
    return [{ word, readings: [], skip: SKIP_UNKNOWN }]
  })
}

/** Written notation, whole or in part: "e4", "exd5", "nf3", "bxc6", "e8=q", "e2e4", "nbd2". */
const SAN_LIKE = /^[a-h1-8nbrqkpx=]+$/

/** One slot per letter of written notation. */
function sanSlots(word: string): Slot[] {
  return [...word].map((char, i) => {
    if (char === 'b') {
      // Lower case is all we have (Whisper capitalises a sentence's first word either way), so a
      // "b" is a file before a rank ("b4", "b1c3") and either a file or a bishop otherwise ("bc4").
      const isFile = /[1-8]/.test(word[i + 1] ?? '')
      return isFile
        ? { word: char, ...square('b') }
        : { word: char, ...entry(SKIP_SQUARE_PART, ['b', 0.1], ['B', 0.1]) }
    }
    const letter = SAN_LETTERS[char]
    if (letter) return { word: char, ...piece(letter) }
    if (char === 'x') return { word: char, ...entry(SKIP_SIGN, ['x', 0]) }
    if (char === '=') return { word: char, ...entry(SKIP_SIGN, ['=', 0]) }
    return { word: char, ...square(char) }
  })
}

const SAN_LETTERS: Record<string, RoleTok> = { n: 'N', r: 'R', q: 'Q', k: 'K', p: 'P' }

function nearMiss(word: string): Tok | undefined {
  if (word.length < 4) return undefined
  return NEAR_MISS_TARGETS.find(([target]) => isOneEditAway(word, target))?.[1]
}

/** True if one letter added, dropped or changed turns `a` into `b`. */
function isOneEditAway(a: string, b: string): boolean {
  if (a === b || Math.abs(a.length - b.length) > 1) return false
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1)
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1)
}
