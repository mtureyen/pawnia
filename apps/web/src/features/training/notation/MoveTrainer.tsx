import { createGame, importPgn, sanVariants, type Move, type SquareName } from '@pawnia/chess'
import type { LibraryGame } from '@pawnia/library'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useServices } from '@/app/servicesContext'
import { Board } from '@/shared/board/Board'
import { Choice } from './Choice'
import {
  describeMove,
  moveChoices,
  movePool,
  movesOfGame,
  pickMove,
  sameMove,
  sanOf,
  slipKind,
  slipText,
  type MoveChoice,
  type MoveKind,
  type NotationMove,
} from './moves'
import { forget, withMoveAnswer, type NotationProgress, type UpdateProgress } from './progress'
import { weakness } from './squares'

/** The user's recent games the positions come from, as elsewhere in training. */
const GAMES = 30
const NO_MOVES = new Map<SquareName, SquareName[]>()
/** How long the position stands before the move to name is played on it. */
const MOVE_DELAY_MS = 450

type Task = 'play' | 'name'

const KINDS: [MoveKind | 'all', string][] = [
  ['all', 'All'],
  ['capture', 'Captures'],
  ['check', 'Checks'],
  ['castling', 'Castling'],
  ['promotion', 'Promotion'],
  ['disambiguation', 'Which piece'],
]
const KIND_NAMES: Record<MoveKind, string> = {
  pawn: 'pawn moves',
  piece: 'piece moves',
  capture: 'captures',
  check: 'checks and mates',
  castling: 'castling',
  promotion: 'promotion',
  disambiguation: 'which-piece letters',
}

function gameSource(game: LibraryGame): string {
  const date = new Date(game.playedAt).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
  return `your game ${game.white.name} – ${game.black.name}, ${date}`
}

/** The moves of the user's recent games, with built-in ones for the kinds they lack. */
function useMovePool() {
  const { library } = useServices()
  return useQuery({
    queryKey: ['notation-moves'],
    queryFn: async () => {
      // Without the browser's game store (blocked storage) the built-in positions still do.
      const games = await library.games.list({ limit: GAMES }).catch(() => [])
      const own = games.flatMap((game) => {
        try {
          return movesOfGame(importPgn(game.pgn).game, gameSource(game))
        } catch {
          return []
        }
      })
      return { games: own.length > 0 ? games.length : 0, pool: movePool(own) }
    },
  })
}

/** The moves part: play a move given in notation, or name a move played on the board. */
export function MoveTrainer({
  progress,
  update,
}: {
  progress: NotationProgress
  update: UpdateProgress
}) {
  const [task, setTask] = useState<Task>('play')
  const [only, setOnly] = useState<MoveKind | 'all'>('all')
  const pool = useMovePool()
  const settings = (
    <div className="stats-filters notation-settings">
      <Choice
        legend="Task"
        value={task}
        options={[
          ['play', 'Play the move'],
          ['name', 'Name the move'],
        ]}
        onChange={setTask}
        locked={false}
      />
      <Choice legend="Kind" value={only} options={KINDS} onChange={setOnly} locked={false} />
    </div>
  )
  if (!pool.data) return <p className="stats-note">Reading your games…</p>
  return (
    <>
      <MoveDrill
        key={`${task}:${only}`}
        task={task}
        {...(only !== 'all' && { only })}
        pool={pool.data.pool}
        progress={progress}
        update={update}
        settings={settings}
        source={
          pool.data.games > 0 ? (
            `Positions from your last ${pool.data.games} games, and built-in ones for the kinds of moves they have few of.`
          ) : (
            <>
              Built-in positions from well-known games. <Link to="/games">Import your games</Link>{' '}
              and the moves come from yours.
            </>
          )
        }
      />
      <TrickyKinds progress={progress} onForget={() => update((p) => forget(p, 'moves'))} />
    </>
  )
}

interface Question {
  move: NotationMove
  kind: MoveKind
  choices: MoveChoice[]
  /** The position after the move. */
  after: string
}

