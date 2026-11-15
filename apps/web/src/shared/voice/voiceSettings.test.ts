import { describe, expect, it } from 'vitest'
import { DEFAULT_VOICE_SETTINGS, parseVoiceSettings } from './voiceSettings'

describe('parseVoiceSettings', () => {
  it('reads moves aloud in bot games only, until told otherwise', () => {
    expect(parseVoiceSettings(null)).toEqual(DEFAULT_VOICE_SETTINGS)
    expect(DEFAULT_VOICE_SETTINGS).toMatchObject({
      botGames: true,
      localGames: false,
      analysis: false,
      ownMoves: false,
      coachComments: false,
    })
  })

  it('keeps what was stored', () => {
    const stored = {
      botGames: false,
      localGames: true,
      analysis: true,
      ownMoves: true,
      coachComments: true,
      voice: 'com.apple.voice.compact.en-GB.Daniel',
      rate: 1.4,
    }
    expect(parseVoiceSettings(stored)).toEqual(stored)
  })

  it('puts anything unknown back to the default', () => {
    expect(parseVoiceSettings({ botGames: 'yes', voice: '', rate: Number.NaN, extra: 1 })).toEqual(
      DEFAULT_VOICE_SETTINGS,
    )
    expect(parseVoiceSettings({ rate: 9 }).rate).toBe(2)
    expect(parseVoiceSettings({ rate: 0 }).rate).toBe(0.5)
  })
})
