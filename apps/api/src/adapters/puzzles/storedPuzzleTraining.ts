import type {
  LibraryPuzzleBody,
  PuzzleAttemptBody,
  PuzzleAttemptResultBody,
  PuzzleTrainingBody,
  TrainingPuzzleBody,
  TrainingPuzzleRequestBody,
  WeakThemesBody,
} from '@pawnia/contracts'
import {
  afterAttempt,
  gameLine,
  mistakeThemes,
  pickNext,
  playerGames,
  PROVISIONAL_ATTEMPTS,
  puzzleState,
  ratingAfter,
  START_PUZZLE_RATING,
  tallyThemes,
  weakThemes,
  type GameHistory,
  type GameLine,
  type PuzzleProgress,
  type PuzzleRating,
  type StoredReview,
} from '@pawnia/history'
import type { LibraryGame, Profile } from '@pawnia/library'
import type { StoredPuzzleAttempt } from '../db/puzzleStore'
import type { PuzzleLibraryService } from './puzzleLibraryService'
import { UnknownPuzzleError, type PuzzleTrainingService } from './puzzleTrainingService'

/** The user's last games the weak themes are read from: how they play now. */
const RECENT_GAMES = 30
/** The weak themes are read again after this long (games get reviewed in between). */
const WEAK_THEMES_TTL_MS = 5 * 60_000
/** The rating's history shown, the newest attempts. */
const HISTORY = 100

/** Where the attempts, the progress and the games behind the weak themes are kept. */
export interface PuzzleTrainingLibrary extends Pick<GameHistory, 'summaries'> {
  profile(): Promise<Profile | undefined>
  game(id: string): Promise<LibraryGame | undefined>
  findReview(line: GameLine): Promise<StoredReview | undefined>
  puzzleAttempts(): Promise<StoredPuzzleAttempt[]>
  addPuzzleAttempt(attempt: StoredPuzzleAttempt): Promise<void>
  puzzleProgress(): Promise<Map<string, PuzzleProgress>>
  savePuzzleProgress(puzzleId: string, progress: PuzzleProgress): Promise<void>
}

/** Training on the library's puzzles, kept in the database. */
export class StoredPuzzleTraining implements PuzzleTrainingService {
  private readonly library: PuzzleTrainingLibrary
  private readonly puzzles: PuzzleLibraryService
  private readonly now: () => Date
  private readonly random: () => number
  private readonly newId: () => string
  private weak: { at: number; themes: Promise<WeakThemesBody> } | undefined

  constructor(
    library: PuzzleTrainingLibrary,
    puzzles: PuzzleLibraryService,
    {
      now = () => new Date(),
      random = Math.random,
      newId = () => crypto.randomUUID(),
    }: { now?: () => Date; random?: () => number; newId?: () => string } = {},
  ) {
    this.library = library
    this.puzzles = puzzles
    this.now = now
    this.random = random
    this.newId = newId
  }

  weakThemes(): Promise<WeakThemesBody> {
    const at = this.now().getTime()
    if (!this.weak || at - this.weak.at > WEAK_THEMES_TTL_MS) {
      const themes = this.readWeakThemes()
      this.weak = { at, themes }
      // A failure (no database yet) is not kept.
      themes.catch(() => {
        if (this.weak?.themes === themes) this.weak = undefined
      })
    }
    return this.weak.themes
  }

  async summary(): Promise<PuzzleTrainingBody> {
    const [attempts, progress] = await Promise.all([
      this.library.puzzleAttempts(),
      this.library.puzzleProgress(),
    ])
    const { rating, rated } = ratingOf(attempts)
    const fresh = attempts.filter((a) => !a.repeat)
    const now = this.now()
    const states = [...progress.values()].map((p) => puzzleState(p, now))
    const perTheme = new Map<string, { attempts: number; solved: number }>()
    for (const attempt of fresh) {
      for (const theme of attempt.themes) {
        const tally = perTheme.get(theme) ?? { attempts: 0, solved: 0 }
        tally.attempts++
        if (attempt.solvedFirstTry) tally.solved++
        perTheme.set(theme, tally)
      }
    }
    return {
      rating,
      rated,
      provisional: rated < PROVISIONAL_ATTEMPTS,
      attempts: attempts.length,
      solvedFirstTry: fresh.filter((a) => a.solvedFirstTry).length,
      // A puzzle tried once and never missed has no repeat to come.
      due: states.filter((s) => s === 'due').length,
      waiting: states.filter((s) => s === 'waiting').length,
      history: fresh.slice(-HISTORY).map((a) => ({ at: a.at, rating: a.ratingAfter })),
      themes: [...perTheme]
        .map(([theme, t]) => ({ theme, ...t }))
        .sort((a, b) => b.attempts - a.attempts || a.theme.localeCompare(b.theme)),
    }
  }

