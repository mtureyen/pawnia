import { createRoute, z } from '@hono/zod-openapi'
import { ProblemSchema } from './problem'

const PuzzleId = z
  .string()
  .regex(/^[A-Za-z0-9]{1,12}$/)
  .openapi({ example: '00sHx' })
const Theme = z
  .string()
  .regex(/^[A-Za-z0-9]{1,40}$/)
  .openapi({ example: 'fork' })
const Uci = z.string().openapi({ example: 'e2e4' })

export const PuzzleLibrarySchema = z
  .object({
    /** Where the puzzles come from and how they were chosen. */
    source: z.object({
      url: z.string(),
      license: z.string().openapi({ example: 'CC0-1.0' }),
      lastModified: z.string().optional().openapi({ description: 'Of the file there, ISO 8601' }),
      fetchedAt: z.string().openapi({ description: 'ISO 8601' }),
      bytes: z.number().int().openapi({ description: 'Read from the file’s start' }),
      read: z.number().int().openapi({ description: 'Puzzles in those bytes' }),
      good: z.number().int().openapi({ description: 'Of them, the ones that passed the filter' }),
      filter: z.object({
        minPopularity: z.number(),
        minPlays: z.number(),
        maxRatingDeviation: z.number(),
        ratingBelow: z.number(),
      }),
      cap: z.object({ perThemeBand: z.number().int(), bandWidth: z.number().int() }).openapi({
        description: 'Puzzles kept for a theme per rating band, and a band’s width',
      }),
    }),
    puzzles: z.number().int().openapi({ description: 'Puzzles in the library' }),
    /** The most puzzles first. A puzzle has several themes. */
    themes: z.array(
      z.object({
        theme: Theme.openapi({ description: 'lichess’ key' }),
        kind: z.enum(['motif', 'mate', 'phase', 'length', 'goal', 'origin']).openapi({
          description:
            'A tactical motif, a mate (by length or pattern), the phase of the game, the solution’s length, what solving it wins, or where the game was played',
        }),
        puzzles: z.number().int(),
      }),
    ),
  })
  .openapi('PuzzleLibrary')

export type PuzzleLibraryBody = z.infer<typeof PuzzleLibrarySchema>

export const LibraryPuzzleSchema = z
  .object({
    id: PuzzleId,
    url: z.string().openapi({ example: 'https://lichess.org/training/00sHx' }),
    fen: z.string().openapi({ description: 'The position to solve' }),
    opponentMove: Uci.openapi({ description: 'The move that led to it, to show on the board' }),
    color: z.enum(['white', 'black']).openapi({ description: 'The solver’s side' }),
    solution: z.array(Uci).min(1).openapi({
      description:
        'UCI: the solver’s move, the opponent’s answer, and so on. Where lichess accepts another move (any mate as the last move), that is the client’s to allow.',
    }),
    rating: z.number().int(),
    themes: z.array(Theme),
    theme: Theme.optional().openapi({ description: 'The wanted theme it was picked for' }),
  })
  .openapi('LibraryPuzzle')

export type LibraryPuzzleBody = z.infer<typeof LibraryPuzzleSchema>

export const NextPuzzleRequestSchema = z
  .object({
    themes: z
      .array(Theme)
      .max(50)
      .default([])
      .openapi({ description: 'A puzzle of any of these; none: of any theme' }),
    rating: z
      .number()
      .int()
      .min(0)
      .max(4000)
      .default(1500)
      .openapi({ description: 'The puzzle’s rating should be close to this' }),
    exclude: z
      .array(PuzzleId)
      .max(20_000)
      .default([])
      .openapi({ description: 'Ids not to hand out, e.g. the ones already solved' }),
  })
  .openapi('NextPuzzleRequest')

export type NextPuzzleRequestBody = z.infer<typeof NextPuzzleRequestSchema>

const problem = (description: string) => ({
  description,
  content: { 'application/problem+json': { schema: ProblemSchema } },
})

const unavailable = problem('No puzzles on this server yet (bun run puzzles:fetch)')

export const puzzleLibraryRoute = createRoute({
  method: 'get',
  path: '/puzzles',
  tags: ['puzzles'],
  summary: 'The puzzle library: where its puzzles come from, and its themes with their sizes',
  responses: {
    200: {
      description: 'The library',
      content: { 'application/json': { schema: PuzzleLibrarySchema } },
    },
    503: unavailable,
  },
})

export const nextPuzzleRoute = createRoute({
  method: 'post',
  path: '/puzzles/next',
  tags: ['puzzles'],
  summary: 'A puzzle to solve next, by theme and difficulty',
  description:
    'Of several themes one is drawn first, each as likely as the others, then a puzzle of it by chance among those closest to the rating. A POST because the ids to leave out can be many.',
  request: {
    body: { content: { 'application/json': { schema: NextPuzzleRequestSchema } }, required: true },
  },
  responses: {
    200: {
      description: 'The puzzle',
      content: { 'application/json': { schema: LibraryPuzzleSchema } },
    },
    400: problem('Invalid request'),
    404: problem('No puzzle left: none of these themes, or all of them excluded'),
    503: unavailable,
  },
})

export const libraryPuzzleRoute = createRoute({
  method: 'get',
  path: '/puzzles/{id}',
  tags: ['puzzles'],
  summary: 'One puzzle of the library, by its lichess id',
  request: { params: z.object({ id: PuzzleId }) },
  responses: {
    200: {
      description: 'The puzzle',
      content: { 'application/json': { schema: LibraryPuzzleSchema } },
    },
    404: problem('No such puzzle in the library'),
    503: unavailable,
  },
})

