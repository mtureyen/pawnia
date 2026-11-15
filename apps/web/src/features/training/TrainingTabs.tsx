import { Link } from '@tanstack/react-router'
import { useRepertoire } from './repertoire/progress'

/**
 * The kinds of training: the user's mistakes as puzzles, their openings, openings to study, and
 * reading and writing chess notation.
 */
export function TrainingTabs() {
  const due = (useRepertoire().data ?? []).filter((line) => line.due).length
  return (
    <nav className="training-tabs" aria-label="Training">
      <Link to="/training" activeOptions={{ exact: true }} activeProps={{ 'aria-current': 'page' }}>
        My mistakes
      </Link>
      <Link to="/training/openings" search={{}} activeProps={{ 'aria-current': 'page' }}>
        My openings
      </Link>
      <Link to="/training/library" search={{}} activeProps={{ 'aria-current': 'page' }}>
        Opening library
      </Link>
      <Link to="/training/repertoire" activeProps={{ 'aria-current': 'page' }}>
        My repertoire
        {due > 0 && (
          <span className="training-due" title={`${due} ${due === 1 ? 'line' : 'lines'} to review`}>
            {due}
          </span>
        )}
      </Link>
      <Link to="/training/notation" search={{}} activeProps={{ 'aria-current': 'page' }}>
        Notation
      </Link>
    </nav>
  )
}
