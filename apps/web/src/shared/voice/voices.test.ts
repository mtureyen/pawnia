import { describe, expect, it } from 'vitest'
import { pickVoice, sortVoices, type VoiceInfo } from './voices'

const voice = (name: string, lang: string, isDefault = false): VoiceInfo => ({
  voiceURI: `uri:${name}`,
  name,
  lang,
  default: isDefault,
})

const anna = voice('Anna', 'de-DE', true)
const daniel = voice('Daniel', 'en-GB')
const samantha = voice('Samantha', 'en-US')
const karen = voice('Karen', 'en_AU')
const amelie = voice('Amélie', 'fr-CA')

describe('sortVoices', () => {
  it('lists English voices first, each group by name', () => {
    expect(sortVoices([anna, samantha, amelie, daniel, karen]).map((v) => v.name)).toEqual([
      'Daniel',
      'Karen',
      'Samantha',
      'Amélie',
      'Anna',
    ])
  })
})

describe('pickVoice', () => {
  const all = [anna, daniel, samantha, karen, amelie]

  it('takes the chosen voice while the browser has it', () => {
    expect(pickVoice(all, 'uri:Karen')).toBe(karen)
    expect(pickVoice(all, 'uri:Gone')).toBe(samantha)
  })

  it('takes the default voice only when it is English', () => {
    expect(pickVoice(all, null)).toBe(samantha)
    expect(pickVoice([anna, daniel, voice('Fred', 'en-US', true)], null)?.name).toBe('Fred')
  })

  it("prefers the user's own English", () => {
    expect(pickVoice(all, null, ['de-DE', 'en-GB'])).toBe(daniel)
    expect(pickVoice(all, null, ['en-AU'])).toBe(karen)
  })

  it('falls back to any English voice, or none', () => {
    expect(pickVoice([anna, karen], null)).toBe(karen)
    expect(pickVoice([anna, amelie], null)).toBeUndefined()
  })
})
