import type { PuzzleAttemptResultBody, TrainingPuzzleBody } from '@pawnia/contracts'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { NoPuzzleLibraryError } from '@/adapters/api/remotePuzzles'
import { useServices } from '@/app/servicesContext'
import { TrainingTabs } from '../TrainingTabs'
import { PuzzlePlayer } from './PuzzlePlayer'
import { themeName } from './themes'
import '@/shared/game/GamePanel.css'
import '@/features/stats/Stats.css'
import '../Training.css'
import './Puzzles.css'

/** The trainer's pick: what the theme choice is when none is chosen. */
const FOR_YOU = ''

type Loaded =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'puzzle'; puzzle: TrainingPuzzleBody }
  | { kind: 'none' }
  | { kind: 'failed'; message: string; missing: boolean }

const REASONS: Record<TrainingPuzzleBody['reason'], string> = {
  repeat: 'A repeat: you missed this one before.',
  weak: 'From a theme behind your recent mistakes.',
  mixed: 'Any theme, at your rating.',
  chosen: 'Your theme, at your rating.',
}

/**
 * /training/puzzles: puzzles from lichess' puzzle database, at the user's puzzle rating. The
 * trainer picks (missed puzzles when due, the themes behind recent mistakes, any theme), or the
 * user picks a theme. Every attempt is kept on the server and moves the rating.
 */
