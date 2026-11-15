/**
 * What the board reads aloud, and how. A per-device preference: the voices are the browser's.
 * The microphone's settings (speaking moves) will join these later.
 */
export interface VoiceSettings {
  /** The bot's moves and how the game ended. On by default: that's where hearing moves helps. */
  botGames: boolean
  /** Every move of a game on one screen; off by default, both players see the board. */
  localGames: boolean
  /**
   * The move on the board while stepping through a game (arrow keys, the step buttons). Off by
   * default: while exploring, every move tried would be read.
   */
  analysis: boolean
  /** The user's own moves in bot games too, not only the bot's. */
  ownMoves: boolean
  /** The coach's short comments during bot games, after the move. */
  coachComments: boolean
  /** A voice's `voiceURI`; null picks an English voice by itself. */
  voice: string | null
  /** 1 is normal speed. */
  rate: number
}

export const RATE_RANGE = { min: 0.5, max: 2, step: 0.1 } as const

export const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  botGames: true,
  localGames: false,
  analysis: false,
  ownMoves: false,
  coachComments: false,
  voice: null,
  rate: 1,
}

const SWITCHES = ['botGames', 'localGames', 'analysis', 'ownMoves', 'coachComments'] as const

/** Stored settings, with anything unknown (an old or edited value) back at the default. */
export function parseVoiceSettings(value: unknown): VoiceSettings {
  const stored = (typeof value === 'object' && value !== null ? value : {}) as Record<
    string,
    unknown
  >
  const settings = { ...DEFAULT_VOICE_SETTINGS }
  for (const key of SWITCHES) {
    const on = stored[key]
    if (typeof on === 'boolean') settings[key] = on
  }
  if (typeof stored.voice === 'string' && stored.voice) settings.voice = stored.voice
  const rate = stored.rate
  if (typeof rate === 'number' && Number.isFinite(rate))
    settings.rate = Math.min(RATE_RANGE.max, Math.max(RATE_RANGE.min, rate))
  return settings
}
