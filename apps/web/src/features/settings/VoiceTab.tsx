import { useId } from 'react'
import { speaker } from '@/shared/voice/speech'
import { isEnglish } from '@/shared/voice/voices'
import { RATE_RANGE, type VoiceSettings } from '@/shared/voice/voiceSettings'
import { readAloud, setVoiceSettings, useVoices, useVoiceSettings } from '@/shared/voice/voiceStore'

/** What "Try it" says: a few moves of the kinds there are. */
const SAMPLE = 'knight f3. e takes d5, check. castles kingside.'

type Switch = Extract<
  keyof VoiceSettings,
  'botGames' | 'ownMoves' | 'coachComments' | 'localGames' | 'analysis'
>

function SwitchRow({
  setting,
  label,
  note,
  disabled = false,
}: {
  setting: Switch
  label: string
  note: string
  disabled?: boolean
}) {
  const settings = useVoiceSettings()
  const id = useId()
  const on = settings[setting]
  return (
    <div className={`voice-switch${disabled ? ' voice-switch-off' : ''}`}>
      <div>
        <span className="settings-label" id={`${id}-label`}>
          {label}
        </span>
        <p className="settings-note" id={`${id}-note`}>
          {note}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        className="switch"
        aria-checked={on}
        aria-labelledby={`${id}-label`}
        aria-describedby={`${id}-note`}
        disabled={disabled}
        onClick={() => {
          setVoiceSettings({ [setting]: !on })
          if (on) speaker.cancel()
        }}
      >
        <span />
      </button>
    </div>
  )
}

/**
 * Settings → Voice: what the board reads aloud, with which voice and how fast. Kept in this
 * browser. Speaking moves into the microphone will get its own section here.
 */
export function VoiceTab() {
  const id = useId()
  const settings = useVoiceSettings()
  const voices = useVoices()
  const english = voices.filter(isEnglish)
  const others = voices.filter((v) => !isEnglish(v))
  // A voice chosen on another visit that the browser no longer has: shown as automatic.
  const chosen = settings.voice && voices.some((v) => v.voiceURI === settings.voice)

  return (
    <div className="voice-settings">
      <section className="settings-card" aria-labelledby="voice-read-heading">
        <h3 id="voice-read-heading">Read moves aloud</h3>
        <p className="settings-intro">
          The board says the moves as they are played: “knight f3”, “e takes d5, check”.
        </p>
        {!speaker.available && (
          <p className="settings-note voice-unavailable" role="status">
            This browser can’t read aloud.
          </p>
        )}
        <SwitchRow
          setting="botGames"
          label="In bot games"
          note="The bot’s moves, and how the game ends. The speaker on the game’s panel turns this off and on too."
        />
        <div className="voice-nested">
          <SwitchRow
            setting="ownMoves"
            label="My own moves too"
            note="Not only the bot’s."
            disabled={!settings.botGames}
          />
          <SwitchRow
            setting="coachComments"
            label="The coach’s comments"
            note="When the coach comments on your moves, after the move."
            disabled={!settings.botGames}
          />
        </div>
        <SwitchRow
          setting="localGames"
          label="In games on one screen"
          note="Every move, for both players."
        />
        <SwitchRow
          setting="analysis"
          label="On the analysis board"
          note="When stepping through a game with the arrow keys or the step buttons; not the moves you try."
        />
      </section>

      <section className="settings-card" aria-labelledby="voice-voice-heading">
        <h3 id="voice-voice-heading">How it sounds</h3>
        <label className="settings-field">
          <span className="settings-label">Voice</span>
          <select
            value={chosen ? (settings.voice ?? '') : ''}
            disabled={!speaker.available}
            onChange={(e) => setVoiceSettings({ voice: e.target.value || null })}
          >
            <option value="">Automatic (an English voice)</option>
            {english.length > 0 && (
              <optgroup label="English">
                {english.map((v) => (
                  <option key={v.voiceURI} value={v.voiceURI}>
                    {v.name} ({v.lang})
                  </option>
                ))}
              </optgroup>
            )}
            {others.length > 0 && (
              <optgroup label="Other languages">
                {others.map((v) => (
                  <option key={v.voiceURI} value={v.voiceURI}>
                    {v.name} ({v.lang})
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          <span className="settings-note">
            The voices are your browser’s and your system’s; moves are said in English.
          </span>
        </label>
        {/* Not one <label> around both: it would name the <output>, not the slider. */}
        <div className="settings-field">
          <span className="settings-label">
            <label htmlFor={`${id}-speed`}>Speed</label>{' '}
            <output htmlFor={`${id}-speed`}>{settings.rate.toFixed(1)}×</output>
          </span>
          <input
            id={`${id}-speed`}
            type="range"
            min={RATE_RANGE.min}
            max={RATE_RANGE.max}
            step={RATE_RANGE.step}
            value={settings.rate}
            disabled={!speaker.available}
            onChange={(e) => setVoiceSettings({ rate: Number(e.target.value) })}
          />
        </div>
        <button
          type="button"
          className="voice-try"
          disabled={!speaker.available}
          onClick={() => readAloud(SAMPLE)}
        >
          Try it
        </button>
      </section>
    </div>
  )
}