const ThemeExampleSchema = z.object({ gameId: z.string(), ply: z.number().int() })

export const WeakThemesSchema = z
  .object({
    /** The user's last games read, and how many of them were reviewed (only those count). */
    games: z.number().int(),
    reviewed: z.number().int(),
    /** Mistakes in the reviewed games, with a theme or not. */
    mistakes: z.number().int(),
    /** The themes behind those mistakes, the most frequent first, with where they were. */
    themes: z.array(
      z.object({
        theme: Theme,
        /** The better move had this theme, and the user didn't play it. */
        missed: z.array(ThemeExampleSchema),
        /** The user's move allowed the opponent this theme. */
        walkedInto: z.array(ThemeExampleSchema),
      }),
    ),
  })
  .openapi('WeakThemes')

export type WeakThemesBody = z.infer<typeof WeakThemesSchema>

export const PuzzleTrainingSchema = z
  .object({
    /** The user's puzzle rating (lichess' scale), and the attempts that counted for it. */
    rating: z.number().int(),
    rated: z.number().int(),
    /** Fewer attempts than it takes to settle: the rating still moves a lot. */
    provisional: z.boolean(),
    attempts: z.number().int(),
    /** New puzzles solved at the first try (repeats aside). */
    solvedFirstTry: z.number().int(),
    /** Missed puzzles due again now, and ones that come back later. */
    due: z.number().int(),
    waiting: z.number().int(),
    /** The rating after each counted attempt, the oldest first (the last 100). */
    history: z.array(z.object({ at: z.string(), rating: z.number().int() })),
    /** Per theme of the new puzzles tried: how many, and solved at the first try. */
    themes: z.array(
      z.object({ theme: Theme, attempts: z.number().int(), solved: z.number().int() }),
    ),
  })
  .openapi('PuzzleTraining')

export type PuzzleTrainingBody = z.infer<typeof PuzzleTrainingSchema>

export const TrainingPuzzleRequestSchema = z
  .object({
    themes: z.array(Theme).max(50).optional().openapi({
      description:
        'A new puzzle of these themes. Left out: the trainer picks (due repeats, the weak themes, any theme)',
    }),
  })
  .openapi('TrainingPuzzleRequest')

export type TrainingPuzzleRequestBody = z.infer<typeof TrainingPuzzleRequestSchema>

export const TrainingPuzzleSchema = LibraryPuzzleSchema.extend({
  /** Why this one: missed before, from the weak themes, any theme, or the themes asked for. */
  reason: z.enum(['repeat', 'weak', 'mixed', 'chosen']),
}).openapi('TrainingPuzzle')

export type TrainingPuzzleBody = z.infer<typeof TrainingPuzzleSchema>

export const PuzzleAttemptSchema = z
  .object({ puzzleId: PuzzleId, solvedFirstTry: z.boolean() })
  .openapi('PuzzleAttempt')

export type PuzzleAttemptBody = z.infer<typeof PuzzleAttemptSchema>

export const PuzzleAttemptResultSchema = z
  .object({
    /** The rating after it, and by how much it moved (0 on a repeat). */
    rating: z.number().int(),
    change: z.number().int(),
    repeat: z.boolean(),
    /** Missed: when it comes back, ISO 8601. */
    dueAt: z.string().optional(),
  })
  .openapi('PuzzleAttemptResult')

export type PuzzleAttemptResultBody = z.infer<typeof PuzzleAttemptResultSchema>

const noStore = problem('No database on this server, or no puzzle set')

export const weakThemesRoute = createRoute({
  method: 'get',
  path: '/training/themes',
  tags: ['training'],
  summary: 'The tactical themes behind the mistakes in the user’s last reviewed games',
  responses: {
    200: {
      description: 'The themes, the most frequent first',
      content: { 'application/json': { schema: WeakThemesSchema } },
    },
    503: problem('No database on this server'),
  },
})

export const puzzleTrainingRoute = createRoute({
  method: 'get',
  path: '/training/puzzles',
  tags: ['training'],
  summary: 'The user’s puzzle rating, attempts, repeats and solve rate per theme',
  responses: {
    200: {
      description: 'Where the user stands',
      content: { 'application/json': { schema: PuzzleTrainingSchema } },
    },
    503: noStore,
  },
})

export const nextTrainingPuzzleRoute = createRoute({
  method: 'post',
  path: '/training/puzzles/next',
  tags: ['training'],
  summary: 'The next puzzle for the user, at their rating',
  description:
    'Without themes the trainer picks: a due repeat about a third of the time, else a new puzzle from the weak themes about 70 % of the time, of any theme otherwise. Puzzles tried before only come back as repeats.',
  request: {
    body: {
      content: { 'application/json': { schema: TrainingPuzzleRequestSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      description: 'The puzzle',
      content: { 'application/json': { schema: TrainingPuzzleSchema } },
    },
    400: problem('Invalid request'),
    404: problem('No puzzle left of these themes'),
    503: noStore,
  },
})

export const puzzleAttemptRoute = createRoute({
  method: 'post',
  path: '/training/puzzles/attempts',
  tags: ['training'],
  summary: 'Keeps how a puzzle went: the rating moves, a missed one comes back',
  request: {
    body: { content: { 'application/json': { schema: PuzzleAttemptSchema } }, required: true },
  },
  responses: {
    200: {
      description: 'The rating after it',
      content: { 'application/json': { schema: PuzzleAttemptResultSchema } },
    },
    400: problem('Invalid attempt'),
    404: problem('No such puzzle in the library'),
    503: noStore,
  },
})