function MoveDrill({
  task,
  only,
  pool,
  progress,
  update,
  settings,
  source,
}: {
  task: Task
  only?: MoveKind
  pool: NotationMove[]
  progress: NotationProgress
  update: UpdateProgress
  settings: ReactNode
  source: ReactNode
}) {
  const ask = (previous?: NotationMove): Question | undefined => {
    const picked = pickMove(pool, progress.moves, Math.random, {
      ...(only && { only }),
      ...(previous && { previous }),
    })
    if (!picked) return undefined
    const { move, kind } = picked
    return {
      move,
      kind,
      choices: task === 'name' ? moveChoices(move.fen, move.san, Math.random) : [],
      after: createGame(move.fen).play(move.san)!.fen,
    }
  }
  const [question, setQuestion] = useState(() => ask())
  /** Wrong moves played on this question. */
  const [misses, setMisses] = useState(0)
  /** Done with this question: right at the first try, or not. */
  const [done, setDone] = useState<{ firstTry: boolean }>()
  const [feedback, setFeedback] = useState<{
    tone: 'right' | 'wrong'
    text: string
    more?: string
  }>()
  const [chosen, setChosen] = useState<string>()
  const [tally, setTally] = useState({ asked: 0, firstTry: 0 })
  /** Naming: the move is on the board (it is played a moment after the question appears). */
  const [moved, setMoved] = useState(false)

  useEffect(() => {
    if (task !== 'name' || !question) return
    const timer = setTimeout(() => setMoved(true), MOVE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [task, question])

  const game = useMemo(() => question && createGame(question.move.fen), [question])
  // A new map after each miss, so the board puts the wrongly played piece back.
  const dests = useMemo(
    () => (task === 'play' && game && !done ? new Map(game.dests()) : NO_MOVES),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `misses` resets the board
    [task, game, done, misses],
  )

  /** Counts the question once: right at the first try or not, for its kind of notation. */
  const count = (firstTry: boolean, kind: MoveKind) => {
    setTally((t) => ({ asked: t.asked + 1, firstTry: t.firstTry + (firstTry ? 1 : 0) }))
    update((p) => withMoveAnswer(p, kind, firstTry))
  }

  const onMove = (played: Move) => {
    if (!question || done) return
    const target = question.move
    if (sameMove(played, target.move)) {
      if (misses === 0) count(true, question.kind)
      setDone({ firstTry: misses === 0 })
      setFeedback({
        tone: 'right',
        text: misses === 0 ? 'Right.' : 'Now it is right.',
        more: describeMove(target),
      })
      return
    }
    // The first miss counts; the tries after it only teach.
    if (misses === 0) count(false, question.kind)
    setMisses((m) => m + 1)
    const san = sanOf(target.fen, played) ?? `${played.from}-${played.to}`
    const slip = sanVariants(target.fen, target.san).find((v) => v.san === san)?.slip
    setFeedback({
      tone: 'wrong',
      text: `You played ${san}, not ${target.san}. Try again.`,
      ...(slip && { more: slipText(slip, target, san) }),
    })
  }

  const showMe = () => {
    if (!question) return
    if (misses === 0) count(false, question.kind)
    setDone({ firstTry: false })
    setFeedback({ tone: 'wrong', text: 'Here it is.', more: describeMove(question.move) })
  }

  const choose = (choice: MoveChoice) => {
    if (!question || done || !moved) return
    setChosen(choice.san)
    setDone({ firstTry: !choice.slip })
    if (!choice.slip) {
      count(true, question.kind)
      setFeedback({ tone: 'right', text: 'Right.', more: describeMove(question.move) })
      return
    }
    // A miss counts against the kind it was about: a forgotten "+" against checks.
    count(false, slipKind(choice.slip) ?? question.kind)
    setFeedback({
      tone: 'wrong',
      text: `Not quite: it is ${question.move.san}. ${slipText(choice.slip, question.move, choice.san)}`,
      more: describeMove(question.move),
    })
  }

  const next = () => {
    setQuestion(ask(question?.move))
    setMisses(0)
    setDone(undefined)
    setFeedback(undefined)
    setChosen(undefined)
    setMoved(false)
  }

  // Quick on a keyboard: 1–4 pick an answer, Enter goes on.
  const keys = useRef({ choose, next, done, question })
  useEffect(() => {
    keys.current = { choose, next, done, question }
  })
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.target instanceof HTMLElement && e.target.closest('input, textarea, select')) return
      const { choose, next, done, question } = keys.current
      // Enter on a focused button is that button's.
      const onButton = e.target instanceof HTMLElement && e.target.closest('button')
      if (e.key === 'Enter' && done && !onButton) next()
      const choice = question?.choices[Number(e.key) - 1]
      if (choice && /^[1-9]$/.test(e.key)) choose(choice)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!question || !game) return <p className="stats-note">No moves of this kind to drill.</p>

  const { move } = question
  const side = move.color === 'white' ? 'White' : 'Black'
  const onBoard = task === 'name' ? moved : done !== undefined
  const fen = onBoard ? question.after : move.fen
  const shown = createGame(fen)
  return (
    <div className="layout notation-layout">
      <section className="board-column" aria-label="Board">
        <p className="notation-side">
          {side} to move · from {move.source}, move {move.moveNumber}
        </p>
        <Board
          fen={fen}
          orientation={move.color}
          turnColor={shown.turn()}
          dests={dests}
          {...(onBoard && { lastMove: [move.move.from, move.move.to] as [SquareName, SquareName] })}
          check={shown.isCheck()}
          isPromotion={(from, to) => game.isPromotion(from, to)}
          onMove={onMove}
        />
      </section>
      <aside className="panel training-panel notation-panel" aria-label="Moves">
        <div className="training-text">
          {settings}
          <div className="notation-question">
            {task === 'play' ? (
              <p className="notation-ask">
                Play <span className="notation-target">{move.san}</span>
              </p>
            ) : (
              <>
                <p className="notation-ask">Which move did {side} just play?</p>
                <div
                  className="notation-choices notation-choices-moves"
                  role="group"
                  aria-label="Answers"
                >
                  {question.choices.map((c, i) => (
                    <button
                      key={c.san}
                      type="button"
                      disabled={!moved || done !== undefined}
                      className={
                        done && !c.slip
                          ? 'notation-choice-right'
                          : done && chosen === c.san
                            ? 'notation-choice-wrong'
                            : undefined
                      }
                      onClick={() => choose(c)}
                    >
                      <span className="notation-key" aria-hidden="true">
                        {i + 1}
                      </span>
                      {c.san}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <div
            className={`notation-feedback${feedback ? ` notation-feedback-${feedback.tone}` : ''}`}
            role="status"
            aria-label="Answer"
          >
            {feedback && (
              <>
                <p>{feedback.text}</p>
                {feedback.more && <p>{feedback.more}</p>}
              </>
            )}
          </div>
          <div className="training-actions">
            {task === 'play' && !done && (
              <button type="button" onClick={showMe}>
                Show me
              </button>
            )}
            {done && (
              <button type="button" className="training-next" onClick={next}>
                Next
              </button>
            )}
          </div>
          <p className="stats-note">{source}</p>
        </div>
        <p className="notation-score" role="group" aria-label="Score">
          {tally.firstTry} of {tally.asked} right at the first try
        </p>
      </aside>
    </div>
  )
}

/** The kinds of move notation missed lately, the ones the trainer asks more often. */
function TrickyKinds({ progress, onForget }: { progress: NotationProgress; onForget: () => void }) {
  const kinds = (
    Object.entries(progress.moves) as [MoveKind, NonNullable<NotationProgress['moves'][MoveKind]>][]
  )
    .map(([kind, stat]) => ({ kind, stat, weakness: weakness(stat) }))
    .sort((a, b) => b.weakness - a.weakness)
  if (kinds.length === 0) return null
  const tricky = kinds.filter((k) => k.weakness > 0.05)
  return (
    <section className="stats-section" aria-label="Your tricky moves">
      <h2>Your tricky moves</h2>
      <p>
        {tricky.length === 0
          ? 'Nothing missed lately: every kind of move comes up as often as the others.'
          : `Missed lately, so they come up more often: ${tricky
              .map((k) => `${KIND_NAMES[k.kind]} (missed ${k.stat.missed} of ${k.stat.seen})`)
              .join('; ')}.`}
      </p>
      <button type="button" className="notation-link" onClick={onForget}>
        Forget these stats
      </button>
    </section>
  )
}
