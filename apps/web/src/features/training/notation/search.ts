/** Which part of the notation trainer is open: the squares' names or the moves'. */
export type NotationPart = 'coordinates' | 'moves'

export function parseNotationSearch(search: Record<string, unknown>): { part?: NotationPart } {
  return search.part === 'moves' || search.part === 'coordinates' ? { part: search.part } : {}
}
