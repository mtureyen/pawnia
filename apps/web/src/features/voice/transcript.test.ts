import { describe, expect, it } from 'vitest'
import { cleanTranscript } from './transcript'

describe('cleanTranscript', () => {
  it.each([
    [' Knight f3. ', 'Knight f3.'],
    ['[BLANK_AUDIO]', ''],
    ['(coughs) e4', 'e4'],
    ['♪ ♪', ''],
    ['*clears throat* castle', 'castle'],
    ['1, 2, 3, 4, 4, 4, 4, 4, 4, 4, 4', ''],
    ['1.1.1.1.1.1.1.1.', ''],
    ['knight f3, knight d4, knight d4, knight d4, knight d4', ''],
    ['rook a d1', 'rook a d1'],
    ['e4 e5 e4', 'e4 e5 e4'],
  ])('%j → %j', (text, cleaned) => {
    expect(cleanTranscript(text)).toBe(cleaned)
  })
})
