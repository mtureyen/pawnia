import type { ThemeTally } from './mistakeThemes'

/**
 * Training on the puzzle library: a rating that follows how the user solves, and what to hand out
 * next. Pure; the attempts and the progress are kept by whoever calls these.
 */

/** Where the puzzle rating starts: low on lichess' scale, and it moves fast at first. */
export const START_PUZZLE_RATING = 1000
/** The first attempts move the rating a lot, so it finds the user's level soon. */
export const PROVISIONAL_ATTEMPTS = 20
const K_PROVISIONAL = 64
const K_SETTLED = 24

/** The user's puzzle rating and how many attempts went into it. */
export interface PuzzleRating {
  rating: number
  /** Attempts that counted for the rating (repeats don't). */
  rated: number
}

/**
 * The rating after an attempt at a puzzle of `puzzleRating`: Elo, with the puzzle as the
 * opponent and solving it at the first try as a win. A repeat never moves it: the answer was seen.
 */
export function ratingAfter(
  { rating, rated }: PuzzleRating,
  puzzleRating: number,
  solvedFirstTry: boolean,
  repeat = false,
): PuzzleRating {
  if (repeat) return { rating, rated }
  const expected = 1 / (1 + 10 ** ((puzzleRating - rating) / 400))
  const k = rated < PROVISIONAL_ATTEMPTS ? K_PROVISIONAL : K_SETTLED
  return {
    rating: Math.round(rating + k * ((solvedFirstTry ? 1 : 0) - expected)),
    rated: rated + 1,
  }
}

/** A theme behind the user's recent mistakes, with how often. */
export interface WeakTheme {
  theme: string
  /** Mistakes it was behind: missed (could have played it) plus walked into (allowed it). */
  mistakes: number
}

/** The themes worth training first: the most frequent behind the mistakes, at most `top`. */
export function weakThemes(tallies: readonly ThemeTally[], top = 5): WeakTheme[] {
  return tallies
    .map((t) => ({ theme: t.theme, mistakes: t.missed.length + t.walkedInto.length }))
    .filter((t) => t.mistakes > 0)
    .slice(0, top)
}

/** What to hand out next when the user leaves it to the trainer. */
export type PuzzlePick =
  /** A puzzle missed before and due again. */
  | { kind: 'repeat'; id: string }
  /** A new puzzle of one of these themes (the weak ones). */
  | { kind: 'weak'; themes: string[] }
  /** A new puzzle of any theme. */
  | { kind: 'mixed' }

/** Of the puzzles handed out, about this share are repeats while some are due. */
export const REPEAT_SHARE = 1 / 3
/** Of the new ones, about this share come from the weak themes while there are some. */
export const WEAK_SHARE = 0.7

/**
 * The next puzzle's kind: a due repeat about a third of the time (the longest due first), else a
 * new one, from the weak themes about 70 % of the time and of any theme otherwise. `random` is
 * `Math.random` outside tests.
 */
export function pickNext(
  { due, weak }: { due: readonly string[]; weak: readonly WeakTheme[] },
  random: () => number,
): PuzzlePick {
  const [first] = due
  if (first !== undefined && random() < REPEAT_SHARE) return { kind: 'repeat', id: first }
  if (weak.length > 0 && random() < WEAK_SHARE)
    return { kind: 'weak', themes: weak.map((w) => w.theme) }
  return { kind: 'mixed' }
}
