import type { Move, SpokenMove, SquareName } from '@pawnia/chess'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useServices } from '@/app/servicesContext'
import type { BoardDrawing } from '@/shared/board/Board'
import { voiceSettings } from '@/shared/voice/voiceStore'
import { decide, type Decision, type PageCommand, type Question } from './decide'
import { attachPage, useVoiceSession, type VoiceSnapshot } from './session'

/** What a page offers the voice: its position, how to play a move, and its commands. */
export interface VoiceTarget {
  fen: string
  /** Why no move can be played right now; undefined when one can. */
  noMove?: string
  /** Plays a move exactly as a move made on the board would. */
  onMove: (move: Move) => void
  /** The commands the page has right now; one left out or undefined isn't offered. */
  commands: Partial<Record<PageCommand, (() => void) | undefined>>
}

export interface VoiceView {
  session: VoiceSnapshot
  /** What was heard last, cleaned up, and what came of it. */
  heard?: string
  note?: string
  /** A question waiting for an answer (spoken or clicked). */
  question?: Question
  /** The moves asked about, as numbered arrows for the board. */
  drawing?: BoardDrawing
  pick(move: SpokenMove): void
  /** Answers a confirmation question. */
  answer(yes: boolean): void
  /** Drops the open question. */
  dismiss(): void
}

/**
 * Voice input on a page with a board: hears transcripts from the session, decides what they mean
 * in the page's position and carries it out through the page's own callbacks.
 *
 * With Settings → Voice's "Ask the coach" on, words nothing fits (said with push to talk, never
 * while always listening, which hears the whole room) go to the coach, and the move it reads is
 * asked about like any unclear move: it is never played without a "yes" or a click.
 */
export function useVoice(target: VoiceTarget): VoiceView {
  const session = useVoiceSession()
  const { coach } = useServices()
  const asking = useRef<AbortController>(undefined)
  const latest = useRef(target)
  useLayoutEffect(() => {
    latest.current = target
  })
  const [shown, setShown] = useState<{ heard?: string; note?: string; question?: Question }>({})
  const questionRef = useRef<Question>(undefined)

  const apply = useCallback((decision: Decision, via: 'push' | 'listen' | 'click') => {
    const page = latest.current
    let { outcome, note, question } = decision
    // Always listening hears everything said near the computer: only a move, a command or a real
    // choice between moves acts; a weak fit is shown and left alone.
    if (
      via === 'listen' &&
      outcome.kind === 'ask' &&
      outcome.question.kind === 'which' &&
      outcome.question.moves.length < 2
    ) {
      outcome = { kind: 'nothing' }
      note = 'Not clear enough; ignored.'
      question = undefined
    }
    if (outcome.kind === 'play') {
      const { from, to, promotion } = outcome.move
      page.onMove({ from, to, ...(promotion && { promotion }) })
    } else if (outcome.kind === 'command') page.commands[outcome.command]?.()
    questionRef.current = question
    setShown({ heard: decision.heard, note, question })
  }, [])

  const contextOf = useCallback(() => {
    const page = latest.current
    const commands = new Set(
      (Object.keys(page.commands) as PageCommand[]).filter((c) => page.commands[c]),
    )
    return { fen: page.fen, commands, ...(page.noMove && { noMove: page.noMove }) }
  }, [])

  const stopAsking = useCallback(() => {
    asking.current?.abort()
    asking.current = undefined
  }, [])

  const askCoach = useCallback(
    (heard: string, fen: string) => {
      const abort = new AbortController()
      asking.current = abort
      setShown((s) => ({ ...s, note: 'Not a move here. Asking the coach…' }))
      // Only an answer for the position still on the board, and for the last thing said, counts.
      const current = () => !abort.signal.aborted && latest.current.fen === fen
      coach
        .readSpokenMove({ fen, said: heard }, abort.signal)
        .then((move) => {
          if (!current()) return
          if (!move) {
            setShown((s) => ({ ...s, note: 'Not a move here, and the coach can’t tell either.' }))
            return
          }
          const spoken: SpokenMove = {
            from: move.from as SquareName,
            to: move.to as SquareName,
            san: move.san,
            ...(move.promotion && { promotion: move.promotion }),
          }
          const question: Question = { kind: 'which', moves: [spoken], fen }
          const note = `The coach reads ${move.san}. Say “yes”, or click it.`
          apply({ outcome: { kind: 'ask', question }, heard, note, question }, 'push')
        })
        .catch(() => {
          if (current())
            setShown((s) => ({ ...s, note: 'Not a move here, and the coach couldn’t be asked.' }))
        })
        .finally(() => {
          if (asking.current === abort) asking.current = undefined
        })
    },
    [apply, coach],
  )

  useEffect(() => {
    const detach = attachPage(
      (text, via) => {
        stopAsking()
        const context = contextOf()
        const decision = decide(text, context, questionRef.current)
        apply(decision, via)
        if (decision.unread && via === 'push' && voiceSettings().askCoach)
          askCoach(decision.heard, context.fen)
      },
      (note) => setShown((s) => ({ ...s, heard: undefined, note })),
    )
    return () => {
      detach()
      stopAsking()
    }
  }, [apply, askCoach, contextOf, stopAsking])

  // A question about moves holds only in the position it was asked in.
  const question =
    shown.question?.kind === 'which' && shown.question.fen !== target.fen
      ? undefined
      : shown.question
  const drawing: BoardDrawing | undefined =
    question?.kind === 'which'
      ? {
          arrows: question.moves.map((move, i) => ({
            from: move.from,
            to: move.to,
            color: 'blue',
            label: String(i + 1),
          })),
          squares: [],
        }
      : undefined

  return {
    session,
    ...(shown.heard !== undefined && { heard: shown.heard }),
    ...(shown.note !== undefined && { note: shown.note }),
    ...(question && { question }),
    ...(drawing && { drawing }),
    pick: (move) => {
      stopAsking()
      const context = contextOf()
      if (context.noMove) {
        apply({ outcome: { kind: 'nothing' }, heard: '', note: context.noMove }, 'click')
        return
      }
      apply({ outcome: { kind: 'play', move }, heard: '', note: `Played ${move.san}.` }, 'click')
    },
    answer: (yes) => {
      stopAsking()
      const open = questionRef.current
      if (open?.kind !== 'confirm') return
      if (yes) {
        apply(
          {
            outcome: { kind: 'command', command: open.command },
            heard: '',
            note: open.command === 'resign' ? 'Resigned.' : 'Offered a draw.',
          },
          'click',
        )
      } else apply({ outcome: { kind: 'nothing' }, heard: '', note: 'Cancelled.' }, 'click')
    },
    dismiss: () => {
      stopAsking()
      apply({ outcome: { kind: 'nothing' }, heard: '', note: 'Cancelled.' }, 'click')
    },
  }
}
