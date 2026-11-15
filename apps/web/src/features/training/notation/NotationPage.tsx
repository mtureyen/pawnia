import { useNavigate, useSearch } from '@tanstack/react-router'
import { useCallback, useState } from 'react'
import { TrainingTabs } from '../TrainingTabs'
import { CoordinateTrainer } from './CoordinateTrainer'
import { MoveTrainer } from './MoveTrainer'
import { NotationGuide } from './NotationGuide'
import { loadProgress, saveProgress, type NotationProgress, type UpdateProgress } from './progress'
import '@/shared/game/GamePanel.css'
import '@/features/stats/Stats.css'
import '../Training.css'
import './Notation.css'

/** What the trainer remembers, read once and written on every change. */
function useNotationProgress(): [NotationProgress, UpdateProgress] {
  const [progress, setProgress] = useState(loadProgress)
  const update = useCallback<UpdateProgress>((change) => {
    setProgress((before) => {
      const next = change(before)
      saveProgress(next)
      return next
    })
  }, [])
  return [progress, update]
}

/** /training/notation: learning to read and write the names of squares and moves. */
export function NotationPage() {
  const { part = 'coordinates' } = useSearch({ from: '/training/notation' })
  const [progress, update] = useNotationProgress()
  const navigate = useNavigate()
  return (
    <div className="stats-page notation-page">
      <TrainingTabs />
      <div className="notation-header">
        <h1>Notation</h1>
        <div className="stats-filters">
          <fieldset>
            <legend>Train</legend>
            {(['coordinates', 'moves'] as const).map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={part === p}
                onClick={() =>
                  void navigate({
                    to: '/training/notation',
                    search: p === 'moves' ? { part: p } : {},
                  })
                }
              >
                {p === 'coordinates' ? 'Coordinates' : 'Moves'}
              </button>
            ))}
          </fieldset>
        </div>
      </div>
      {part === 'coordinates' ? (
        <CoordinateTrainer progress={progress} update={update} />
      ) : (
        <MoveTrainer progress={progress} update={update} />
      )}
      <NotationGuide />
    </div>
  )
}
