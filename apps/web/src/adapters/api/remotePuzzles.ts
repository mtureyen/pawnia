import type {
  Problem,
  PuzzleAttemptBody,
  PuzzleAttemptResultBody,
  PuzzleLibraryBody,
  PuzzleTrainingBody,
  TrainingPuzzleBody,
  TrainingPuzzleRequestBody,
} from '@pawnia/contracts'
import type { ApiClient } from './client'

/** The server has no puzzle set yet (it is fetched with `bun run puzzles:fetch`). */
export class NoPuzzleLibraryError extends Error {}

/** The puzzle library on the server: lichess' puzzles, by theme and rating. */
export class RemotePuzzles {
  private readonly api: ApiClient

  constructor(api: ApiClient) {
    this.api = api
  }

  /** Where the puzzles come from, and their themes. */
  async library(): Promise<PuzzleLibraryBody> {
    const res = await this.api.api.v1.puzzles.$get()
    if (res.status === 503) throw new NoPuzzleLibraryError(await problemText(res))
    if (res.status !== 200) throw new Error(await problemText(res))
    return (await res.json()) as PuzzleLibraryBody
  }
}

/**
 * Training on the library's puzzles, kept on the server: the user's rating, repeats of missed
 * puzzles and the weak themes decide what comes next.
 */
export class RemotePuzzleTraining {
  private readonly api: ApiClient

  constructor(api: ApiClient) {
    this.api = api
  }

  async summary(): Promise<PuzzleTrainingBody> {
    const res = await this.api.api.v1.training.puzzles.$get()
    if (res.status !== 200) throw await failure(res)
    return (await res.json()) as PuzzleTrainingBody
  }

  /** The next puzzle; null when none is left of the themes asked for. */
  async next(wish: TrainingPuzzleRequestBody): Promise<TrainingPuzzleBody | null> {
    const res = await this.api.api.v1.training.puzzles.next.$post({ json: wish })
    if (res.status === 404) return null
    if (res.status !== 200) throw await failure(res)
    return (await res.json()) as TrainingPuzzleBody
  }

  async record(attempt: PuzzleAttemptBody): Promise<PuzzleAttemptResultBody> {
    const res = await this.api.api.v1.training.puzzles.attempts.$post({ json: attempt })
    if (res.status !== 200) throw await failure(res)
    return (await res.json()) as PuzzleAttemptResultBody
  }
}

/** The server's problem as an error; no puzzle set is told apart. */
async function failure(res: { status: number; json(): Promise<unknown> }): Promise<Error> {
  const problem = (await res.json().catch(() => ({}))) as Partial<Problem>
  const text = problem.detail ?? problem.title ?? `HTTP ${res.status}`
  return problem.title === 'No puzzles' ? new NoPuzzleLibraryError(text) : new Error(text)
}

async function problemText(res: { status: number; json(): Promise<unknown> }): Promise<string> {
  const problem = (await res.json().catch(() => ({}))) as Partial<Problem>
  return problem.detail ?? problem.title ?? `HTTP ${res.status}`
}
