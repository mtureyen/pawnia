import { useCallback, useState } from 'react'
import { TrainingTabs } from '../TrainingTabs'
import { CoordinateTrainer } from './CoordinateTrainer'
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
  const [progress, update] = useNotationProgress()
  return (
    <div className="stats-page notation-page">
      <TrainingTabs />
      <div className="notation-header">
        <h1>Notation</h1>
      </div>
      <CoordinateTrainer progress={progress} update={update} />
      <NotationGuide />
    </div>
  )
}
