import { useSyncExternalStore } from 'react'
import { speaker } from './speech'
import { parseVoiceSettings, type VoiceSettings } from './voiceSettings'

const KEY = 'pawnia.voice'

/** The voice settings, kept in localStorage like the board's appearance. */
let current = load()
const listeners = new Set<() => void>()

function load(): VoiceSettings {
  try {
    return parseVoiceSettings(JSON.parse(localStorage.getItem(KEY) ?? 'null'))
  } catch {
    return parseVoiceSettings(null)
  }
}

export function voiceSettings(): VoiceSettings {
  return current
}

export function setVoiceSettings(change: Partial<VoiceSettings>): void {
  current = parseVoiceSettings({ ...current, ...change })
  try {
    localStorage.setItem(KEY, JSON.stringify(current))
  } catch {
    // Storage blocked (private mode): the choice still holds until the page is reloaded.
  }
  for (const listener of listeners) listener()
}

export function useVoiceSettings(): VoiceSettings {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => current,
  )
}

/** Says `text` with the chosen voice and speed. */
export function readAloud(text: string, { queue = false }: { queue?: boolean } = {}): void {
  speaker.speak(text, { voice: current.voice, rate: current.rate, queue })
}

/** Whether the board is speaking right now, for a component that should wait for it. */
export function useSpeaking(): boolean {
  return useSyncExternalStore(
    (listener) => speaker.onSpeakingChange(listener),
    () => speaker.speaking,
  )
}

/** The browser's voices, English ones first; empty until the browser has loaded them. */
export function useVoices(): SpeechSynthesisVoice[] {
  return useSyncExternalStore(
    (listener) => speaker.onVoicesChange(listener),
    () => speaker.voices(),
  )
}