export function PuzzlesPage() {
  const { puzzles } = useServices()
  const client = useQueryClient()
  const library = useQuery({
    queryKey: ['puzzle-library'],
    queryFn: () => puzzles.library(),
    retry: false,
  })
  const summary = useQuery({
    queryKey: ['puzzle-training'],
    queryFn: () => puzzles.training.summary(),
    retry: false,
  })
  const [theme, setTheme] = useState(FOR_YOU)
  const [loaded, setLoaded] = useState<Loaded>({ kind: 'idle' })
  const [tally, setTally] = useState({ solved: 0, played: 0 })
  const [result, setResult] = useState<PuzzleAttemptResultBody | { error: string }>()
  /** The attempt being kept: the next puzzle waits for it, so it isn't handed out again. */
  const keeping = useRef<Promise<unknown>>(Promise.resolve())

  const load = () => {
    setLoaded({ kind: 'loading' })
    setResult(undefined)
    void keeping.current
      .then(() => puzzles.training.next(theme ? { themes: [theme] } : {}))
      .then(
        (puzzle) => setLoaded(puzzle ? { kind: 'puzzle', puzzle } : { kind: 'none' }),
        (error: unknown) =>
          setLoaded({
            kind: 'failed',
            message: error instanceof Error ? error.message : String(error),
            missing: error instanceof NoPuzzleLibraryError,
          }),
      )
  }

  const record = (puzzleId: string, solvedFirstTry: boolean) => {
    setTally((t) => ({ solved: t.solved + (solvedFirstTry ? 1 : 0), played: t.played + 1 }))
    keeping.current = puzzles.training.record({ puzzleId, solvedFirstTry }).then(
      (kept) => {
        setResult(kept)
        void client.invalidateQueries({ queryKey: ['puzzle-training'] })
      },
      (error: unknown) =>
        setResult({ error: error instanceof Error ? error.message : String(error) }),
    )
  }

  if (loaded.kind === 'puzzle') {
    const { puzzle } = loaded
    return (
      <div className="stats-page puzzles-page">
        <TrainingTabs />
        <p className="puzzles-bar">
          <button
            type="button"
            className="puzzles-link"
            onClick={() => setLoaded({ kind: 'idle' })}
          >
            ← Puzzles
          </button>
          <span className="puzzles-rating" role="status" aria-label="Your puzzle rating">
            <RatingNote result={result} rating={summary.data?.rating} />
          </span>
          <span className="stats-note" role="status" aria-label="This visit">
            {tally.played === 0
              ? REASONS[puzzle.reason]
              : `${tally.solved} of ${tally.played} solved at the first try`}
          </span>
        </p>
        <PuzzlePlayer
          key={puzzle.id}
          puzzle={puzzle}
          onDone={(firstTry) => record(puzzle.id, firstTry)}
          onNext={load}
        />
      </div>
    )
  }

  const missing =
    library.error instanceof NoPuzzleLibraryError || (loaded.kind === 'failed' && loaded.missing)
  const themes = (library.data?.themes ?? [])
    .filter((t) => t.kind === 'motif' || t.kind === 'mate')
    .sort((a, b) => themeName(a.theme).localeCompare(themeName(b.theme)))
  const stand = summary.data

  return (
    <div className="stats-page puzzles-page">
      <TrainingTabs />
      <h1>Puzzles</h1>
      <p className="training-intro">
        Find the best move, and the line after it: the board answers with the opponent’s moves. A
        wrong move costs the first try, not the puzzle. Missed puzzles come back after 1, 3 and 7
        days.
      </p>
      {missing ? (
        <p className="message message-error" role="alert">
          This server has no puzzles yet. Fetch lichess’ puzzle set once with{' '}
          <code>bun run puzzles:fetch</code> in <code>apps/api</code>.
        </p>
      ) : (
        <>
          {stand && (
            <p className="puzzles-standing" role="status" aria-label="Your puzzles">
              <strong>Your puzzle rating: {stand.rating}</strong>
              {stand.provisional && (
                <span className="stats-note">
                  {' '}
                  (still finding your level: {stand.rated} of 20 puzzles)
                </span>
              )}
              <br />
              {standingText(stand)}
            </p>
          )}
          {summary.isError && (
            <p className="message message-error" role="alert">
              Your attempts can’t be read: {summary.error.message}
            </p>
          )}
          <div className="stats-filters puzzles-filters">
            <label>
              <span className="settings-label">Theme</span>
              <select value={theme} onChange={(e) => setTheme(e.target.value)}>
                <option value={FOR_YOU}>Picked for you</option>
                {themes.map((t) => (
                  <option key={t.theme} value={t.theme}>
                    {themeName(t.theme)} ({t.puzzles.toLocaleString('en')})
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="stats-note">
            {theme === FOR_YOU
              ? 'Missed puzzles when they are due, the themes behind your recent mistakes, and some of any theme.'
              : `New ${themeName(theme).toLowerCase()} puzzles at your rating.`}
          </p>
          <button
            type="button"
            className="training-start"
            disabled={loaded.kind === 'loading'}
            onClick={load}
          >
            {loaded.kind === 'loading' ? 'Finding one…' : 'Solve a puzzle'}
          </button>
          {loaded.kind === 'none' && (
            <p className="training-intro" role="status">
              No new puzzle left with this theme. Pick another one.
            </p>
          )}
          {loaded.kind === 'failed' && (
            <p className="message message-error" role="alert">
              {loaded.message}
            </p>
          )}
          {library.data && (
            <p className="stats-note">
              {library.data.puzzles.toLocaleString('en')} puzzles from the{' '}
              <a href="https://database.lichess.org/#puzzles" target="_blank" rel="noreferrer">
                lichess puzzle database
              </a>{' '}
              ({library.data.source.license}); ratings on lichess’ scale.
            </p>
          )}
        </>
      )}
    </div>
  )
}

/** The rating above the board: as it was, then after the last attempt with how it moved. */
function RatingNote({
  result,
  rating,
}: {
  result: PuzzleAttemptResultBody | { error: string } | undefined
  rating: number | undefined
}) {
  if (result && 'error' in result) return <>Not kept: {result.error}</>
  if (!result) return rating === undefined ? null : <>Rating {rating}</>
  return (
    <>
      Rating {result.rating}{' '}
      <span className={result.change < 0 ? 'puzzles-down' : 'puzzles-up'}>
        {result.repeat ? '(a repeat: unchanged)' : signed(result.change)}
      </span>
    </>
  )
}

function standingText(stand: {
  attempts: number
  rated: number
  solvedFirstTry: number
  due: number
  waiting: number
}): string {
  if (stand.attempts === 0) return 'No puzzles tried yet.'
  const parts = [`${stand.solvedFirstTry} of ${stand.rated} new puzzles solved at the first try`]
  if (stand.due > 0) parts.push(`${stand.due} missed ${stand.due === 1 ? 'one' : 'ones'} due again`)
  if (stand.waiting > 0) parts.push(`${stand.waiting} coming back later`)
  return parts.join(' · ')
}

function signed(change: number): string {
  return change > 0 ? `+${change}` : change < 0 ? `−${-change}` : '±0'
}
