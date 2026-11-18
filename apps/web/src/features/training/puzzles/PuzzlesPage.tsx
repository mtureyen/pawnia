import type { LibraryPuzzleBody } from '@pawnia/contracts'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { NoPuzzleLibraryError } from '@/adapters/api/remotePuzzles'
import { useServices } from '@/app/servicesContext'
import { TrainingTabs } from '../TrainingTabs'
import { PuzzlePlayer } from './PuzzlePlayer'
import { themeName } from './themes'
import '@/shared/game/GamePanel.css'
import '@/features/stats/Stats.css'
import '../Training.css'
import './Puzzles.css'

/** Puzzle ratings to pick from (lichess' scale). */
const RATINGS = [800, 1000, 1200, 1400, 1600, 1800, 2000, 2200]
const DEFAULT_RATING = 1200

type Loaded =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'puzzle'; puzzle: LibraryPuzzleBody }
  | { kind: 'none' }
  | { kind: 'failed'; message: string; missing: boolean }

/**
 * /training/puzzles: puzzles from lichess' puzzle database, by theme and rating, one after the
 * other. Nothing is kept yet beyond this visit: the puzzles solved here are left out of the next
 * ones until the page is left.
 */
export function PuzzlesPage() {
  const { puzzles } = useServices()
  const library = useQuery({
    queryKey: ['puzzle-library'],
    queryFn: () => puzzles.library(),
    retry: false,
  })
  const [rating, setRating] = useState(DEFAULT_RATING)
  const [theme, setTheme] = useState('')
  const [loaded, setLoaded] = useState<Loaded>({ kind: 'idle' })
  const [seen, setSeen] = useState<string[]>([])
  const [tally, setTally] = useState({ solved: 0, played: 0 })

  const load = (exclude = seen) => {
    setLoaded({ kind: 'loading' })
    puzzles.next({ rating, themes: theme ? [theme] : [], exclude }).then(
      (puzzle) => setLoaded(puzzle ? { kind: 'puzzle', puzzle } : { kind: 'none' }),
      (error: unknown) =>
        setLoaded({
          kind: 'failed',
          message: error instanceof Error ? error.message : String(error),
          missing: error instanceof NoPuzzleLibraryError,
        }),
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
          <span className="stats-note" role="status" aria-label="This visit">
            {tally.played === 0
              ? `Rated around ${rating}${theme ? ` · ${themeName(theme)}` : ''}`
              : `${tally.solved} of ${tally.played} solved at the first try`}
          </span>
        </p>
        <PuzzlePlayer
          key={puzzle.id}
          puzzle={puzzle}
          onDone={(firstTry) =>
            setTally((t) => ({ solved: t.solved + (firstTry ? 1 : 0), played: t.played + 1 }))
          }
          onNext={() => {
            const next = [...seen, puzzle.id]
            setSeen(next)
            load(next)
          }}
        />
      </div>
    )
  }

  const missing =
    library.error instanceof NoPuzzleLibraryError || (loaded.kind === 'failed' && loaded.missing)
  const themes = (library.data?.themes ?? [])
    .filter((t) => t.kind === 'motif' || t.kind === 'mate')
    .sort((a, b) => themeName(a.theme).localeCompare(themeName(b.theme)))

  return (
    <div className="stats-page puzzles-page">
      <TrainingTabs />
      <h1>Puzzles</h1>
      <p className="training-intro">
        Find the best move, and the line after it: the board answers with the opponent’s moves. A
        wrong move costs the first try, not the puzzle.
      </p>
      {missing ? (
        <p className="message message-error" role="alert">
          This server has no puzzles yet. Fetch lichess’ puzzle set once with{' '}
          <code>bun run puzzles:fetch</code> in <code>apps/api</code>.
        </p>
      ) : (
        <>
          <div className="stats-filters puzzles-filters">
            <label>
              <span className="settings-label">Rating</span>
              <select value={rating} onChange={(e) => setRating(Number(e.target.value))}>
                {RATINGS.map((r) => (
                  <option key={r} value={r}>
                    around {r}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="settings-label">Theme</span>
              <select value={theme} onChange={(e) => setTheme(e.target.value)}>
                <option value="">Any theme</option>
                {themes.map((t) => (
                  <option key={t.theme} value={t.theme}>
                    {themeName(t.theme)} ({t.puzzles.toLocaleString('en')})
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button
            type="button"
            className="training-start"
            disabled={loaded.kind === 'loading'}
            onClick={() => load()}
          >
            {loaded.kind === 'loading' ? 'Finding one…' : 'Solve a puzzle'}
          </button>
          {loaded.kind === 'none' && (
            <p className="training-intro" role="status">
              No puzzle left with this theme. Pick another one, or any theme.
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
              ({library.data.source.license}).
            </p>
          )}
        </>
      )}
    </div>
  )
}
