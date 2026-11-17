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

  it('leaves the microphone alone until told otherwise: no download, push to talk', () => {
    expect(DEFAULT_VOICE_SETTINGS).toMatchObject({
      speakMoves: false,
      speechModelAccepted: false,
      listening: 'push',
      microphone: null,
    })
  })

  it('never asks the coach about a move until told to', () => {
    expect(DEFAULT_VOICE_SETTINGS.askCoach).toBe(false)
    expect(parseVoiceSettings({ askCoach: 'yes' }).askCoach).toBe(false)
  })

  it('shows the pieces until blindfold is chosen', () => {
    expect(DEFAULT_VOICE_SETTINGS.blindfold).toBe(false)
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
      speakMoves: true,
      speechModelAccepted: true,
      listening: 'always',
      microphone: 'a1b2c3',
      askCoach: true,
      blindfold: true,
    }
    expect(parseVoiceSettings(stored)).toEqual(stored)
  })

  it('loads what was stored before the microphone had settings, with its defaults', () => {
    const before = { botGames: false, localGames: true, voice: 'test-daniel', rate: 1.2 }
    expect(parseVoiceSettings(before)).toEqual({
      ...DEFAULT_VOICE_SETTINGS,
      ...before,
      speakMoves: false,
      listening: 'push',
      microphone: null,
    })
  })

  it('puts anything unknown back to the default', () => {
    expect(parseVoiceSettings({ botGames: 'yes', voice: '', rate: Number.NaN, extra: 1 })).toEqual(
      DEFAULT_VOICE_SETTINGS,
    )
    expect(parseVoiceSettings({ speakMoves: 1, listening: 'sometimes', microphone: '' })).toEqual(
      DEFAULT_VOICE_SETTINGS,
    )
    expect(parseVoiceSettings({ rate: 9 }).rate).toBe(2)
    expect(parseVoiceSettings({ rate: 0 }).rate).toBe(0.5)
  })
})