  async next({ themes }: TrainingPuzzleRequestBody): Promise<TrainingPuzzleBody | undefined> {
    const [attempts, progress] = await Promise.all([
      this.library.puzzleAttempts(),
      this.library.puzzleProgress(),
    ])
    const { rating } = ratingOf(attempts)
    // Tried before: only ever back as a repeat.
    const exclude = [...progress.keys()]
    const fresh = async (wanted: string[], reason: TrainingPuzzleBody['reason']) => {
      const puzzle = await this.puzzles.next({ themes: wanted, rating, exclude })
      return puzzle && { ...puzzle, reason }
    }
    if (themes && themes.length > 0) return fresh(themes, 'chosen')

    const now = this.now()
    const due = [...progress]
      .filter(([, p]) => puzzleState(p, now) === 'due')
      .sort(([, a], [, b]) => (a.dueAt ?? '').localeCompare(b.dueAt ?? ''))
      .map(([id]) => id)
    const weak = await this.weakThemes().then(
      (found) => weakThemes(found.themes.map(asTally)),
      // Without the games' reviews, the trainer still has repeats and any theme.
      () => [],
    )
    const pick = pickNext({ due, weak }, this.random)
    if (pick.kind === 'repeat') {
      const puzzle = await this.puzzles.puzzle(pick.id)
      if (puzzle) return { ...puzzle, reason: 'repeat' }
    }
    if (pick.kind === 'weak') {
      const puzzle = await fresh(pick.themes, 'weak')
      if (puzzle) return puzzle
    }
    return fresh([], 'mixed')
  }

  async record({ puzzleId, solvedFirstTry }: PuzzleAttemptBody): Promise<PuzzleAttemptResultBody> {
    const puzzle: LibraryPuzzleBody | undefined = await this.puzzles.puzzle(puzzleId)
    if (!puzzle) throw new UnknownPuzzleError(puzzleId)
    const [attempts, progress] = await Promise.all([
      this.library.puzzleAttempts(),
      this.library.puzzleProgress(),
    ])
    const before = ratingOf(attempts)
    const kept = progress.get(puzzleId)
    const repeat = kept !== undefined
    const after = ratingAfter(before, puzzle.rating, solvedFirstTry, repeat)
    const now = this.now()
    await this.library.addPuzzleAttempt({
      id: this.newId(),
      puzzleId,
      at: now.toISOString(),
      solvedFirstTry,
      repeat,
      puzzleRating: puzzle.rating,
      ratingBefore: before.rating,
      ratingAfter: after.rating,
      themes: puzzle.themes,
    })
    const next = afterAttempt(kept, solvedFirstTry, now)
    await this.library.savePuzzleProgress(puzzleId, next)
    return {
      rating: after.rating,
      change: after.rating - before.rating,
      repeat,
      ...(next.dueAt && { dueAt: next.dueAt }),
    }
  }

  private async readWeakThemes(): Promise<WeakThemesBody> {
    const { library } = this
    const [summaries, profile] = await Promise.all([library.summaries(), library.profile()])
    const recent = playerGames(summaries, profile).slice(0, RECENT_GAMES)
    const read = await Promise.all(
      recent
        .filter(({ game }) => game.reviewed)
        .map(async (game) => {
          const stored = await library.game(game.game.id)
          if (!stored) return undefined
          const review = await library.findReview(gameLine(stored.pgn))
          if (!review) return undefined
          return { gameId: game.game.id, mistakes: mistakeThemes(game, review.review) }
        }),
    )
    const games = read.filter((g) => g !== undefined)
    return {
      games: recent.length,
      reviewed: games.length,
      mistakes: games.reduce((n, g) => n + g.mistakes.length, 0),
      themes: tallyThemes(games).map(({ theme, missed, walkedInto }) => ({
        theme,
        missed,
        walkedInto,
      })),
    }
  }
}

/** The rating after the last attempt, and the attempts that counted for it. */
function ratingOf(attempts: readonly StoredPuzzleAttempt[]): PuzzleRating {
  const last = attempts.at(-1)
  return {
    rating: last?.ratingAfter ?? START_PUZZLE_RATING,
    rated: attempts.filter((a) => !a.repeat).length,
  }
}

function asTally(t: WeakThemesBody['themes'][number]) {
  return { ...t, theme: t.theme as Parameters<typeof weakThemes>[0][number]['theme'] }
}
