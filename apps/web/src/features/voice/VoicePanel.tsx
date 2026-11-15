import { Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { ListeningChoice } from './ListeningChoice'
import { DOWNLOAD_MB } from './model'
import {
  acceptNotice,
  dismissNotice,
  press,
  release,
  retry,
  toggleMuted,
  turnOff,
  turnOn,
  type VoiceSnapshot,
} from './session'
import type { VoiceView } from './useVoice'
import './Voice.css'

/**
 * The voice controls a page shows: the mic button (hold it, or the space bar, to talk; in always
 * listening it stops and starts listening), what was heard and what came of it, a question when
 * there is one, and a popover to switch between push to talk and always listening (the rest is
 * in Settings → Voice). Voice input stays off, and downloads nothing, until it is turned on.
 */
export function VoicePanel({ voice }: { voice: VoiceView }) {
  const { session } = voice
  const [settingsOpen, setSettingsOpen] = useState(false)
  const ready = session.engine.kind === 'ready'
  const push = session.settings.listening === 'push'
  usePushToTalkKey(ready && push)

  return (
    <section className="mic" aria-label="Voice">
      <div className="mic-bar">
        <MicButton session={session} />
        <p className="mic-state" data-testid="voice-state">
          {stateText(session)}
        </p>
        <button
          type="button"
          className="mic-settings-toggle"
          aria-expanded={settingsOpen}
          aria-label="Voice settings"
          title="Voice settings"
          onClick={() => setSettingsOpen((open) => !open)}
        >
          <GearIcon />
        </button>
      </div>

      {settingsOpen && <VoiceSettingsPopover session={session} />}

      {session.engine.kind === 'notice' && (
        <div className="mic-notice" role="dialog" aria-label="Voice input">
          <p>
            Move by speaking: pawnia listens with Whisper, a speech recognition model that runs on
            this computer, so what you say never leaves it. It downloads about {DOWNLOAD_MB} MB once
            (from Hugging Face); your browser keeps it for later visits.
          </p>
          <div className="mic-notice-actions">
            <button type="button" className="mic-primary" onClick={acceptNotice}>
              Download and turn on
            </button>
            <button type="button" onClick={dismissNotice}>
              Not now
            </button>
          </div>
        </div>
      )}

      {session.engine.kind === 'loading' && (
        <progress
          className="mic-progress"
          aria-label="Downloading the speech model"
          value={Math.round(session.engine.share * 100)}
          max={100}
        />
      )}

      {session.engine.kind === 'failed' && (
        <p className="message message-error mic-error" role="alert">
          The speech model could not be loaded: {session.engine.message}{' '}
          <button type="button" className="mic-link" onClick={retry}>
            Try again
          </button>
        </p>
      )}
      {ready && session.mic.kind === 'failed' && (
        <p className="message message-error mic-error" role="alert">
          {session.mic.message}{' '}
          <button type="button" className="mic-link" onClick={retry}>
            Try again
          </button>
        </p>
      )}

      <Question voice={voice} />

      {(voice.heard || voice.note) && (
        <p className="mic-heard" role="status" data-testid="voice-heard">
          {voice.heard && (
            <span className="mic-heard-text">
              Heard “<q>{voice.heard}</q>”
            </span>
          )}
          {voice.note && <span className="mic-note">{voice.note}</span>}
        </p>
      )}
    </section>
  )
}

function MicButton({ session }: { session: VoiceSnapshot }) {
  const { engine, settings } = session
  if (engine.kind !== 'ready') {
    const busy = engine.kind === 'loading'
    return (
      <button
        type="button"
        className="mic-button"
        aria-label="Turn on voice input"
        title="Move by speaking"
        disabled={busy}
        onClick={turnOn}
      >
        <MicIcon />
      </button>
    )
  }
  if (settings.listening === 'always') {
    const on = !session.muted
    return (
      <button
        type="button"
        className={`mic-button${on ? ' mic-button-live' : ''}${session.hearing ? ' mic-button-hearing' : ''}`}
        aria-label={on ? 'Stop listening' : 'Start listening'}
        aria-pressed={on}
        title={on ? 'Listening: click to stop' : 'Click to listen again'}
        onClick={toggleMuted}
      >
        <MicIcon />
      </button>
    )
  }
  return (
    <button
      type="button"
      className={`mic-button${session.holding ? ' mic-button-hearing' : ''}`}
      aria-label="Hold to talk"
      aria-pressed={session.holding}
      title="Hold to talk (or hold the space bar)"
      onPointerDown={(e) => {
        if (e.button !== 0) return
        e.currentTarget.setPointerCapture(e.pointerId)
        press()
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onContextMenu={(e) => e.preventDefault()}
    >
      <MicIcon />
    </button>
  )
}

function stateText(session: VoiceSnapshot): string {
  const { engine, mic, settings } = session
  switch (engine.kind) {
    case 'off':
    case 'notice':
      return 'Voice moves'
    case 'loading':
      return `Loading speech model… ${Math.round(engine.share * 100)}%`
    case 'failed':
      return 'Voice is unavailable'
    case 'ready':
      break
  }
  if (mic.kind === 'opening' || mic.kind === 'closed') return 'Opening the microphone…'
  if (mic.kind === 'failed') return 'No microphone'
  if (session.transcribing) return 'Making it out…'
  if (settings.listening === 'push')
    return session.holding ? 'Listening…' : 'Hold Space and say a move'
  if (session.muted) return 'Not listening'
  if (session.paused) return 'Paused'
  return session.hearing ? 'Hearing you…' : 'Listening'
}

function Question({ voice }: { voice: VoiceView }) {
  const { question } = voice
  if (!question) return null
  if (question.kind === 'confirm') {
    return (
      <div className="mic-question" role="group" aria-label="Confirm">
        <span>{question.command === 'resign' ? 'Resign this game?' : 'Offer a draw?'}</span>
        <button type="button" className="mic-primary" onClick={() => voice.answer(true)}>
          Yes
        </button>
        <button type="button" onClick={() => voice.answer(false)}>
          No
        </button>
      </div>
    )
  }
  return (
    <div className="mic-question" role="group" aria-label="Which move">
      <span>{question.moves.length === 1 ? 'Did you mean' : 'Which one?'}</span>
      {question.moves.map((move, i) => (
        <button
          key={`${move.from}${move.to}${move.promotion ?? ''}`}
          type="button"
          onClick={() => voice.pick(move)}
        >
          {question.moves.length > 1 && <span className="mic-number">{i + 1}</span>}
          {move.san}
        </button>
      ))}
      <button type="button" className="mic-link" onClick={voice.dismiss}>
        Cancel
      </button>
    </div>
  )
}

/** The quick switch next to the mic button; the rest is in Settings → Voice. */
function VoiceSettingsPopover({ session }: { session: VoiceSnapshot }) {
  return (
    <div className="mic-popover" role="group" aria-label="Voice settings">
      <ListeningChoice />
      <div className="mic-popover-links">
        <Link to="/settings" search={{ tab: 'voice' }} className="mic-link">
          Microphone and more
        </Link>
        {session.settings.speakMoves && (
          <button type="button" className="mic-link" onClick={turnOff}>
            Turn voice input off
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * Holding the space bar talks, anywhere on the page but in a text field. It takes the space bar
 * from a focused button too (Enter still presses it), so a button clicked before can't be
 * pressed again by talking.
 */
function usePushToTalkKey(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return
    const typing = (target: EventTarget | null) =>
      target instanceof HTMLElement &&
      (target.isContentEditable || !!target.closest('input, textarea, select'))
    const down = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.metaKey || e.ctrlKey || e.altKey || typing(e.target)) return
      e.preventDefault()
      if (!e.repeat) press()
    }
    const up = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || typing(e.target)) return
      e.preventDefault()
      release()
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', release)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', release)
      release()
    }
  }, [enabled])
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" />
      <path
        d="M6 11a6 6 0 0 0 12 0M12 17v4M9 21h6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z M19.4 13a7.6 7.6 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7.4 7.4 0 0 0-1.7-1L15 3.5h-4l-.3 2.5a7.4 7.4 0 0 0-1.7 1l-2.4-1-2 3.4L4.6 11a7.6 7.6 0 0 0 0 2l-2 1.6 2 3.4 2.4-1c.5.4 1.1.8 1.7 1l.3 2.5h4l.3-2.5c.6-.2 1.2-.6 1.7-1l2.4 1 2-3.4Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  )
}
