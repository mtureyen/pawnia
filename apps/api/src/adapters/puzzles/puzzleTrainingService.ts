import type {
  PuzzleAttemptBody,
  PuzzleAttemptResultBody,
  PuzzleTrainingBody,
  TrainingPuzzleBody,
  TrainingPuzzleRequestBody,
  WeakThemesBody,
} from '@pawnia/contracts'

// Types only (and an error to tell apart): app.ts, and through it the web app's typed client,
// sees this file, not the code behind it.

/**
 * Training on the puzzle library, as the routes see it: what to solve next, how it went, and
 * where the user stands. Throws without a database, and NoPuzzleSetError without puzzles.
 */
export interface PuzzleTrainingService {
  /** The themes behind the mistakes in the user's last reviewed games. */
  weakThemes(): Promise<WeakThemesBody>
  summary(): Promise<PuzzleTrainingBody>
  /** Undefined when no puzzle is left. */
  next(wish: TrainingPuzzleRequestBody): Promise<TrainingPuzzleBody | undefined>
  /** Throws UnknownPuzzleError for an id the library doesn't have. */
  record(attempt: PuzzleAttemptBody): Promise<PuzzleAttemptResultBody>
}

export class UnknownPuzzleError extends Error {
  constructor(id: string) {
    super(`No puzzle ${id} in the library`)
    this.name = 'UnknownPuzzleError'
  }
}
