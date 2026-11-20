import type { PuzzleProgress } from '@pawnia/history'
import { asc } from 'drizzle-orm'
import type { Database } from './types'
import { puzzleAttempts, puzzleProgress } from './schema'

/** An attempt at a puzzle of the library, as kept. */
export interface StoredPuzzleAttempt {
  id: string
  puzzleId: string
  /** ISO timestamp. */
  at: string
  solvedFirstTry: boolean
  repeat: boolean
  puzzleRating: number
  ratingBefore: number
  ratingAfter: number
  themes: string[]
}

/** The user's attempts at the library's puzzles, and where each puzzle stands, in PostgreSQL. */
export class PostgresPuzzleStore {
  private readonly db: Database

  constructor(db: Database) {
    this.db = db
  }

  /** Every attempt, the oldest first. */
  async attempts(): Promise<StoredPuzzleAttempt[]> {
    const rows = await this.db
      .select()
      .from(puzzleAttempts)
      .orderBy(asc(puzzleAttempts.at), asc(puzzleAttempts.id))
    return rows.map((row) => ({
      ...row,
      at: row.at.toISOString(),
      themes: row.themes.split(' ').filter(Boolean),
    }))
  }

  async addAttempt(attempt: StoredPuzzleAttempt): Promise<void> {
    await this.db
      .insert(puzzleAttempts)
      .values({ ...attempt, at: new Date(attempt.at), themes: attempt.themes.join(' ') })
  }

  /** Every puzzle tried, by id. */
  async progress(): Promise<Map<string, PuzzleProgress>> {
    const rows = await this.db.select().from(puzzleProgress)
    return new Map(
      rows.map((row) => [
        row.puzzleId,
        { misses: row.misses, ...(row.dueAt && { dueAt: row.dueAt.toISOString() }) },
      ]),
    )
  }

  async saveProgress(puzzleId: string, progress: PuzzleProgress): Promise<void> {
    const update = {
      misses: progress.misses,
      dueAt: progress.dueAt ? new Date(progress.dueAt) : null,
    }
    await this.db
      .insert(puzzleProgress)
      .values({ puzzleId, ...update })
      .onConflictDoUpdate({ target: puzzleProgress.puzzleId, set: update })
  }
}
