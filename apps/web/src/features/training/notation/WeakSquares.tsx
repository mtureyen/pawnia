import type { Color, SquareName } from '@pawnia/chess'
import type { CSSProperties } from 'react'
import type { NotationProgress } from './progress'
import { FILES, RANKS, weakestSquares, weakness, type AnswerStat } from './squares'

/**
 * The squares the user gets wrong or slowly, per side: a small board coloured by weakness and the
 * weakest few in words. These are the squares the trainer asks more often.
 */
export function WeakSquares({
  progress,
  onForget,
}: {
  progress: NotationProgress
  onForget: () => void
}) {
  const sides = (['white', 'black'] as const).filter(
    (side) => Object.keys(progress.squares[side]).length > 0,
  )
  return (
    <section className="stats-section notation-weak" aria-label="Your weak squares">
      <h2>Your weak squares</h2>
      {sides.length === 0 ? (
        <p className="stats-note">
          Nothing yet. As you answer, the squares you miss or take long over show up here, and the
          trainer asks them more often.
        </p>
      ) : (
        <>
          <p className="stats-note">
            Red: missed lately or slow to find. These come back more often until you know them.
          </p>
          <div className="notation-heatmaps">
            {sides.map((side) => (
              <HeatMap key={side} side={side} stats={progress.squares[side]} />
            ))}
          </div>
          <button type="button" className="notation-link" onClick={onForget}>
            Forget these stats
          </button>
        </>
      )}
    </section>
  )
}

function HeatMap({ side, stats }: { side: Color; stats: Partial<Record<SquareName, AnswerStat>> }) {
  const rows = side === 'white' ? [...RANKS].reverse() : [...RANKS]
  const cols = side === 'white' ? [...FILES] : [...FILES].reverse()
  const weakest = weakestSquares(stats)
  const label = side === 'white' ? 'From White’s side' : 'From Black’s side'
  return (
    <figure className="notation-heatmap">
      <figcaption>{label}</figcaption>
      <div className="notation-heatmap-board" aria-hidden="true">
        {rows.flatMap((rank) =>
          cols.map((file) => {
            const square = `${file}${rank}` as SquareName
            const stat = stats[square]
            const light = (FILES.indexOf(file) + Number(rank)) % 2 === 0
            return (
              <span
                key={square}
                className={`notation-heat-cell${light ? ' light' : ''}`}
                style={{ '--heat': stat ? weakness(stat) : 0 } as CSSProperties}
                title={stat ? statText(square, stat) : `${square}: not asked yet`}
              >
                {square}
              </span>
            )
          }),
        )}
      </div>
      <p className="notation-weakest">
        {weakest.length === 0
          ? 'No weak squares here right now.'
          : `Weakest: ${weakest.map((w) => statText(w.square, w.stat)).join('; ')}.`}
      </p>
    </figure>
  )
}

/** "f6: missed 2 of 5, 2.4 s" */
function statText(square: SquareName, stat: AnswerStat): string {
  const time = stat.ms > 0 ? `, ${(stat.ms / 1000).toFixed(1)} s` : ''
  return `${square}: missed ${stat.missed} of ${stat.seen}${time}`
}
