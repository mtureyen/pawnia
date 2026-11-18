import type { Color, Move, SquareName } from '@pawnia/chess'
import type { LibraryPuzzleBody } from '@pawnia/contracts'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useVoice } from '@/features/voice/useVoice'
import { VoicePanel } from '@/features/voice/VoicePanel'
import { Board, type BoardDrawing } from '@/shared/board/Board'
import {
  answerFrom,
  gameAt,
  playReply,
  solverToMove,
  startSolve,
  tryMove,
  type SolveState,
} from './solve'
import { orderedThemes, themeName } from './themes'

const NO_MOVES = new Map<SquareName, SquareName[]>()
/** A breath before the opponent answers, so the solver sees their move land. */
const REPLY_DELAY_MS = 500
/** The pace "Show the answer" plays the rest of the solution at. */
const ANSWER_STEP_MS = 700

type Feedback = { tone: 'right' | 'wrong' | 'note'; text: string }

/**
 * One puzzle of the library: the opponent's last move is on the board, the solver finds the
 * best move and the line after it, the board answering with the opponent's moves. The themes give
 * the answer away, so they show only once it's over. `onDone` hears how it went, once.
 */
export function PuzzlePlayer({
  puzzle,
  onDone,
  onNext,
}: {
  puzzle: LibraryPuzzleBody
  onDone?: (solvedFirstTry: boolean) => void
  onNext: () => void
}) {
  const [state, setState] = useState<SolveState>(startSolve)
  const [feedback, setFeedback] = useState<Feedback>()
  const [hint, setHint] = useState(false)
  const [orientation, setOrientation] = useState<Color>(puzzle.color)
  /** Counts the wrong tries: a new map of moves puts the wrongly dropped piece back. */
  const [misses, setMisses] = useState(0)
  const game = useMemo(() => gameAt(puzzle, state.played), [puzzle, state.played])
  const last = game.current.move
  const lastMove: [SquareName, SquareName] = last
    ? [last.from, last.to]
    : [puzzle.opponentMove.slice(0, 2) as SquareName, puzzle.opponentMove.slice(2, 4) as SquareName]
  const yourMove = solverToMove(state)
  const dests = useMemo(
    () => (yourMove ? new Map(game.dests()) : NO_MOVES),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `misses` resets the board
    [game, yourMove, misses],
  )

  // The opponent's answer, after a breath; the rest of the answer, move by move, once shown.
  const reply = !yourMove && !state.end ? puzzle.solution[state.played.length] : undefined
  const nextShown = state.end === 'shown' ? answerFrom(puzzle, state)[0] : undefined
  useEffect(() => {
    const move = reply ?? nextShown
    if (!move) return
    const timer = setTimeout(
      () => setState((s) => playReply(s, move)),
      reply ? REPLY_DELAY_MS : ANSWER_STEP_MS,
    )
    return () => clearTimeout(timer)
  }, [reply, nextShown])

  // How it went, told once, when it ends.
  const told = useRef(false)
  useEffect(() => {
    if (!state.end || told.current) return
    told.current = true
    onDone?.(state.end === 'solved' && state.firstTry)
  }, [state.end, state.firstTry, onDone])

  const onMove = (move: Move) => {
    const result = tryMove(puzzle, state, move)
    setState(result.state)
    setHint(false)
    if (result.kind === 'wrong') {
      setMisses((m) => m + 1)
      setFeedback({ tone: 'wrong', text: 'That’s not it. Try another move.' })
    } else if (result.kind === 'right') {
      setFeedback({ tone: 'right', text: 'Right. Keep going.' })
    } else {
      setFeedback({
        tone: 'right',
        text: result.state.firstTry ? 'Solved at the first try!' : 'Solved.',
      })
    }
  }

  const showAnswer = () => {
    setHint(false)
    // The moves still to come are played out by the effect above.
    setState((s) => ({ ...s, firstTry: false, end: 'shown' }))
    setFeedback({ tone: 'note', text: 'The answer, move by move.' })
  }

  const voice = useVoice({
    fen: game.fen(),
    ...(!yourMove && {
      noMove: state.end ? 'The puzzle is over.' : 'Wait for the answer to your move.',
    }),
    onMove,
    commands: { flip: () => setOrientation((o) => (o === 'white' ? 'black' : 'white')) },
  })

  const expected = puzzle.solution[state.played.length]
  const hintDrawing: BoardDrawing | undefined =
    hint && yourMove && expected
      ? { arrows: [], squares: [{ square: expected.slice(0, 2), color: 'green' }] }
      : undefined
  const drawing = voice.drawing ?? hintDrawing
  const side = puzzle.color === 'white' ? 'White' : 'Black'
  const over = state.end !== undefined && nextShown === undefined

  return (
    <div className="layout puzzle-player">
      <section className="board-column">
        <Board
          fen={game.fen()}
          orientation={orientation}
          turnColor={game.turn()}
          dests={dests}
          lastMove={lastMove}
          check={game.isCheck()}
          isPromotion={(from, to) => game.isPromotion(from, to)}
          onMove={onMove}
          {...(drawing && { drawing })}
        />
      </section>
      <aside className="panel training-panel" aria-label="Puzzle">
        <div className="training-text">
          <h2>
            {over
              ? state.end === 'solved'
                ? 'Solved'
                : 'The answer'
              : `Find the best move for ${side}`}
          </h2>
          <p className="puzzle-turn" role="status">
            {yourMove
              ? `${side} to play.`
              : state.end
                ? over
                  ? `Puzzle rated ${puzzle.rating}.`
                  : 'Playing the answer…'
                : 'The opponent answers…'}
          </p>
          {feedback && (
            <p className={`practice-feedback practice-${feedback.tone}`}>{feedback.text}</p>
          )}
          {over && (
            <>
              <ul className="puzzle-themes" aria-label="Themes">
                {orderedThemes(puzzle.themes).map((theme) => (
                  <li key={theme}>{themeName(theme)}</li>
                ))}
              </ul>
              <p className="stats-note">
                From the lichess puzzle database.{' '}
                <a href={puzzle.url} target="_blank" rel="noreferrer">
                  This puzzle on lichess
                </a>
              </p>
            </>
          )}
        </div>
        <VoicePanel voice={voice} />
        <div className="training-actions">
          {!state.end && (
            <>
              <button
                type="button"
                disabled={!yourMove || hint}
                onClick={() => {
                  setHint(true)
                  setState((s) => ({ ...s, firstTry: false }))
                }}
              >
                Hint
              </button>
              <button type="button" onClick={showAnswer}>
                Show the answer
              </button>
            </>
          )}
          {over && (
            <button type="button" className="training-next" onClick={onNext}>
              Next puzzle
            </button>
          )}
          <button
            type="button"
            title="Flip board"
            onClick={() => setOrientation((o) => (o === 'white' ? 'black' : 'white'))}
          >
            Flip
          </button>
        </div>
      </aside>
    </div>
  )
}
