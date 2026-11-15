/** What of a browser voice the app uses; `SpeechSynthesisVoice` has these fields. */
export interface VoiceInfo {
  voiceURI: string
  name: string
  lang: string
  default: boolean
}

export const isEnglish = (voice: VoiceInfo) => /^en\b/i.test(voice.lang.replace('_', '-'))

/** The voices as the settings list them: English ones first, each group by name. */
export function sortVoices<T extends VoiceInfo>(voices: readonly T[]): T[] {
  return [...voices].sort(
    (a, b) => Number(isEnglish(b)) - Number(isEnglish(a)) || a.name.localeCompare(b.name),
  )
}

/**
 * The voice to speak with: the chosen one while the browser has it, else an English one, the
 * browser's default if that is English, then one in the user's own English (en-GB for a British
 * browser), then American English. Undefined when there is no English voice: the browser then
 * picks one for the utterance's language.
 */
export function pickVoice<T extends VoiceInfo>(
  voices: readonly T[],
  chosen: string | null,
  languages: readonly string[] = [],
): T | undefined {
  const picked = chosen ? voices.find((v) => v.voiceURI === chosen) : undefined
  if (picked) return picked
  const english = voices.filter(isEnglish)
  const lang = (v: T) => v.lang.replace('_', '-').toLowerCase()
  const own = languages.map((l) => l.toLowerCase()).filter((l) => l.startsWith('en-'))
  return (
    english.find((v) => v.default) ??
    own.map((l) => english.find((v) => lang(v) === l)).find(Boolean) ??
    english.find((v) => lang(v) === 'en-us') ??
    english[0]
  )
}
