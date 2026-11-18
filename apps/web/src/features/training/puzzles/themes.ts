/**
 * lichess' theme keys ("hangingPiece", "mateIn2") as words for the page ("Hanging piece", "Mate
 * in 2"). Most read right by splitting the key; the rest are named here.
 */
const NAMED: Record<string, string> = {
  attackingF2F7: 'Attacking f2 or f7',
  xRayAttack: 'X-ray attack',
  superGM: 'Super GM game',
  masterVsMaster: 'Master vs master game',
  master: 'Master game',
  oneMove: 'One move',
  short: 'Short (2 moves)',
  long: 'Long (3 moves)',
  veryLong: 'Very long (4+ moves)',
  crushing: 'Wins decisively',
  advantage: 'Wins an advantage',
  equality: 'Saves the game',
  mate: 'Checkmate',
}

export function themeName(key: string): string {
  const named = NAMED[key]
  if (named) return named
  const words = key
    .replace(/([a-z])([A-Z0-9])/g, '$1 $2')
    .replace(/([0-9])([A-Za-z])/g, '$1 $2')
    .toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** Themes that tell how long or how deep a puzzle is, or where it is from: said last. */
const ABOUT = new Set([
  'oneMove',
  'short',
  'long',
  'veryLong',
  'opening',
  'middlegame',
  'endgame',
  'master',
  'masterVsMaster',
  'superGM',
  'crushing',
  'advantage',
  'equality',
])

/**
 * The motifs first (what to learn from it), then the rest. "Checkmate" goes where a mate in so
 * many moves says it already.
 */
export function orderedThemes(themes: readonly string[]): string[] {
  const shown = themes.some((t) => /^mateIn\d$/.test(t))
    ? themes.filter((t) => t !== 'mate')
    : themes
  return [...shown.filter((t) => !ABOUT.has(t)), ...shown.filter((t) => ABOUT.has(t))]
}
