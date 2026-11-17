/**
 * What the board reads aloud, and how, and how moves are spoken into the microphone. A per-device
 * preference: the voices and the microphones are the browser's.
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
  /**
   * Moving by speaking. Off until turned on, since it downloads a speech model; once on, the model
   * loads when a page with a board opens.
   */
  speakMoves: boolean
  /** The user agreed to that download (on the board's notice or here): it isn't asked again. */
  speechModelAccepted: boolean
  /** Push to talk (hold Space or the mic button) or always listening. */
  listening: ListeningMode
  /** A microphone's `deviceId`; null for the browser's default. */
  microphone: string | null
  /**
   * When nothing fits what was said with push to talk, ask the coach which move was meant. Off by
   * default: each time is a request to the coach (with the Claude API, a paid one).
   */
  askCoach: boolean
  /** Bot games without the pieces shown, until the game is over: play from the moves heard. */
  blindfold: boolean
}

export type ListeningMode = 'push' | 'always'

export const RATE_RANGE = { min: 0.5, max: 2, step: 0.1 } as const

export const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  botGames: true,
  localGames: false,
  analysis: false,
  ownMoves: false,
  coachComments: false,
  voice: null,
  rate: 1,
  speakMoves: false,
  speechModelAccepted: false,
  listening: 'push',
  microphone: null,
  askCoach: false,
  blindfold: false,
}

const SWITCHES = [
  'botGames',
  'localGames',
  'analysis',
  'ownMoves',
  'coachComments',
  'speakMoves',
  'speechModelAccepted',
  'askCoach',
  'blindfold',
] as const

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
  if (stored.listening === 'always') settings.listening = 'always'
  if (typeof stored.microphone === 'string' && stored.microphone)
    settings.microphone = stored.microphone
  const rate = stored.rate
  if (typeof rate === 'number' && Number.isFinite(rate))
    settings.rate = Math.min(RATE_RANGE.max, Math.max(RATE_RANGE.min, rate))
  return settings
}
