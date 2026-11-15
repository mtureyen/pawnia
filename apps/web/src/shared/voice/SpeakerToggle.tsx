import { speaker } from './speech'
import type { VoiceSettings } from './voiceSettings'
import { setVoiceSettings, useVoiceSettings } from './voiceStore'
import './SpeakerToggle.css'

type Where = Extract<keyof VoiceSettings, 'botGames' | 'localGames'>

/**
 * Turns reading moves aloud on and off where the game is, the same switch as in Settings → Voice.
 * Hidden in a browser that can't speak.
 */
export function SpeakerToggle({ where }: { where: Where }) {
  const settings = useVoiceSettings()
  if (!speaker.available) return null
  const on = settings[where]
  return (
    <button
      type="button"
      className="speaker-toggle"
      aria-pressed={on}
      aria-label="Read moves aloud"
      title={on ? 'Reading moves aloud (click to mute)' : 'Muted (click to read moves aloud)'}
      onClick={() => {
        if (on) speaker.cancel()
        setVoiceSettings({ [where]: !on })
      }}
    >
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />
        {on ? (
          <path
            d="M16 9.5a3.5 3.5 0 0 1 0 5M18.5 7a7 7 0 0 1 0 10"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        ) : (
          <path
            d="M16.5 9.5l5 5m0-5l-5 5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        )}
      </svg>
    </button>
  )
}
