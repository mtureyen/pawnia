import { Chessground } from 'chessground'
import type { Api } from 'chessground/api'
import 'chessground/assets/chessground.base.css'
import type { Config } from 'chessground/config'
import type { DrawShape } from 'chessground/draw'
import type { Key } from 'chessground/types'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Color, Move, SquareName } from '@pawnia/chess'
import { useBoardAppearance } from './appearanceStore'
import {
  COACH_BRUSHES,
  MARK_BRUSHES,
  coachBrush,
  markClasses,
  takeSquareMarks,
  type CoachColor,
  type DrawingColor,
  type MarkBrush,
} from './markings'
import './Board.css'
import { PromotionDialog } from './PromotionDialog'

export interface BoardProps {
  fen: string
  orientation: Color
  turnColor: Color
  /** Legal destinations for the side to move. Empty makes the board read-only. */
  dests: Map<SquareName, SquareName[]>
  lastMove?: [SquareName, SquareName]
  check: boolean
  isPromotion: (from: SquareName, to: SquareName) => boolean
  onMove: (move: Move) => void
  /** Arrows drawn by the app (engine suggestions). Separate from arrows the user draws. */
  arrows?: BoardArrow[]
  /** A small round badge in a square's corner, e.g. a move classification. */
  badge?: BoardBadge
  /** What the coach drew on this position: arrows and circled squares. */
  drawing?: BoardDrawing
  /** Shows or hides the coordinates on this board alone; without it, the user's setting holds. */
  coordinates?: boolean
  /** Hears a click or tap on any square, empty or not (e.g. "find the square"). */
  onSquare?: (square: SquareName) => void
  /** Squares the page colours in, e.g. a trainer's question and its answer. */
  highlights?: BoardHighlight[]
  /** Blindfold: the pieces are there and move, but aren't shown (squares and arrows still are). */
  blindfold?: boolean
}

export interface BoardHighlight {
  square: SquareName
  /** The square asked about; one answered right; one answered wrong. */
  tone: 'target' | 'right' | 'wrong'
}

export interface BoardDrawing {
  arrows: DrawnArrow[]
  squares: { square: string; color: CoachColor }[]
}

export interface DrawnArrow {
  from: string
  to: string
  color: DrawingColor
  /** The line's width; chessground's own is 12. */
  width?: number
  /** Drawn fainter: a later step, or one that matters less. */
  faint?: boolean
  /** A short text on the arrow, e.g. its place in a sequence. */
  label?: string
}

export interface BoardBadge {
  square: SquareName
  /** SVG markup for a 40×40 box centred on the origin. */
  svg: string
}

export interface BoardArrow {
  from: SquareName
  to: SquareName
  kind: 'best' | 'alternative'
}

/**
 * Thin React wrapper around chessground. chessground owns its DOM; React only pushes
 * config updates into it. The board knows no rules: legal moves come in via `dests`.
 */
