const KEY = 'pawnia.voice-input'

/** How the microphone is used: while a key or button is held, or all the time. */
export type VoiceMode = 'push' | 'listen'

/** Voice input's settings, per browser. */
export interface VoiceSettings {
  /** Voice input is on: the model loads when a page with a board opens. */
  on: boolean
  mode: VoiceMode
  /** The microphone to use; undefined for the browser's default. */
  deviceId?: string
  /** The user has read the notice about the download once. */
  noticeSeen: boolean
}

const DEFAULTS: VoiceSettings = { on: false, mode: 'push', noticeSeen: false }

export function parseVoiceSettings(raw: unknown): VoiceSettings {
  if (!raw || typeof raw !== 'object') return DEFAULTS
  const value = raw as Record<string, unknown>
  return {
    on: value.on === true,
    mode: value.mode === 'listen' ? 'listen' : 'push',
    ...(typeof value.deviceId === 'string' && value.deviceId && { deviceId: value.deviceId }),
    noticeSeen: value.noticeSeen === true,
  }
}

export function loadVoiceSettings(): VoiceSettings {
  try {
    return parseVoiceSettings(JSON.parse(localStorage.getItem(KEY) ?? 'null'))
  } catch {
    return DEFAULTS
  }
}

export function saveVoiceSettings(settings: VoiceSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings))
  } catch {
    // Storage blocked (private mode): the choice still holds until the page is reloaded.
  }
}
