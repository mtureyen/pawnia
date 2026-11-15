import type { Color, SquareName } from '@pawnia/chess'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Board, type BoardHighlight } from '@/shared/board/Board'
import {
  drillKey,
  forget,
  withRoundScore,
  withSquareAnswer,
  type CoordinateMode,
  type NotationProgress,
  type SideChoice,
  type UpdateProgress,
} from './progress'
import {
  FILES,
  RANKS,
  drilledSquares,
  partOfBoardText,
  pickSquare,
  squareChoices,
  typedSquare,
} from './squares'
import { Choice } from './Choice'
import { WeakSquares } from './WeakSquares'

const EMPTY_FEN = '8/8/8/8/8/8/8/8 w - - 0 1'
const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const NO_MOVES = new Map<SquareName, SquareName[]>()
/** A timed round, as on lichess. */
export const ROUND_MS = 30_000
/** How long a miss shows the right square before the next question. */
const MISS_PAUSE_MS = 1100
/** How long a square found stays green. */
const FLASH_MS = 350

interface DrillSettings {
  mode: CoordinateMode
  side: SideChoice
  timed: boolean
  pieces: boolean
  files: string[]
  ranks: string[]
}

/** The coordinates part: find a named square, or name a marked one. */
export function CoordinateTrainer({
  progress,
  update,
}: {
  progress: NotationProgress
  update: UpdateProgress
}) {
  const [settings, setSettings] = useState<DrillSettings>({
    mode: 'find',
    side: 'white',
    timed: false,
    pieces: false,
    files: [],
    ranks: [],
  })
  const change = (next: Partial<DrillSettings>) => setSettings((s) => ({ ...s, ...next }))
  // A new drill (fresh score, fresh question) whenever what is drilled changes.
  const key = drillKey(settings.mode, settings.side, settings.files, settings.ranks)
  return (
    <>
      <Drill
        key={`${key}:${settings.timed}`}
        settings={settings}
        progress={progress}
        update={update}
        renderSettings={(locked) => (
          <Settings settings={settings} change={change} locked={locked} />
        )}
      />
      <WeakSquares progress={progress} onForget={() => update((p) => forget(p, 'squares'))} />
    </>
  )
}

interface Question {
  square: SquareName
  side: Color
  askedAt: number
  /** The names offered when naming the square. */
  choices: SquareName[]
}

