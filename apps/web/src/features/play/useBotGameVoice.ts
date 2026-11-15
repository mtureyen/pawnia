import { sayMove, type Color, type GameStatus, type MoveNode } from '@pawnia/chess'
import type { Termination } from '@pawnia/play'
import { useEffect, useRef } from 'react'
import { sayComment } from '@/shared/voice/announce'
import { speaker } from '@/shared/voice/speech'
import { readAloud, useVoiceSettings } from '@/shared/voice/voiceStore'
import { botGameAnnouncement } from './botVoice'
import type { MoveComment } from './useMoveComments'

/**
 * Reads a bot game aloud as it is played: each new move at the end of the game (the user's own
 * only if asked), how the game ended, and the coach's comments if asked. What was there before
 * (a resumed game) isn't read, and nothing is caught up on after unmuting.
 */
export function useBotGameVoice({
  end,
  over,
  status,
  termination,
  color,
  comments,
}: {
  /** The last move of the game, wherever the user is looking. */
  end: MoveNode
  over: boolean
  status: GameStatus
  termination: Termination | undefined
  color: Color
  /** Newest first. */
  comments: MoveComment[]
}) {
  const settings = useVoiceSettings()
  const said = useRef({ ply: end.ply, over })
  const lastComment = useRef(comments[0])

  useEffect(() => {
    const before = said.current
    said.current = { ply: end.ply, over }
    // A takeback: what was being said is about a move that's gone.
    if (end.ply < before.ply) return speaker.cancel()
    const move = end.ply > before.ply ? end.move : undefined
    const ended = over && !before.over
    if (!settings.botGames || (!move && !ended)) return
    const text = botGameAnnouncement({
      move,
      ended,
      status,
      termination,
      you: color,
      ownMoves: settings.ownMoves,
    })
    if (text) readAloud(text)
  }, [end, over, status, termination, color, settings.botGames, settings.ownMoves])

  const comment = comments[0]
  useEffect(() => {
    const before = lastComment.current
    lastComment.current = comment
    // Only a new comment: after a takeback the newest is one already there.
    if (!comment || comment === before || (before && comment.ply <= before.ply)) return
    if (!settings.botGames || !settings.coachComments) return
    // It can come a while after its move, so it says which; it waits for whatever is being
    // said, and the next move cuts it short.
    const san = comment.move.split(' ').at(-1) ?? ''
    readAloud(`About ${sayMove(san)}: ${sayComment(comment.text)}`, { queue: true })
  }, [comment, settings.botGames, settings.coachComments])

  // Leaving the game leaves it quiet.
  useEffect(() => () => speaker.cancel(), [])
}
