/** 2D point in world space */
export interface Point {
  x: number
  y: number
}

export type StrokeDash = 'solid' | 'dashed' | 'dotted'

/** Stroke / fill styling for drawable elements */
export interface ElementStyle {
  stroke: string
  /** CSS color or 'transparent' for no fill */
  fill: string
  strokeWidth: number
  /** 0–1 */
  opacity: number
  strokeDash: StrokeDash
}

export type ElementType =
  | 'path'
  | 'rectangle'
  | 'ellipse'
  | 'line'
  | 'arrow'
  | 'text'
  | 'image'

/** Which edge of a box-like shape an endpoint sits on (ellipse manual uses `t` as angle/2π only). */
export type ConnectorEdgeSide = 'n' | 'e' | 's' | 'w'

export interface BaseElement {
  id: string
  type: ElementType
  version: number
  /** Shared id: elements with the same `groupId` select and move together. */
  groupId?: string
}

/** Freehand stroke as a polyline in world coordinates */
export interface PathElement extends BaseElement {
  type: 'path'
  points: Point[]
  style: ElementStyle
}

export interface RectangleElement extends BaseElement {
  type: 'rectangle'
  x: number
  y: number
  width: number
  height: number
  style: ElementStyle
}

export interface EllipseElement extends BaseElement {
  type: 'ellipse'
  x: number
  y: number
  width: number
  height: number
  style: ElementStyle
}

export interface LineElement extends BaseElement {
  type: 'line'
  x1: number
  y1: number
  x2: number
  y2: number
  style: ElementStyle
}

export interface ArrowElement extends BaseElement {
  type: 'arrow'
  /** Free arrow: segment (x1,y1)→(x2,y2). Ignored when `sourceId` + `targetId` are set. */
  x1: number
  y1: number
  x2: number
  y2: number
  style: ElementStyle
  /** Attached arrow: anchors on shapes; smooth quadratic uses `bendOffset` from chord mid. */
  sourceId?: string
  targetId?: string
  sourceManual?: boolean
  sourceSide?: ConnectorEdgeSide
  sourceT?: number
  targetManual?: boolean
  targetSide?: ConnectorEdgeSide
  targetT?: number
  bendOffsetX?: number
  bendOffsetY?: number
  label?: string
}

export type TextAlign = 'left' | 'center' | 'right'

/** Multi-line label; coordinates are top-left of the layout box in world space. */
export interface TextElement extends BaseElement {
  type: 'text'
  x: number
  y: number
  /** Minimum / wrapping width in world units; actual bounds use measured width. */
  width: number
  height: number
  text: string
  fontSize: number
  fontFamily: string
  /** Fill colour of glyphs */
  color: string
  /** Outline colour (used when `strokeWidth` > 0). */
  strokeColor: string
  /** Outline width in world units; 0 = no outline */
  strokeWidth: number
  textAlign: TextAlign
  /** 0–1 */
  opacity: number
}

/** Raster image in world space; `style.opacity` controls alpha (stroke/fill are unused for drawing). */
export interface ImageElement extends BaseElement {
  type: 'image'
  x: number
  y: number
  width: number
  height: number
  /** Data URL or same-origin URL */
  src: string
  /** width ÷ height of the bitmap; corner resize keeps this ratio. */
  aspectRatio: number
  style: ElementStyle
}

/** Keys from `ElementStyle` plus typography for text; used by the style panel + `setSelectedStyle`. */
export type SelectionStylePatch = Partial<ElementStyle> & {
  fontFamily?: string
  fontSize?: number
  textAlign?: TextAlign
}

export type Element =
  | PathElement
  | RectangleElement
  | EllipseElement
  | LineElement
  | ArrowElement
  | TextElement
  | ImageElement

export type ToolName =
  | 'pen'
  | 'select'
  | 'eraser'
  | 'rectangle'
  | 'ellipse'
  | 'line'
  | 'arrow'
  | 'text'
  | 'image'
  | 'laser'

/** Shape tools — order matches `ToolManager` shape tool array. */
export const SHAPE_TOOL_NAMES = ['rectangle', 'ellipse', 'line', 'arrow'] as const
export type ShapeToolName = (typeof SHAPE_TOOL_NAMES)[number]

/** Pen + shapes: crosshair cursor while drawing. */
export const TOOLS_WITH_CROSSHAIR: ReadonlySet<ToolName> = new Set([
  'pen',
  'rectangle',
  'ellipse',
  'line',
  'arrow',
])

export interface PenOptions {
  color: string
  strokeWidth: number
  /** CSS color or 'transparent' for no fill */
  fill: string
  /** 0–1 */
  opacity: number
  strokeDash: StrokeDash
  /** Defaults for the next placed text box */
  textFontFamily: string
  textFontSize: number
  textAlign: TextAlign
  textStrokeColor: string
  /** Outline width for new text (0 = none) */
  textStrokeWidth: number
}

export interface ViewportState {
  offsetX: number
  offsetY: number
  zoom: number
}

/** How the background grid is drawn when `gridEnabled` is true. */
export type GridStyle = 'lines' | 'dots'

export type CollaborationChangeHandler = (
  operations: readonly import('./collaboration/operations.js').SceneOperation[],
) => void
export type PresenceChangeHandler = (
  peers: ReadonlyMap<string, import('./collaboration/presence.js').PresencePeer>,
) => void

export interface BembeyazOptions {
  container: HTMLElement
  /**
   * Host for the floating text editor layer (defaults to the canvas container).
   * Use the app shell (e.g. `.bbz-wrap`) so the textarea stacks above the dock.
   */
  textOverlayParent?: HTMLElement
  /** CSS color */
  backgroundColor?: string
  /** When true (default), draws the background grid using {@link gridStyle}. */
  gridEnabled?: boolean
  /** `lines` (default) or `dots`. Ignored when the grid is hidden. */
  gridStyle?: GridStyle
  /** Max undo steps; set to 0 to disable undo/redo. Default 100. */
  historyDepth?: number
  /**
   * Batched operation log for local edits (e.g. persist to Postgres or broadcast via Supabase Realtime).
   * Flushed once per microtask so rapid updates coalesce into one array.
   */
  onChange?: CollaborationChangeHandler
  /** Stable id for {@link BembeyazEventMap} `presence:change` local peer (defaults to a random id). */
  localUserId?: string
}

export interface SerializedScene {
  version: 1
  elements: Element[]
  viewport: ViewportState
}

export type SceneChangeHandler = (elements: readonly Element[]) => void
export type SelectionChangeHandler = (ids: readonly string[]) => void
export type ViewportChangeHandler = (viewport: ViewportState) => void
export type ToolChangeHandler = (tool: ToolName) => void
export type StyleChangeHandler = (style: ElementStyle) => void

export interface BembeyazEventMap {
  'scene:change': SceneChangeHandler
  'selection:change': SelectionChangeHandler
  'viewport:change': ViewportChangeHandler
  'tool:change': ToolChangeHandler
  'style:change': StyleChangeHandler
  /** Local + remote presence entries (cursors, colors); drive from your sync layer. */
  'presence:change': PresenceChangeHandler
}

export type BembeyazEventName = keyof BembeyazEventMap
