import { readSpokenSquare, type SquareName } from '@pawnia/chess'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { cleanTranscript } from './transcript'
import { attachPage, useVoiceSession } from './session'
import type { VoiceView } from './useVoice'

/**
 * Voice input where the answer is a square, not a move (naming a square in the notation trainer):
 * what was heard goes to `onSquare` when it names one square clearly. `noAnswer` says why nothing
 * can be answered right now (no question on the board); undefined when one can.
 */
export function useSpokenSquare({
  onSquare,
  noAnswer,
}: {
  onSquare: (square: SquareName) => void
  noAnswer?: string
}): VoiceView {
  const session = useVoiceSession()
  const latest = useRef({ onSquare, noAnswer })
  useLayoutEffect(() => {
    latest.current = { onSquare, noAnswer }
  })
  const [shown, setShown] = useState<{ heard?: string; note?: string }>({})

  useEffect(
    () =>
      attachPage(
        (text) => {
          const heard = cleanTranscript(text)
          if (!heard) return setShown({ heard, note: 'Heard nothing.' })
          const page = latest.current
          if (page.noAnswer) return setShown({ heard, note: page.noAnswer })
          const square = readSpokenSquare(heard)
          if (!square) return setShown({ heard, note: 'Not a square.' })
          setShown({ heard, note: `Said ${square}.` })
          page.onSquare(square)
        },
        (note) => setShown({ note }),
      ),
    [],
  )

  const none = () => undefined
  return {
    session,
    ...(shown.heard && { heard: shown.heard }),
    ...(shown.note && { note: shown.note }),
    pick: none,
    answer: none,
    dismiss: none,
  }
}
