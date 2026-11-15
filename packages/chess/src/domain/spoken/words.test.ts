import { describe, expect, it } from 'vitest'
import { cleanWords, slotsOf } from './words'

describe('cleanWords', () => {
  it.each([
    ['Knight to F3.', ['knight', 'to', 'f3']],
    ['E-4!', ['e', '4']],
    ['  e   four  ', ['e', 'four']],
    ["Bishop's c4", ['bishops', 'c4']],
    ["Let's play Nf3+", ['lets', 'play', 'nf3']],
    ['Qxf7#', ['qxf7']],
    ['e8=Q', ['e8=q']],
    ['O-O', ['castle', 'short']],
    ['0-0-0', ['castle', 'long']],
    ['O - O - O', ['castle', 'long']],
    ['zero zero', ['castle', 'short']],
    ['Oh, oh, oh.', ['castle', 'long']],
    ['castle king side', ['castle', 'kingside']],
    ['Queen-side castle', ['queenside', 'castle']],
    ['', []],
  ])('%j → %j', (transcript, words) => {
    expect(cleanWords(transcript)).toEqual(words)
  })

  it('leaves a single nought alone', () => {
    expect(cleanWords('oh e4')).toEqual(['oh', 'e4'])
  })
})

describe('slotsOf', () => {
  const tokens = (transcript: string) =>
    slotsOf(cleanWords(transcript)).map((slot) => slot.readings.map((r) => r.toks.join('')))

  it('splits written notation into one slot per letter', () => {
    expect(tokens('exd5')).toEqual([['e'], ['x'], ['d'], ['5']])
    expect(tokens('Nbd2')).toEqual([['N'], ['b', 'B'], ['d'], ['2']])
    expect(tokens('e8=Q')).toEqual([['e'], ['8'], ['='], ['Q']])
  })

  it('reads a written "b" before a rank as the file, otherwise as file or bishop', () => {
    expect(tokens('b4')).toEqual([['b'], ['4']])
    expect(tokens('bc4')).toEqual([['b', 'B'], ['c'], ['4']])
  })

  it('reads "to" as the connector for free and as rank 2 at a cost', () => {
    const [to] = slotsOf(['to'])
    expect(to!.skip).toBe(0)
    expect(to!.readings).toEqual([{ toks: ['2'], cost: 0.2 }])
  })

  it('takes a word one letter off a chess word for that word, at a cost', () => {
    expect(slotsOf(['kniht'])[0]!.readings).toEqual([{ toks: ['N'], cost: 0.38 }])
    expect(slotsOf(['casle'])[0]!.readings[0]!.toks).toEqual(['O'])
  })

  it('reads unknown words as nothing, at a cost', () => {
    expect(slotsOf(['banana'])).toEqual([{ word: 'banana', readings: [], skip: 0.4 }])
  })
})
