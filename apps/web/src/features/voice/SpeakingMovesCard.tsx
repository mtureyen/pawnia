import { useEffect, useId, useState } from 'react'
import { setVoiceSettings, useVoiceSettings } from '@/shared/voice/voiceStore'
import { ListeningChoice } from './ListeningChoice'
import { listMicrophones } from './microphone'
import { DOWNLOAD_MB } from './model'
import { useVoiceSession } from './session'

/**
 * Settings → Voice, the microphone's card: moving by speaking on or off, push to talk or always
 * listening, and which microphone. Lives in the settings page's voice tab, beside what the board
 * reads aloud.
 */
export function SpeakingMovesCard() {
  const id = useId()
  const settings = useVoiceSettings()
  const session = useVoiceSession()
  const [microphones, setMicrophones] = useState<{ id: string; label: string }[]>([])
  const micOpen = session.mic.kind === 'open'
  useEffect(() => {
    let live = true
    // The names come once the microphone has been allowed, so the list is read again then.
    void listMicrophones()
      .then((list) => live && setMicrophones(list))
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [micOpen])
  // A microphone chosen before that isn't connected now: shown as the default.
  const chosen = settings.microphone && microphones.some((m) => m.id === settings.microphone)

  return (
    <section className="settings-card" aria-labelledby="voice-speak-heading">
      <h3 id="voice-speak-heading">Speaking moves</h3>
      <p className="settings-intro">
        Say a move instead of playing it: “knight f3”, “e takes d5”, “castle kingside”, or “take
        back”. Whisper, the speech recogniser, runs on this computer, so what you say never leaves
        it.
      </p>
      <div className="voice-switch">
        <div>
          <span className="settings-label" id={`${id}-label`}>
            Move by speaking
          </span>
          <p className="settings-note" id={`${id}-note`}>
            Downloads the speech model once (about {DOWNLOAD_MB} MB) and loads it when a board
            opens: in bot games, games on one screen and on the analysis board.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          className="switch"
          aria-checked={settings.speakMoves}
          aria-labelledby={`${id}-label`}
          aria-describedby={`${id}-note`}
          onClick={() =>
            setVoiceSettings(
              settings.speakMoves
                ? { speakMoves: false }
                : { speakMoves: true, speechModelAccepted: true },
            )
          }
        >
          <span />
        </button>
      </div>
      <ListeningChoice inSettings />
      <label className="settings-field">
        <span className="settings-label">Microphone</span>
        <select
          value={chosen ? (settings.microphone ?? '') : ''}
          onChange={(e) => setVoiceSettings({ microphone: e.target.value || null })}
        >
          <option value="">The browser’s default</option>
          {microphones.map((mic) => (
            <option key={mic.id} value={mic.id}>
              {mic.label}
            </option>
          ))}
        </select>
        <span className="settings-note">
          Their names show once the browser has been allowed to use the microphone.
        </span>
      </label>
      {session.engine.kind === 'ready' && session.engine.device !== 'scripted' && (
        <p className="settings-note" role="status">
          The speech model is loaded and runs on this computer’s{' '}
          {session.engine.device === 'webgpu' ? 'graphics card' : 'processor'}.
        </p>
      )}
      {session.engine.kind === 'failed' && (
        <p className="settings-note voice-unavailable" role="status">
          The speech model could not be loaded: {session.engine.message}
        </p>
      )}
    </section>
  )
}