export function Board(props: BoardProps) {
  const host = useRef<HTMLDivElement>(null)
  const api = useRef<Api | null>(null)
  const latest = useRef(props)
  const [promotion, setPromotion] = useState<{ from: SquareName; to: SquareName }>()
  const appearance = useBoardAppearance()
  const coordinates = props.coordinates ?? appearance.coordinates
  const coordinatesAtStart = useRef(coordinates)
  /** The user's coloured squares (right-click); their arrows live in chessground's shapes. */
  const marks = useRef(new Map<Key, MarkBrush>())

  useLayoutEffect(() => {
    latest.current = props
  })

  useEffect(() => {
    const onDrop = (orig: Key, dest: Key) => {
      const from = orig as SquareName
      const to = dest as SquareName
      if (latest.current.isPromotion(from, to)) setPromotion({ from, to })
      else latest.current.onMove({ from, to })
    }
    const showMarks = (next: Map<Key, MarkBrush>) => {
      marks.current = next
      api.current?.set({ highlight: { custom: customClasses(next, latest.current.highlights) } })
    }
    const cg = Chessground(host.current!, {
      ...toConfig(latest.current),
      // Drawn right the first time: a board without them shows none even for a moment.
      coordinates: coordinatesAtStart.current,
      animation: { duration: 180 },
      premovable: { enabled: false },
      highlight: {
        lastMove: true,
        check: true,
        custom: customClasses(new Map(), latest.current.highlights),
      },
      events: { select: (key) => latest.current.onSquare?.(key as SquareName) },
      drawable: {
        brushes: { ...MARK_BRUSHES, ...COACH_BRUSHES },
        // chessground draws a right-clicked square as a circle: colour the square instead.
        onChange: (shapes) => {
          const taken = takeSquareMarks(shapes, marks.current)
          if (!taken) return
          api.current?.setShapes(taken.arrows)
          showMarks(taken.marks)
        },
      },
      movable: {
        ...toConfig(latest.current).movable,
        free: false,
        showDests: true,
        events: { after: onDrop },
      },
    })
    api.current = cg
    // A left click clears the markings, as chessground does with the arrows.
    const element = host.current!
    const onPointerDown = (e: PointerEvent) => {
      if (e.button === 0 && marks.current.size > 0) showMarks(new Map())
    }
    element.addEventListener('pointerdown', onPointerDown)
    return () => {
      element.removeEventListener('pointerdown', onPointerDown)
      cg.destroy()
      api.current = null
    }
  }, [])

  // chessground draws coordinates (on by default) once; turning them off or on needs a redraw.
  useEffect(() => {
    const cg = api.current
    if (!cg || cg.state.coordinates === coordinates) return
    cg.set({ coordinates })
    cg.redrawAll()
  }, [coordinates])

  // Only push when board-relevant props change, so unrelated re-renders don't reset the board.
  const { fen, orientation, turnColor, dests, check } = props
  const lastMove = props.lastMove?.join('')
  const markedFen = useRef(fen)
  useEffect(() => {
    const cg = api.current
    if (!cg) return
    // A new position clears the markings; flipping the board keeps them.
    if (fen !== markedFen.current) {
      markedFen.current = fen
      marks.current = new Map()
      cg.set({
        ...toConfig(latest.current),
        highlight: { custom: customClasses(new Map(), latest.current.highlights) },
      })
    } else {
      cg.set({ ...toConfig(latest.current), drawable: { shapes: cg.state.drawable.shapes } })
    }
  }, [fen, orientation, turnColor, dests, check, lastMove])

  const highlightsKey = (props.highlights ?? []).map((h) => `${h.square}:${h.tone}`).join(',')
  useEffect(() => {
    api.current?.set({
      highlight: { custom: customClasses(marks.current, latest.current.highlights) },
    })
  }, [highlightsKey])

  const { badge, drawing } = props
  const shapesKey = [
    ...(props.arrows ?? []).map((a) => `${a.kind}:${a.from}${a.to}`),
    badge ? `badge:${badge.square}${badge.svg}` : '',
    ...(drawing?.arrows ?? []).map(
      (a) =>
        `coach:${a.from}${a.to}${a.color}${a.width ?? ''}${a.faint ? 'f' : ''}${a.label ?? ''}`,
    ),
    ...(drawing?.squares ?? []).map((s) => `coach:${s.square}${s.color}`),
  ].join(',')
  useEffect(() => {
    // setAutoShapes leaves the user's own drawings alone (cg.set with a fen would clear them).
    const { arrows = [], badge, drawing } = latest.current
    api.current?.setAutoShapes([
      ...arrows.map(toShape),
      ...(drawing ? coachShapes(drawing) : []),
      ...(badge ? [badgeShape(badge)] : []),
    ])
  }, [shapesKey])

  const cancelPromotion = () => {
    setPromotion(undefined)
    api.current?.set(toConfig(latest.current))
  }

  return (
    <div className={props.blindfold ? 'board board-blindfold' : 'board'}>
      <div ref={host} className="board-host" />
      {promotion && (
        <PromotionDialog
          color={props.turnColor}
          square={promotion.to}
          orientation={props.orientation}
          onPick={(role) => {
            setPromotion(undefined)
            props.onMove({ ...promotion, promotion: role })
          }}
          onCancel={cancelPromotion}
        />
      )}
    </div>
  )
}

/** The user's coloured squares, with the page's own highlights over them. */
function customClasses(
  marks: ReadonlyMap<Key, MarkBrush>,
  highlights: readonly BoardHighlight[] = [],
): Map<Key, string> {
  const classes = markClasses(marks)
  for (const { square, tone } of highlights) classes.set(square, `highlight-${tone}`)
  return classes
}

/** Drawn in a 100×100 box whose origin is the square's top-left corner; the badge sits top-right. */
function badgeShape({ square, svg }: BoardBadge): DrawShape {
  return { orig: square, customSvg: { html: `<g transform="translate(86 14)">${svg}</g>` } }
}

function coachShapes({ arrows, squares }: BoardDrawing): DrawShape[] {
  return [
    ...squares.map((s) => ({ orig: s.square as Key, brush: coachBrush(s.color) })),
    ...arrows.map((a) => ({
      orig: a.from as Key,
      dest: a.to as Key,
      brush: coachBrush(a.color, a.faint),
      ...(a.width !== undefined && { modifiers: { lineWidth: a.width } }),
      ...(a.label !== undefined && { label: { text: a.label } }),
    })),
  ]
}

function toShape(arrow: BoardArrow): DrawShape {
  return arrow.kind === 'best'
    ? { orig: arrow.from, dest: arrow.to, brush: 'paleBlue' }
    : { orig: arrow.from, dest: arrow.to, brush: 'paleGrey', modifiers: { lineWidth: 7 } }
}

function toConfig(props: BoardProps): Config {
  const canMove = props.dests.size > 0
  return {
    fen: props.fen,
    orientation: props.orientation,
    turnColor: props.turnColor,
    check: props.check,
    lastMove: props.lastMove,
    movable: {
      color: canMove ? props.turnColor : undefined,
      dests: props.dests as Map<Key, Key[]>,
    },
  }
}
