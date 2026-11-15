import { sayMove, type GameState } from '@pawnia/chess'
import { useCallback } from 'react'
import { announcement, sayEnd } from './announce'
import { speaker } from './speech'
import { readAloud, useVoiceSettings } from './voiceStore'

type Update = (change: (game: GameState) => unknown) => void

/**
 * `update` for stepping through a game (arrow keys, step buttons) that reads the move now on the
 * board, if the analysis board reads aloud. Other changes (a click in the move list, a move
 * tried) go through the plain `update` and stay quiet.
 */
export function useSteppingVoice(update: Update): Update {
  const on = useVoiceSettings().analysis
  return useCallback(
    (change) =>
      update((game) => {
        const before = game.current
        change(game)
        if (!on || game.current === before) return
        const move = game.current.move
        // Back at the start there is no move to say; what was being said is out of date.
        if (!move) return speaker.cancel()
        readAloud(announcement(sayMove(move.san), sayEnd(game.status(game.current))))
      }),
    [update, on],
  )
}
