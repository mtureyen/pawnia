/**
 * What Whisper wrote, made fit for reading as a move: its notes on non-speech ("[BLANK_AUDIO]",
 * "(coughs)", "♪") removed, and a phrase it got stuck repeating ("4, 4, 4, 4, …", which it writes
 * for sounds it can't make out) dropped altogether.
 */
export function cleanTranscript(text: string): string {
  const words = text
    .replace(/\[[^\]]*\]|\([^)]*\)|\*[^*]*\*|[♪♫]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (stuck(words)) return ''
  return words
}

/**
 * The same word five times in a row, or the same two or three words three times ("knight d4,
 * knight d4, knight d4"): nobody says a move like that.
 */
function stuck(text: string): boolean {
  const words = text
    .toLowerCase()
    .split(/[\s,.]+/)
    .filter(Boolean)
  for (const [size, times] of [
    [1, 5],
    [2, 3],
    [3, 3],
  ] as const) {
    for (let start = 0; start + size * times <= words.length; start++) {
      const gram = words.slice(start, start + size).join(' ')
      let repeats = 1
      while (
        repeats < times &&
        words.slice(start + repeats * size, start + (repeats + 1) * size).join(' ') === gram
      )
        repeats++
      if (repeats >= times) return true
    }
  }
  return false
}
