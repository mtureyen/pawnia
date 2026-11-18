import type {
  LibraryPuzzleBody,
  NextPuzzleRequestBody,
  Problem,
  PuzzleLibraryBody,
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

  /** A puzzle to solve next; null when none is left (the themes run out, or all are left out). */
  async next(request: Partial<NextPuzzleRequestBody>): Promise<LibraryPuzzleBody | null> {
    const res = await this.api.api.v1.puzzles.next.$post({
      json: { themes: [], rating: 1500, exclude: [], ...request },
    })
    if (res.status === 404) return null
    if (res.status === 503) throw new NoPuzzleLibraryError(await problemText(res))
    if (res.status !== 200) throw new Error(await problemText(res))
    return (await res.json()) as LibraryPuzzleBody
  }
}

async function problemText(res: { status: number; json(): Promise<unknown> }): Promise<string> {
  const problem = (await res.json().catch(() => ({}))) as Partial<Problem>
  return problem.detail ?? problem.title ?? `HTTP ${res.status}`
}
