import {
  nextTrainingPuzzleRoute,
  puzzleAttemptRoute,
  puzzleTrainingRoute,
  weakThemesRoute,
} from '@pawnia/contracts'
import { NoPuzzleSetError } from '../../adapters/puzzles/puzzleLibraryService'
import {
  UnknownPuzzleError,
  type PuzzleTrainingService,
} from '../../adapters/puzzles/puzzleTrainingService'
import { problem } from '../../http/problem'
import { createRouter } from '../../http/router'

/** Training on the puzzle library: the next puzzle, how it went, the rating and the weak themes. */
export function puzzleTrainingRoutes({ training }: { training: PuzzleTrainingService }) {
  /** No database (the attempts are kept there) or no puzzle set: what to do about it. */
  const unavailable = (error: unknown) => ({
    title: error instanceof NoPuzzleSetError ? 'No puzzles' : 'Library unavailable',
    detail: error instanceof Error ? error.message : String(error),
  })
  return createRouter()
    .openapi(weakThemesRoute, async (c) => {
      try {
        return c.json(await training.weakThemes(), 200)
      } catch (error) {
        const { title, detail } = unavailable(error)
        return problem(c, 503, title, { detail })
      }
    })
    .openapi(puzzleTrainingRoute, async (c) => {
      try {
        return c.json(await training.summary(), 200)
      } catch (error) {
        const { title, detail } = unavailable(error)
        return problem(c, 503, title, { detail })
      }
    })
    .openapi(nextTrainingPuzzleRoute, async (c) => {
      const wish = c.req.valid('json')
      try {
        const puzzle = await training.next(wish)
        if (!puzzle) {
          const of = wish.themes?.length ? ` of ${wish.themes.join(', ')}` : ''
          return problem(c, 404, 'No puzzle left', {
            detail: `No new puzzle${of} left at this rating`,
          })
        }
        return c.json(puzzle, 200)
      } catch (error) {
        const { title, detail } = unavailable(error)
        return problem(c, 503, title, { detail })
      }
    })
    .openapi(puzzleAttemptRoute, async (c) => {
      try {
        return c.json(await training.record(c.req.valid('json')), 200)
      } catch (error) {
        if (error instanceof UnknownPuzzleError) {
          return problem(c, 404, 'No such puzzle', { detail: error.message })
        }
        const { title, detail } = unavailable(error)
        return problem(c, 503, title, { detail })
      }
    })
}