function Drill({
  settings,
  progress,
  update,
  renderSettings,
}: {
  settings: DrillSettings
  progress: NotationProgress
  update: UpdateProgress
  renderSettings: (locked: boolean) => ReactNode
}) {
  const { mode, side: sideChoice, timed, pieces, files, ranks } = settings
  const squares = useMemo(() => drilledSquares(files, ranks), [files, ranks])
  const best = progress.best[drillKey(mode, sideChoice, files, ranks)]

  const ask = (previous?: Question): Question => {
    const side = sideChoice !== 'both' ? sideChoice : previous?.side === 'white' ? 'black' : 'white'
    const square = pickSquare(squares, progress.squares[side], Math.random, previous?.square)
    return { square, side, askedAt: Date.now(), choices: squareChoices(square, Math.random) }
  }

  const [question, setQuestion] = useState<Question | undefined>(() => (timed ? undefined : ask()))
  const [tally, setTally] = useState({ right: 0, missed: 0 })
  /** After a miss: the right square, and where the answer given is. */
  const [reveal, setReveal] = useState<{ right: SquareName; given: SquareName }>()
  const [flash, setFlash] = useState<SquareName>()
  const [typed, setTyped] = useState('')
  /** A timed round going on: when it ends. */
  const [endsAt, setEndsAt] = useState<number>()
  const [now, setNow] = useState(0)
  const [result, setResult] = useState<{ right: number; missed: number; best: boolean }>()
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  useEffect(() => () => timers.current.forEach(clearTimeout), [])
  const later = (ms: number, run: () => void) => {
    timers.current.push(setTimeout(run, ms))
  }

  const running = !timed || endsAt !== undefined

  const answer = (given: SquareName) => {
    if (!question || reveal || !running) return
    const right = given === question.square
    update((p) =>
      withSquareAnswer(p, question.side, question.square, right, Date.now() - question.askedAt),
    )
    setTally((t) => (right ? { ...t, right: t.right + 1 } : { ...t, missed: t.missed + 1 }))
    if (right) {
      if (mode === 'find') {
        setFlash(given)
        later(FLASH_MS, () => setFlash((f) => (f === given ? undefined : f)))
      }
      setQuestion(ask(question))
      return
    }
    setReveal({ right: question.square, given })
    later(MISS_PAUSE_MS, () => {
      setReveal(undefined)
      // Unless the round ended meanwhile.
      const next = ask(question)
      setQuestion((q) => (q === question ? next : q))
    })
  }

  const start = () => {
    setTally({ right: 0, missed: 0 })
    setResult(undefined)
    setReveal(undefined)
    const at = Date.now()
    setNow(at)
    setEndsAt(at + ROUND_MS)
    setQuestion(ask())
  }

  // The clock of a timed round; at zero the round ends and its score is kept if it is the best.
  const tallyNow = useRef(tally)
  useEffect(() => {
    tallyNow.current = tally
  })
  useEffect(() => {
    if (endsAt === undefined) return
    const tick = setInterval(() => setNow(Date.now()), 200)
    const end = setTimeout(() => {
      const final = tallyNow.current
      setEndsAt(undefined)
      setQuestion(undefined)
      setReveal(undefined)
      update(
        (p) => withRoundScore(p, drillKey(mode, sideChoice, files, ranks), final.right).progress,
      )
      setResult({ ...final, best: final.right > 0 && (best === undefined || final.right > best) })
    }, endsAt - Date.now())
    return () => {
      clearInterval(tick)
      clearTimeout(end)
    }
  }, [endsAt, mode, sideChoice, files, ranks, best, update])

  // Naming by keyboard: a file letter, then a rank digit.
  const answerRef = useRef(answer)
  useEffect(() => {
    answerRef.current = answer
  })
  const typedRef = useRef('')
  const naming = mode === 'name' && question !== undefined && !reveal && running
  useEffect(() => {
    if (!naming) return
    const type = (text: string) => {
      typedRef.current = text
      setTyped(text)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.target instanceof HTMLElement && e.target.closest('input, textarea, select')) return
      const key = e.key.toLowerCase()
      if (key === 'escape' || key === 'backspace') type('')
      else if (/^[a-h]$/.test(key)) type(key)
      else if (/^[1-8]$/.test(key)) {
        const square = typedSquare(typedRef.current + key)
        type('')
        if (square) answerRef.current(square)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [naming])

  const orientation: Color = question?.side ?? (sideChoice === 'black' ? 'black' : 'white')
  const highlights: BoardHighlight[] = reveal
    ? [
        { square: reveal.given, tone: 'wrong' },
        { square: reveal.right, tone: 'right' },
      ]
    : [
        ...(mode === 'name' && question
          ? [{ square: question.square, tone: 'target' as const }]
          : []),
        ...(flash ? [{ square: flash, tone: 'right' as const }] : []),
      ]
  const secondsLeft = endsAt === undefined ? 0 : Math.max(0, Math.ceil((endsAt - now) / 1000))

  return (
    <div className="layout notation-layout">
      <section className="board-column" aria-label="Board">
        <p className="notation-side">
          {orientation === 'white' ? 'White' : 'Black'} at the bottom
          {sideChoice === 'both' && ' (the side changes every square)'}
        </p>
        <Board
          fen={pieces ? START_FEN : EMPTY_FEN}
          orientation={orientation}
          turnColor="white"
          dests={NO_MOVES}
          check={false}
          isPromotion={() => false}
          onMove={() => undefined}
          coordinates={false}
          highlights={highlights}
          {...(mode === 'find' && { onSquare: answer })}
        />
      </section>
      <aside className="panel training-panel notation-panel" aria-label="Coordinates">
        <div className="training-text">
          {renderSettings(endsAt !== undefined)}
          <div className="notation-question">
            {question ? (
              mode === 'find' ? (
                <p className="notation-ask">
                  Click <span className="notation-target">{question.square}</span>
                </p>
              ) : (
                <>
                  <p className="notation-ask">Which square is marked?</p>
                  <div className="notation-choices" role="group" aria-label="Answers">
                    {question.choices.map((c) => (
                      <button
                        key={c}
                        type="button"
                        disabled={reveal !== undefined}
                        className={
                          reveal?.right === c
                            ? 'notation-choice-right'
                            : reveal?.given === c
                              ? 'notation-choice-wrong'
                              : undefined
                        }
                        onClick={() => answer(c)}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                  <p className="stats-note">
                    Or type it: a letter, then a number{typed && <> (typed: {typed}…)</>}.
                  </p>
                </>
              )
            ) : result ? (
              <p className="notation-result" role="status">
                Time! {result.right} right, {result.missed} missed.{' '}
                {result.best ? 'A new best!' : best !== undefined && `Your best: ${best}.`}
              </p>
            ) : (
              <p className="stats-note">
                30 seconds: as many squares as you can.
                {best !== undefined && ` Your best here: ${best}.`}
              </p>
            )}
            {timed && endsAt === undefined && (
              <button type="button" className="training-next notation-start" onClick={start}>
                {result ? 'Again' : 'Start the clock'}
              </button>
            )}
          </div>
          <p className="notation-feedback" role="status" aria-label="Answer">
            {reveal &&
              (mode === 'find'
                ? `That was ${reveal.given}. ${reveal.right} is the green square.`
                : `It is ${reveal.right}. ${reveal.given} is the red square.`)}
          </p>
        </div>
        {running && (
          <p className="notation-score" role="group" aria-label="Score">
            {timed && (
              <span className="notation-clock">0:{String(secondsLeft).padStart(2, '0')} </span>
            )}
            {tally.right} right · {tally.missed} missed
            {timed && best !== undefined && <span className="stats-note"> · best {best}</span>}
          </p>
        )}
      </aside>
    </div>
  )
}

function Settings({
  settings,
  change,
  locked,
}: {
  settings: DrillSettings
  change: (next: Partial<DrillSettings>) => void
  locked: boolean
}) {
  const toggle = (list: string[], item: string) =>
    list.includes(item) ? list.filter((x) => x !== item) : [...list, item]
  return (
    <div className="stats-filters notation-settings">
      <Choice
        legend="Task"
        value={settings.mode}
        options={[
          ['find', 'Find the square'],
          ['name', 'Name the square'],
        ]}
        onChange={(mode) => change({ mode })}
        locked={locked}
      />
      <Choice
        legend="Seen from"
        value={settings.side}
        options={[
          ['white', 'White'],
          ['black', 'Black'],
          ['both', 'Both'],
        ]}
        onChange={(side) => change({ side })}
        locked={locked}
      />
      <Choice
        legend="Timer"
        value={settings.timed ? 'on' : 'off'}
        options={[
          ['off', 'Off'],
          ['on', '30 seconds'],
        ]}
        onChange={(t) => change({ timed: t === 'on' })}
        locked={locked}
      />
      <Choice
        legend="Pieces"
        value={settings.pieces ? 'on' : 'off'}
        options={[
          ['off', 'None'],
          ['on', 'Start position'],
        ]}
        onChange={(p) => change({ pieces: p === 'on' })}
        locked={locked}
      />
      <fieldset className="notation-part-of-board">
        <legend>Files</legend>
        {FILES.map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={settings.files.includes(f)}
            disabled={locked}
            onClick={() => change({ files: toggle(settings.files, f) })}
          >
            {f}
          </button>
        ))}
      </fieldset>
      <fieldset className="notation-part-of-board">
        <legend>Ranks</legend>
        {RANKS.map((r) => (
          <button
            key={r}
            type="button"
            aria-pressed={settings.ranks.includes(r)}
            disabled={locked}
            onClick={() => change({ ranks: toggle(settings.ranks, r) })}
          >
            {r}
          </button>
        ))}
      </fieldset>
      <p className="stats-note notation-part-note">
        {settings.files.length + settings.ranks.length === 0 ? (
          'The whole board. Pick files or ranks to drill only those.'
        ) : (
          <>
            Only {partOfBoardText(settings.files, settings.ranks)}.{' '}
            <button
              type="button"
              className="notation-link"
              disabled={locked}
              onClick={() => change({ files: [], ranks: [] })}
            >
              Whole board
            </button>
          </>
        )}
      </p>
    </div>
  )
}
