import type { Color, SquareName } from '@pawnia/chess'
import { MOVE_KINDS, type MoveKind } from './moves'
import { drilledSquares, recordAnswer, type AnswerStat } from './squares'

/** What the notation trainer remembers in this browser (nothing of it goes to the server). */
export interface NotationProgress {
  /** Per square, from White's side and from Black's: one is often known far better. */
  squares: Record<Color, Partial<Record<SquareName, AnswerStat>>>
  /** How each kind of move notation has gone. */
  moves: Partial<Record<MoveKind, AnswerStat>>
  /** The best score of a timed round, per drill (see `drillKey`). */
  best: Record<string, number>
}

export function emptyProgress(): NotationProgress {
  return { squares: { white: {}, black: {} }, moves: {}, best: {} }
}

export type CoordinateMode = 'find' | 'name'
export type SideChoice = Color | 'both'

/** A drill as its best score is kept: the mode, the side and the part of the board. */
export function drillKey(
  mode: CoordinateMode,
  side: SideChoice,
  files: readonly string[],
  ranks: readonly string[],
): string {
  const part = (chosen: readonly string[]) => [...chosen].sort().join('') || 'all'
  return `${mode}:${side}:${part(files)}:${part(ranks)}`
}

export function withSquareAnswer(
  progress: NotationProgress,
  side: Color,
  square: SquareName,
  right: boolean,
  ms: number,
): NotationProgress {
  const own = progress.squares[side]
  return {
    ...progress,
    squares: {
      ...progress.squares,
      [side]: { ...own, [square]: recordAnswer(own[square], right, ms) },
    },
  }
}

export function withMoveAnswer(
  progress: NotationProgress,
  kind: MoveKind,
  right: boolean,
): NotationProgress {
  return {
    ...progress,
    moves: { ...progress.moves, [kind]: recordAnswer(progress.moves[kind], right, 0) },
  }
}

/** The progress with a finished round's score; `best` says whether it beat the one before. */
export function withRoundScore(
  progress: NotationProgress,
  key: string,
  score: number,
): { progress: NotationProgress; best: boolean } {
  const before = progress.best[key]
  if (score <= 0 || (before !== undefined && score <= before)) return { progress, best: false }
  return { progress: { ...progress, best: { ...progress.best, [key]: score } }, best: true }
}

const SQUARES = new Set<string>(drilledSquares())

/** Reads what was stored, dropping whatever doesn't fit: an old or edited entry never breaks the page. */
export function parseProgress(raw: unknown): NotationProgress {
  const out = emptyProgress()
  if (!isObject(raw)) return out
  if (isObject(raw.squares))
    for (const side of ['white', 'black'] as const) {
      const squares = raw.squares[side]
      if (!isObject(squares)) continue
      for (const [square, stat] of Object.entries(squares))
        if (SQUARES.has(square) && isStat(stat)) out.squares[side][square as SquareName] = stat
    }
  if (isObject(raw.moves))
    for (const kind of MOVE_KINDS) {
      const stat = raw.moves[kind]
      if (isStat(stat)) out.moves[kind] = stat
    }
  if (isObject(raw.best))
    for (const [key, score] of Object.entries(raw.best))
      if (typeof score === 'number' && Number.isFinite(score) && score > 0) out.best[key] = score
  return out
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isStat(value: unknown): value is AnswerStat {
  if (!isObject(value)) return false
  const { seen, missed, recentMiss, ms } = value
  return (
    [seen, missed, recentMiss, ms].every(
      (n) => typeof n === 'number' && Number.isFinite(n) && n >= 0,
    ) &&
    (missed as number) <= (seen as number) &&
    (recentMiss as number) <= 1
  )
}

const KEY = 'pawnia.notation'

export function loadProgress(
  storage: Pick<Storage, 'getItem'> | undefined = safeStorage(),
): NotationProgress {
  try {
    return parseProgress(JSON.parse(storage?.getItem(KEY) ?? 'null'))
  } catch {
    return emptyProgress()
  }
}

export function saveProgress(
  progress: NotationProgress,
  storage: Pick<Storage, 'setItem'> | undefined = safeStorage(),
): void {
  try {
    storage?.setItem(KEY, JSON.stringify(progress))
  } catch {
    // Not remembered, then: private windows and blocked storage are fine.
  }
}

/** Forgets the stats of one part (the squares or the moves); best scores go with the squares. */
export function forget(progress: NotationProgress, part: 'squares' | 'moves'): NotationProgress {
  return part === 'squares'
    ? { ...progress, squares: { white: {}, black: {} }, best: {} }
    : { ...progress, moves: {} }
}

function safeStorage(): Storage | undefined {
  try {
    return globalThis.localStorage
  } catch {
    return undefined
  }
}
