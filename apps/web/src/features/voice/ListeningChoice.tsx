import { useId } from 'react'
import { useVoiceSettings } from '@/shared/voice/voiceStore'
import { setListening } from './session'
import './Voice.css'

/**
 * Push to talk or always listening: next to the mic button and in Settings → Voice, where its
 * heading looks like the page's other field names (`inSettings`).
 */
export function ListeningChoice({ inSettings = false }: { inSettings?: boolean }) {
  const id = useId()
  const { listening } = useVoiceSettings()
  return (
    <fieldset className={`mic-modes${inSettings ? ' mic-modes-settings' : ''}`}>
      <legend className={inSettings ? 'settings-label' : undefined}>Listening</legend>
      <label>
        <input
          type="radio"
          name={`${id}-listening`}
          checked={listening === 'push'}
          onChange={() => setListening('push')}
        />
        <span>
          Push to talk
          <span className="mic-hint">Hold Space or the mic button while you speak.</span>
        </span>
      </label>
      <label>
        <input
          type="radio"
          name={`${id}-listening`}
          checked={listening === 'always'}
          onChange={() => setListening('always')}
        />
        <span>
          Always listening
          <span className="mic-hint">
            Acts on the moves and commands it hears; rests while the board reads aloud.
          </span>
        </span>
      </label>
    </fieldset>
  )
}
