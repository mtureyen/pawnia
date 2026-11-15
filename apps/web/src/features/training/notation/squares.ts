import type { SquareName } from '@pawnia/chess'

export const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const
export const RANKS = ['1', '2', '3', '4', '5', '6', '7', '8'] as const
export type File = (typeof FILES)[number]
export type Rank = (typeof RANKS)[number]

/** The squares of the chosen files and ranks (all of them when none of one kind is chosen). */
export function drilledSquares(
  files: readonly string[] = FILES,
  ranks: readonly string[] = RANKS,
): SquareName[] {
  const fs = files.length > 0 ? files : FILES
  const rs = ranks.length > 0 ? ranks : RANKS
  return fs.flatMap((f) => rs.map((r) => `${f}${r}` as SquareName))
}

/** How the answers to one question (a square from one side, a kind of move) have gone so far. */
export interface AnswerStat {
  seen: number
  missed: number
  /**
   * Misses with the recent ones counting most (0: none lately, 1: every time lately): a square
   * missed once long ago and got right since stops coming back.
   */
  recentMiss: number
  /** How long a right answer took, the recent ones counting most; 0 before the first. */
  ms: number
}

/** How much a new answer counts against the earlier ones. */
const RECENT = 0.35
/** Answers slower than this are cut down to it: the user may just have looked away. */
const MAX_MS = 10_000
/** A right answer this fast is not slow at all; at SLOW_MS it is as slow as it counts. */
const FAST_MS = 1500
const SLOW_MS = 5000

/** The square's stats after one more answer. */
export function recordAnswer(stat: AnswerStat | undefined, right: boolean, ms: number): AnswerStat {
  const before = stat ?? { seen: 0, missed: 0, recentMiss: 0, ms: 0 }
  const took = Math.min(Math.max(ms, 0), MAX_MS)
  return {
    seen: before.seen + 1,
    missed: before.missed + (right ? 0 : 1),
    recentMiss:
      before.seen === 0 ? (right ? 0 : 1) : before.recentMiss * (1 - RECENT) + (right ? 0 : RECENT),
    // Only right answers tell how quickly the user knows the square.
    ms: !right ? before.ms : before.ms === 0 ? took : before.ms * (1 - RECENT) + took * RECENT,
  }
}

/** 0 for a quick square, 1 for a slow one. */
function slowness(stat: AnswerStat): number {
  if (stat.ms === 0) return 0
  return Math.min(1, Math.max(0, (stat.ms - FAST_MS) / (SLOW_MS - FAST_MS)))
}

/** How weak a square is, 0 (known) to 1 (missed every time lately, or very slow). */
export function weakness(stat: AnswerStat | undefined): number {
  if (!stat || stat.seen === 0) return 0
  return Math.min(1, stat.recentMiss + 0.5 * slowness(stat))
}

/** A square never asked yet: above a known one, so every square gets its turn soon. */
const UNSEEN_WEIGHT = 2
/** A square missed every time lately comes up this many times as often as a known one. */
const WEAK_WEIGHT = 6

/** How likely a square is to be picked next: weak and unseen squares more often. */
export function squareWeight(stat: AnswerStat | undefined): number {
  if (!stat || stat.seen === 0) return UNSEEN_WEIGHT
  return 1 + (WEAK_WEIGHT - 1) * weakness(stat)
}

/** One of the items, each as likely as its weight. `random` returns [0, 1). */
export function weightedPick<T>(
  items: readonly T[],
  weight: (item: T) => number,
  random: () => number,
): T {
  const weights = items.map((item) => Math.max(0, weight(item)))
  const total = weights.reduce((a, b) => a + b, 0)
  if (items.length === 0) throw new Error('nothing to pick from')
  let at = random() * total
  for (let i = 0; i < items.length; i++) {
    at -= weights[i]!
    if (at < 0) return items[i]!
  }
  return items[items.length - 1]!
}

/** The next square to ask: weighted towards weak ones, never the same one twice in a row. */
export function pickSquare(
  squares: readonly SquareName[],
  stats: Readonly<Partial<Record<SquareName, AnswerStat>>>,
  random: () => number,
  previous?: SquareName,
): SquareName {
  const choices = squares.length > 1 ? squares.filter((s) => s !== previous) : squares
  return weightedPick(choices, (s) => squareWeight(stats[s]), random)
}

/** The weakest squares first, only those that are weak at all. */
export function weakestSquares(
  stats: Readonly<Partial<Record<SquareName, AnswerStat>>>,
  count = 5,
): { square: SquareName; stat: AnswerStat; weakness: number }[] {
  return (Object.entries(stats) as [SquareName, AnswerStat][])
    .map(([square, stat]) => ({ square, stat, weakness: weakness(stat) }))
    .filter((s) => s.weakness > 0.05)
    .sort((a, b) => b.weakness - a.weakness || b.stat.missed - a.stat.missed)
    .slice(0, count)
}

/**
 * The answers offered for "name the square": the right one and squares it is easily taken for,
 * above all the ones seen from the other side of the board (f3 for f6, c6 and c3), then its
 * neighbours. In random order.
 */
export function squareChoices(target: SquareName, random: () => number, count = 4): SquareName[] {
  const file = FILES.indexOf(target[0] as File)
  const rank = RANKS.indexOf(target[1] as Rank)
  const at = (f: number, r: number) =>
    f >= 0 && f < 8 && r >= 0 && r < 8 ? (`${FILES[f]}${RANKS[r]}` as SquareName) : undefined
  const mirrored = [at(file, 7 - rank), at(7 - file, rank), at(7 - file, 7 - rank)]
  const near = shuffle(
    [
      at(file + 1, rank),
      at(file - 1, rank),
      at(file, rank + 1),
      at(file, rank - 1),
      at(file + 1, rank + 1),
      at(file - 1, rank - 1),
    ],
    random,
  )
  const others: SquareName[] = []
  for (const s of [...shuffle(mirrored, random), ...near]) {
    if (s && s !== target && !others.includes(s)) others.push(s)
  }
  return shuffle([target, ...others.slice(0, count - 1)], random)
}

/** A copy in random order (Fisher–Yates). */
export function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }
  return out
}

/** "f6" from what the user typed, case and spaces aside; undefined while it isn't a square. */
export function typedSquare(text: string): SquareName | undefined {
  const t = text.trim().toLowerCase()
  return /^[a-h][1-8]$/.test(t) ? (t as SquareName) : undefined
}

/** The part of the board drilled, in words: "the e-file", "ranks 1 and 2", "the e-file on rank 4". */
export function partOfBoardText(files: readonly string[], ranks: readonly string[]): string {
  const list = (items: readonly string[]) =>
    items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`
  const f = [...files].sort()
  const r = [...ranks].sort()
  const fileText = f.length === 1 ? `the ${f[0]}-file` : `files ${list(f)}`
  const rankText = r.length === 1 ? `rank ${r[0]}` : `ranks ${list(r)}`
  if (f.length === 0 && r.length === 0) return 'the whole board'
  if (f.length === 0) return rankText
  if (r.length === 0) return fileText
  return `${fileText} on ${rankText}`
}
