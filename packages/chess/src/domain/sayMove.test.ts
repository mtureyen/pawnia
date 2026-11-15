import { describe, expect, it } from 'vitest'
import { sayMove } from './sayMove'

describe('sayMove', () => {
  it.each([
    ['e4', 'e4'],
    ['Nf3', 'knight f3'],
    ['exd5', 'e takes d5'],
    ['Bxe5+', 'bishop takes e5, check'],
    ['O-O', 'castles kingside'],
    ['O-O-O', 'castles queenside'],
    ['O-O+', 'castles kingside, check'],
    ['e8=Q#', 'e8 promotes to queen, checkmate'],
    ['exf8=N+', 'e takes f8 promotes to knight, check'],
    ['Nbd2', 'knight b d2'],
    ['R1e3', 'rook 1 e3'],
    ['Qh4xe1#', 'queen h4 takes e1, checkmate'],
    ['Kxf2', 'king takes f2'],
  ])('says %s as "%s"', (san, words) => {
    expect(sayMove(san)).toBe(words)
  })

  it('writes the a-file so it is read as the letter, not the article', () => {
    expect(sayMove('a4')).toBe('A4')
    expect(sayMove('Rxa8+')).toBe('rook takes A8, check')
    expect(sayMove('Nab3')).toBe('knight A b3')
    // Opening the phrase, a lone "A" would be "uh"; "A." is the letter.
    expect(sayMove('axb5')).toBe('A. takes b5')
    expect(sayMove('bxa6')).toBe('b takes A6')
  })

  it('leaves annotations out', () => {
    expect(sayMove('Nxe5!?')).toBe('knight takes e5')
    expect(sayMove('Qh5??')).toBe('queen h5')
  })

  it('gives back what is not SAN', () => {
    expect(sayMove('e2e4')).toBe('e2e4')
    expect(sayMove('')).toBe('')
  })
})
