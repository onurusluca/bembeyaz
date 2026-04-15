import type { CanvasPair, Viewport } from '../canvas/canvas.js'
import {
  anchorTowardPoint,
  getAttachedArrowBounds,
  isAttachedArrow,
  resolveAttachedArrow,
} from '../scene/connectorGeometry.js'
import { getElementBounds, SELECTION_PADDING } from '../scene/elements.js'
import { RESIZE_HANDLE_WORLD } from '../scene/selection.js'
import type { Scene } from '../scene/Scene.js'
import { TEXT_LINE_HEIGHT_FACTOR } from '../utils/textMeasure.js'
import type { AABB } from '../utils/math.js'
import { normalizeTextElement } from '../scene/elements.js'
import type {
  ArrowElement,
  Element,
  ElementStyle,
  GridStyle,
  ImageElement,
  PathElement,
  Point,
  StrokeDash,
  TextElement,
} from '../types.js'
import type { PresencePeer } from '../collaboration/presence.js'
import type { LaserPoint, LaserSegment } from '../tools/LaserTool.js'
import { LASER_MAX_LENGTH, LASER_AFTER_FADE_MS } from '../tools/LaserTool.js'

function noDash(ctx: CanvasRenderingContext2D): void {
  ctx.setLineDash([])
}

/** Dash lengths are in world units; canvas expects `[on/zoom, off/zoom]` at current scale. */
function worldDash(ctx: CanvasRenderingContext2D, zoom: number, on: number, off: number): void {
  ctx.setLineDash([on / zoom, off / zoom])
}

function applyLineDash(
  ctx: CanvasRenderingContext2D,
  dash: StrokeDash,
  zoom: number,
  strokeWidth = 2,
): void {
  const m = Math.max(1, strokeWidth * 0.5)
  if (dash === 'dashed') {
    worldDash(ctx, zoom, 10 * m, 6 * m)
  } else if (dash === 'dotted') {
    const dot = Math.max(2, strokeWidth * 0.85)
    const gap = Math.max(5, strokeWidth * 2.2)
    worldDash(ctx, zoom, dot, gap)
    ctx.lineCap = 'round'
  } else {
    noDash(ctx)
  }
}

export function clearCanvas(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, canvas.width, canvas.height)
}

export function fillBackground(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  _dpr: number,
  color: string,
): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.fillStyle = color
  ctx.fillRect(0, 0, canvas.width, canvas.height)
}

/** Apply world-space transform (after DPR) */
export function applyWorldTransform(
  ctx: CanvasRenderingContext2D,
  dpr: number,
  viewport: Viewport,
): void {
  ctx.setTransform(dpr * viewport.zoom, 0, 0, dpr * viewport.zoom, dpr * viewport.offsetX, dpr * viewport.offsetY)
}

export function renderPathElement(ctx: CanvasRenderingContext2D, el: PathElement, zoom = 1): void {
  const pts = el.points
  if (pts.length === 0) return
  ctx.save()
  ctx.globalAlpha = el.style.opacity
  ctx.strokeStyle = el.style.stroke
  ctx.lineWidth = el.style.strokeWidth
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  applyLineDash(ctx, el.style.strokeDash ?? 'solid', zoom, el.style.strokeWidth)
  ctx.beginPath()
  if (pts.length === 1) {
    ctx.moveTo(pts[0]!.x, pts[0]!.y)
    ctx.lineTo(pts[0]!.x + 0.001, pts[0]!.y)
  } else {
    ctx.moveTo(pts[0]!.x, pts[0]!.y)
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i]!.x, pts[i]!.y)
    }
  }
  ctx.stroke()
  ctx.restore()
}

export function renderTextElement(ctx: CanvasRenderingContext2D, el: TextElement): void {
  const t = normalizeTextElement(el)
  ctx.save()
  ctx.globalAlpha = t.opacity
  ctx.beginPath()
  ctx.rect(t.x, t.y, t.width, t.height)
  ctx.clip()
  ctx.font = `${t.fontSize}px ${t.fontFamily}`
  ctx.textBaseline = 'top'
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  const lines = t.text.length ? t.text.split('\n') : ['']
  const lineHeight = t.fontSize * TEXT_LINE_HEIGHT_FACTOR
  let y = t.y
  for (const line of lines) {
    const w = ctx.measureText(line).width
    let x = t.x
    if (t.textAlign === 'center') x = t.x + (t.width - w) / 2
    else if (t.textAlign === 'right') x = t.x + t.width - w
    ctx.fillStyle = t.color
    ctx.fillText(line, x, y)
    y += lineHeight
  }
  ctx.restore()
}

const imageElementCache = new Map<string, HTMLImageElement>()

export function renderImageElement(
  ctx: CanvasRenderingContext2D,
  el: ImageElement,
  onDecoded?: () => void,
): void {
  let img = imageElementCache.get(el.src)
  if (!img) {
    img = new Image()
    imageElementCache.set(el.src, img)
    img.onload = () => onDecoded?.()
    img.onerror = () => onDecoded?.()
    img.src = el.src
  } else if (!img.complete || !img.naturalWidth) {
    const fire = () => onDecoded?.()
    img.addEventListener('load', fire, { once: true })
    img.addEventListener('error', fire, { once: true })
  }

  ctx.save()
  ctx.globalAlpha = el.style.opacity
  if (img.complete && img.naturalWidth) {
    try {
      ctx.drawImage(img, el.x, el.y, el.width, el.height)
    } catch {
      drawImagePlaceholder(ctx, el)
    }
  } else {
    drawImagePlaceholder(ctx, el)
  }
  ctx.restore()
}

function drawImagePlaceholder(ctx: CanvasRenderingContext2D, el: ImageElement): void {
  ctx.fillStyle = 'rgba(148,163,184,0.22)'
  ctx.fillRect(el.x, el.y, el.width, el.height)
  ctx.strokeStyle = 'rgba(100,116,139,0.45)'
  ctx.lineWidth = 1
  ctx.strokeRect(el.x, el.y, el.width, el.height)
}

export function renderAttachedArrowElement(
  ctx: CanvasRenderingContext2D,
  el: ArrowElement,
  scene: Scene,
  zoom = 1,
): void {
  const r = resolveAttachedArrow(scene, el)
  if (!r) return
  const p0 = r.start
  const p1 = r.control
  const p2 = r.end
  ctx.save()
  ctx.globalAlpha = el.style.opacity
  ctx.strokeStyle = el.style.stroke
  ctx.lineWidth = el.style.strokeWidth
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  applyLineDash(ctx, el.style.strokeDash ?? 'solid', zoom, el.style.strokeWidth)
  ctx.beginPath()
  ctx.moveTo(p0.x, p0.y)
  ctx.quadraticCurveTo(p1.x, p1.y, p2.x, p2.y)
  ctx.stroke()
  noDash(ctx)
  drawArrowHead(ctx, p1.x, p1.y, p2.x, p2.y, 12, 0.55)
  ctx.restore()

  const label = (el.label ?? '').trim()
  if (label.length > 0) {
    const lp = r.labelPoint
    ctx.save()
    ctx.font = `14px Inter, system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const w = ctx.measureText(label).width
    const padX = 6
    const padY = 3
    const bw = w + padX * 2
    const bh = 14 + padY * 2
    ctx.fillStyle = 'rgba(255,255,255,0.92)'
    ctx.strokeStyle = 'rgba(0,0,0,0.08)'
    ctx.lineWidth = 1 / zoom
    const lx = lp.x - bw / 2
    const ly = lp.y - bh / 2
    ctx.beginPath()
    const rr = 4
    ctx.moveTo(lx + rr, ly)
    ctx.lineTo(lx + bw - rr, ly)
    ctx.quadraticCurveTo(lx + bw, ly, lx + bw, ly + rr)
    ctx.lineTo(lx + bw, ly + bh - rr)
    ctx.quadraticCurveTo(lx + bw, ly + bh, lx + bw - rr, ly + bh)
    ctx.lineTo(lx + rr, ly + bh)
    ctx.quadraticCurveTo(lx, ly + bh, lx, ly + bh - rr)
    ctx.lineTo(lx, ly + rr)
    ctx.quadraticCurveTo(lx, ly, lx + rr, ly)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = el.style.stroke
    ctx.fillText(label, lp.x, lp.y)
    ctx.restore()
  }
}

export function renderShapeElement(
  ctx: CanvasRenderingContext2D,
  el: Exclude<Element, PathElement | TextElement | ImageElement>,
  zoom = 1,
): void {
  const hasFill = el.style.fill && el.style.fill !== 'transparent'
  ctx.save()
  ctx.globalAlpha = el.style.opacity
  ctx.strokeStyle = el.style.stroke
  ctx.lineWidth = el.style.strokeWidth
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  applyLineDash(ctx, el.style.strokeDash ?? 'solid', zoom, el.style.strokeWidth)
  if (el.type === 'rectangle') {
    if (hasFill) {
      ctx.fillStyle = el.style.fill
      ctx.fillRect(el.x, el.y, el.width, el.height)
    }
    ctx.strokeRect(el.x, el.y, el.width, el.height)
  } else if (el.type === 'ellipse') {
    const cx = el.x + el.width / 2
    const cy = el.y + el.height / 2
    ctx.beginPath()
    ctx.ellipse(cx, cy, Math.abs(el.width / 2), Math.abs(el.height / 2), 0, 0, Math.PI * 2)
    if (hasFill) {
      ctx.fillStyle = el.style.fill
      ctx.fill()
    }
    ctx.stroke()
  } else if (el.type === 'line' || el.type === 'arrow') {
    ctx.beginPath()
    ctx.moveTo(el.x1, el.y1)
    ctx.lineTo(el.x2, el.y2)
    ctx.stroke()
    if (el.type === 'arrow') {
      noDash(ctx)
      drawArrowHead(ctx, el.x1, el.y1, el.x2, el.y2, 12, 0.55)
    }
  }
  ctx.restore()
}

export interface PenPreviewStyle {
  stroke: string
  strokeWidth: number
  strokeDash: StrokeDash
  opacity: number
}

export function renderPathPreview(
  ctx: CanvasRenderingContext2D,
  points: readonly { x: number; y: number }[],
  style?: PenPreviewStyle,
  zoom = 1,
): void {
  if (points.length === 0) return
  ctx.save()
  ctx.strokeStyle = style?.stroke ?? 'rgba(0,0,0,0.6)'
  ctx.lineWidth = style?.strokeWidth ?? 2
  ctx.globalAlpha = style?.opacity ?? 0.7
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  applyLineDash(ctx, style?.strokeDash ?? 'solid', zoom, style?.strokeWidth ?? 2)
  ctx.beginPath()
  ctx.moveTo(points[0]!.x, points[0]!.y)
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i]!.x, points[i]!.y)
  }
  ctx.stroke()
  ctx.restore()
}

/** Expects canvas transform already set to world space (via applyWorldTransform). */
const CONNECTOR_HANDLE_R = 6

export function drawSelectionOutlineInWorld(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  el: Element,
  padding = SELECTION_PADDING,
  showResizeHandles = true,
  scene?: Scene,
): void {
  if (el.type === 'arrow' && isAttachedArrow(el) && scene) {
    drawAttachedArrowSelectionChrome(ctx, viewport, scene, el, showResizeHandles)
    return
  }
  const b = getElementBounds(el)
  if (!b) return
  const minX = b.minX
  const minY = b.minY
  const maxX = b.maxX
  const maxY = b.maxY
  ctx.save()
  ctx.strokeStyle = '#0d99ff'
  ctx.lineWidth = 1 / viewport.zoom
  worldDash(ctx, viewport.zoom, 4, 4)
  ctx.strokeRect(minX - padding, minY - padding, maxX - minX + padding * 2, maxY - minY + padding * 2)
  if (showResizeHandles && el.type !== 'path') {
    noDash(ctx)
    drawResizeHandles(ctx, viewport, minX - padding, minY - padding, maxX + padding, maxY + padding)
  }
  ctx.restore()
}

function drawAttachedArrowSelectionChrome(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  scene: Scene,
  el: ArrowElement,
  showHandles: boolean,
): void {
  const b = getAttachedArrowBounds(scene, el)
  if (!b) return
  const resolved = resolveAttachedArrow(scene, el)
  ctx.save()
  ctx.strokeStyle = '#0d99ff'
  ctx.lineWidth = 1 / viewport.zoom
  worldDash(ctx, viewport.zoom, 4, 4)
  ctx.strokeRect(
    b.minX - SELECTION_PADDING,
    b.minY - SELECTION_PADDING,
    b.maxX - b.minX + SELECTION_PADDING * 2,
    b.maxY - b.minY + SELECTION_PADDING * 2,
  )
  if (showHandles && resolved) {
    noDash(ctx)
    const r = CONNECTOR_HANDLE_R / viewport.zoom
    const pts = [resolved.start, resolved.control, resolved.end]
    ctx.fillStyle = 'rgba(56, 189, 248, 0.85)'
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 2 / viewport.zoom
    for (const p of pts) {
      ctx.beginPath()
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
    }
  }
  ctx.restore()
}

export function renderMarqueeRect(ctx: CanvasRenderingContext2D, viewport: Viewport, rect: AABB): void {
  const w = rect.maxX - rect.minX
  const h = rect.maxY - rect.minY
  if (w <= 0 || h <= 0) return
  ctx.save()
  ctx.fillStyle = 'rgba(13, 153, 255, 0.08)'
  ctx.strokeStyle = 'rgba(13, 153, 255, 0.85)'
  ctx.lineWidth = 1 / viewport.zoom
  worldDash(ctx, viewport.zoom, 5, 4)
  ctx.fillRect(rect.minX, rect.minY, w, h)
  ctx.strokeRect(rect.minX, rect.minY, w, h)
  ctx.restore()
}

// ─── Laser pointer rendering ──────────────────────────────────────────────────

const LASER_COLOR = `rgb(255,60,82)`

/**
 * Build a smooth quadratic-bezier path through `pts` (midpoint technique).
 * Caller must call ctx.beginPath() before this and ctx.stroke() after.
 */
function buildLaserPath(ctx: CanvasRenderingContext2D, pts: readonly LaserPoint[]): void {
  if (pts.length < 2) return
  if (pts.length === 2) {
    ctx.moveTo(pts[0]!.x, pts[0]!.y)
    ctx.lineTo(pts[1]!.x, pts[1]!.y)
    return
  }
  ctx.moveTo((pts[0]!.x + pts[1]!.x) * 0.5, (pts[0]!.y + pts[1]!.y) * 0.5)
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i]!.x + pts[i + 1]!.x) * 0.5
    const my = (pts[i]!.y + pts[i + 1]!.y) * 0.5
    ctx.quadraticCurveTo(pts[i]!.x, pts[i]!.y, mx, my)
  }
  ctx.lineTo(pts[pts.length - 1]!.x, pts[pts.length - 1]!.y)
}

function parseTrailRgb(css: string): { r: number; g: number; b: number } {
  const s = css.trim()
  if (s.startsWith('#') && s.length === 7) {
    return {
      r: parseInt(s.slice(1, 3), 16),
      g: parseInt(s.slice(3, 5), 16),
      b: parseInt(s.slice(5, 7), 16),
    }
  }
  const m = s.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i)
  if (m) return { r: +m[1]!, g: +m[2]!, b: +m[3]! }
  return { r: 255, g: 60, b: 82 }
}

/**
 * Render fading laser trails on the interactive canvas (world-space transform already applied).
 *
 * Fade model:
 *   - While drawing (`upAt === null`): show the full path with uniform color (no chord gradient).
 *   - After pointer up: shorten the visible tail by `LASER_MAX_LENGTH` × fade and fade alpha over
 *     `LASER_AFTER_FADE_MS` (chord gradient is still wrong on curves; stroke is solid).
 */
export function renderLaserTrails(
  ctx: CanvasRenderingContext2D,
  segments: readonly LaserSegment[],
  now: number,
  zoom: number,
  /** Defaults to the local laser red; use peer color for remote lasers. */
  color: string = LASER_COLOR,
): void {
  if (segments.length === 0) return

  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  noDash(ctx)

  const rgb = parseTrailRgb(color)
  const { r, g: green, b } = rgb

  for (const seg of segments) {
    const pts = seg.points
    if (pts.length < 2) continue

    const totalD = pts[pts.length - 1]!.d

    let segAlpha = 1.0
    let maxVisible = LASER_MAX_LENGTH
    if (seg.upAt !== null) {
      const elapsed = now - seg.upAt
      segAlpha = Math.max(0, 1 - elapsed / LASER_AFTER_FADE_MS)
      maxVisible = LASER_MAX_LENGTH * segAlpha
    }
    if (segAlpha < 0.01) continue

    let visible: readonly LaserPoint[]
    if (seg.upAt === null) {
      visible = pts
    } else {
      const minD = Math.max(0, totalD - maxVisible)
      let startIdx = pts.findIndex((p) => p.d >= minD)
      if (startIdx < 0) startIdx = 0
      if (startIdx > 0) startIdx--
      visible = pts.slice(startIdx)
    }
    if (visible.length < 2) continue

    const head = visible[visible.length - 1]!

    const baseA = 0.9 * segAlpha
    ctx.beginPath()
    buildLaserPath(ctx, visible)
    ctx.strokeStyle = `rgba(${r},${green},${b},${baseA})`
    ctx.globalAlpha = 1
    ctx.lineWidth = 3 / zoom
    ctx.shadowColor = `rgba(${r},${green},${b},${0.5 * segAlpha})`
    ctx.shadowBlur = 9
    ctx.shadowOffsetX = 0
    ctx.shadowOffsetY = 0
    ctx.stroke()
    ctx.shadowColor = 'transparent'
    ctx.shadowBlur = 0

    ctx.globalAlpha = segAlpha * 0.95
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.arc(head.x, head.y, 1.6 / zoom, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = segAlpha * 0.55
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(head.x, head.y, 3.8 / zoom, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.restore()
}

const ERASER_TRAIL_COLOR = '#64748b'

/** Gray fading trail while erasing (same geometry model as the laser pointer). */
export function renderEraserTrails(
  ctx: CanvasRenderingContext2D,
  segments: readonly LaserSegment[],
  now: number,
  zoom: number,
): void {
  if (segments.length === 0) return

  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  noDash(ctx)

  const erRgb = parseTrailRgb(ERASER_TRAIL_COLOR)
  const { r, g: eg, b } = erRgb

  for (const seg of segments) {
    const pts = seg.points
    if (pts.length < 2) continue

    const totalD = pts[pts.length - 1]!.d

    let segAlpha = 1.0
    let maxVisible = LASER_MAX_LENGTH
    if (seg.upAt !== null) {
      const elapsed = now - seg.upAt
      segAlpha = Math.max(0, 1 - elapsed / LASER_AFTER_FADE_MS)
      maxVisible = LASER_MAX_LENGTH * segAlpha
    }
    if (segAlpha < 0.01) continue

    let visible: readonly LaserPoint[]
    if (seg.upAt === null) {
      visible = pts
    } else {
      const minD = Math.max(0, totalD - maxVisible)
      let startIdx = pts.findIndex((p) => p.d >= minD)
      if (startIdx < 0) startIdx = 0
      if (startIdx > 0) startIdx--
      visible = pts.slice(startIdx)
    }
    if (visible.length < 2) continue

    const head = visible[visible.length - 1]!

    ctx.beginPath()
    buildLaserPath(ctx, visible)
    ctx.strokeStyle = `rgba(${r},${eg},${b},${0.85 * segAlpha})`
    ctx.globalAlpha = 1
    ctx.lineWidth = 3.2 / zoom
    ctx.stroke()

    ctx.globalAlpha = segAlpha * 0.5
    ctx.fillStyle = ERASER_TRAIL_COLOR
    ctx.beginPath()
    ctx.arc(head.x, head.y, 3.2 / zoom, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.restore()
}

/** Remote peers' cursors (world space); drawn on top of the interactive layer. */
export function renderRemotePresenceCursors(
  ctx: CanvasRenderingContext2D,
  zoom: number,
  localUserId: string,
  peers: readonly PresencePeer[],
): void {
  for (const p of peers) {
    if (p.userId === localUserId) continue
    const c = p.cursorWorld
    if (!c) continue
    const color = p.color ?? '#64748b'
    ctx.save()
    ctx.strokeStyle = color
    ctx.fillStyle = color
    ctx.lineWidth = 1.5 / zoom
    ctx.globalAlpha = 0.95
    ctx.beginPath()
    ctx.arc(c.x, c.y, 6 / zoom, 0, Math.PI * 2)
    ctx.stroke()
    ctx.globalAlpha = 0.22
    ctx.beginPath()
    ctx.arc(c.x, c.y, 14 / zoom, 0, Math.PI * 2)
    ctx.stroke()
    ctx.restore()
    if (p.name) {
      ctx.save()
      ctx.font = `${12 / zoom}px system-ui, sans-serif`
      ctx.fillStyle = color
      ctx.globalAlpha = 0.92
      ctx.fillText(p.name, c.x + 10 / zoom, c.y - 8 / zoom)
      ctx.restore()
    }
  }
}

export interface InteractiveOverlayOptions {
  canvas: CanvasPair
  viewport: Viewport
  scene: Scene
  selection: readonly string[]
  penPreview: readonly Point[] | null
  /** Style to use when rendering the live pen preview stroke. */
  penPreviewStyle: PenPreviewStyle | null
  shapePreview: Element | null
  /** Connector tool: line from first shape toward pointer before second click. */
  connectorPlacementPreview?: { sourceId: string; hover: Point } | null
  /** Drag-to-select rectangle in world space (select tool). */
  marqueeRect: AABB | null
  /** Active laser pointer trails to render (fading, time-based). */
  laserSegments: readonly LaserSegment[] | null
  /** Eraser drag trail (gray), same fade model as the laser. */
  eraserSegments: readonly LaserSegment[] | null
  /** Current timestamp for laser fade calculation (`Date.now()`). */
  laserNow: number
  /** Other users' cursors (from presence sync). */
  remotePresence?: { localUserId: string; peers: readonly PresencePeer[] }
  /** Other users' laser trails; set via `Bembeyaz.applyRemoteLaser`. */
  remoteLaser?: readonly { userId: string; color: string; segments: readonly LaserSegment[] }[]
}

export function renderInteractiveOverlay(opts: InteractiveOverlayOptions): void {
  const { interactiveCtx, interactiveCanvas, getDpr } = opts.canvas
  const dpr = getDpr()
  clearCanvas(interactiveCtx, interactiveCanvas)

  applyWorldTransform(interactiveCtx, dpr, opts.viewport)
  if (opts.marqueeRect) {
    renderMarqueeRect(interactiveCtx, opts.viewport, opts.marqueeRect)
  }
  const showHandles = opts.selection.length === 1
  for (const id of opts.selection) {
    const el = opts.scene.getById(id)
    if (el) drawSelectionOutlineInWorld(interactiveCtx, opts.viewport, el, SELECTION_PADDING, showHandles, opts.scene)
  }
  if (opts.penPreview && opts.penPreview.length > 0) {
    renderPathPreview(interactiveCtx, opts.penPreview, opts.penPreviewStyle ?? undefined, opts.viewport.zoom)
  }
  const cp = opts.connectorPlacementPreview
  if (cp) {
    const src = opts.scene.getById(cp.sourceId)
    if (src) {
      const start = anchorTowardPoint(src, cp.hover)
      renderPathPreview(interactiveCtx, [start, cp.hover], opts.penPreviewStyle ?? undefined, opts.viewport.zoom)
    }
  } else if (opts.shapePreview && opts.shapePreview.type !== 'path' && opts.shapePreview.type !== 'text') {
    renderShapeElement(
      interactiveCtx,
      opts.shapePreview as Exclude<Element, PathElement | TextElement | ImageElement>,
      opts.viewport.zoom,
    )
  }
  const rl = opts.remoteLaser
  if (opts.eraserSegments && opts.eraserSegments.length > 0) {
    renderEraserTrails(interactiveCtx, opts.eraserSegments, opts.laserNow, opts.viewport.zoom)
  }
  if (rl && rl.length > 0) {
    for (const { segments, color } of rl) {
      if (segments.length > 0) {
        renderLaserTrails(interactiveCtx, segments, opts.laserNow, opts.viewport.zoom, color)
      }
    }
  }
  if (opts.laserSegments && opts.laserSegments.length > 0) {
    renderLaserTrails(interactiveCtx, opts.laserSegments, opts.laserNow, opts.viewport.zoom)
  }
  const rp = opts.remotePresence
  if (rp && rp.peers.length > 0) {
    renderRemotePresenceCursors(interactiveCtx, opts.viewport.zoom, rp.localUserId, rp.peers)
  }
}

export interface RenderStaticOptions {
  canvas: CanvasPair
  viewport: Viewport
  scene: Scene
  elements: readonly Element[]
  backgroundColor: string
  gridEnabled: boolean
  /** Used when `gridEnabled` is true. */
  gridStyle: GridStyle
  /** Called when a raster finishes decoding so the static layer can redraw. */
  onImageDecoded?: () => void
}

export function renderStaticScene(opts: RenderStaticOptions): void {
  const { staticCtx, staticCanvas, getDpr } = opts.canvas
  const dpr = getDpr()
  clearCanvas(staticCtx, staticCanvas)
  fillBackground(staticCtx, staticCanvas, dpr, opts.backgroundColor)

  applyWorldTransform(staticCtx, dpr, opts.viewport)
  if (opts.gridEnabled) {
    if (opts.gridStyle === 'dots') {
      drawGridDots(staticCtx, opts.viewport, opts.canvas.getSize())
    } else {
      drawGridLines(staticCtx, opts.viewport, opts.canvas.getSize())
    }
  }
  const zoom = opts.viewport.zoom
  for (const el of opts.elements) {
    if (el.type === 'path') {
      renderPathElement(staticCtx, el, zoom)
    } else if (el.type === 'text') {
      renderTextElement(staticCtx, el)
    } else if (el.type === 'image') {
      renderImageElement(staticCtx, el, opts.onImageDecoded)
    } else if (el.type === 'arrow' && isAttachedArrow(el)) {
      renderAttachedArrowElement(staticCtx, el, opts.scene, zoom)
    } else {
      renderShapeElement(staticCtx, el, zoom)
    }
  }
}

function drawArrowHead(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  size: number,
  angleOffset: number,
): void {
  const angle = Math.atan2(y2 - y1, x2 - x1)
  const a1 = angle - angleOffset
  const a2 = angle + angleOffset
  const p1x = x2 - Math.cos(a1) * size
  const p1y = y2 - Math.sin(a1) * size
  const p2x = x2 - Math.cos(a2) * size
  const p2y = y2 - Math.sin(a2) * size
  ctx.beginPath()
  ctx.moveTo(x2, y2)
  ctx.lineTo(p1x, p1y)
  ctx.moveTo(x2, y2)
  ctx.lineTo(p2x, p2y)
  ctx.stroke()
}

function drawResizeHandles(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): void {
  const size = RESIZE_HANDLE_WORLD / viewport.zoom
  const half = size / 2
  const corners = [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ]
  noDash(ctx)
  ctx.fillStyle = '#f97316'
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 2 / viewport.zoom
  for (const c of corners) {
    ctx.fillRect(c.x - half, c.y - half, size, size)
    ctx.strokeRect(c.x - half, c.y - half, size, size)
  }
}

/** Minor cell size; every `majorStride` minor cells form one major square (solid outline). */
const GRID_MINOR_STEP = 20
const GRID_MAJOR_STRIDE = 5

function drawGridLines(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  size: { width: number; height: number },
): void {
  const minorStep = GRID_MINOR_STEP
  const majorStride = GRID_MAJOR_STRIDE
  const zoom = viewport.zoom
  const bounds = viewport.getVisibleWorldBounds(size.width, size.height)
  const minI = Math.floor(bounds.minX / minorStep)
  const maxI = Math.ceil(bounds.maxX / minorStep)
  const minJ = Math.floor(bounds.minY / minorStep)
  const maxJ = Math.ceil(bounds.maxY / minorStep)

  const isMajorIndex = (n: number): boolean => {
    const m = ((n % majorStride) + majorStride) % majorStride
    return m === 0
  }

  ctx.save()
  const lineWorld = 1 / zoom

  // Minor: dashed stripes along subdivisions (5x5 per major cell), lighter than major
  ctx.strokeStyle = 'rgba(0,0,0,0.072)'
  ctx.lineWidth = lineWorld
  worldDash(ctx, zoom, 4, 4)
  ctx.lineCap = 'butt'
  ctx.beginPath()
  for (let i = minI; i <= maxI; i++) {
    if (isMajorIndex(i)) continue
    const x = i * minorStep
    ctx.moveTo(x, bounds.minY)
    ctx.lineTo(x, bounds.maxY)
  }
  for (let j = minJ; j <= maxJ; j++) {
    if (isMajorIndex(j)) continue
    const y = j * minorStep
    ctx.moveTo(bounds.minX, y)
    ctx.lineTo(bounds.maxX, y)
  }
  ctx.stroke()

  // Major: solid lines on large-cell boundaries (no dash)
  ctx.strokeStyle = 'rgba(0,0,0,0.095)'
  ctx.lineWidth = lineWorld
  noDash(ctx)
  ctx.lineCap = 'butt'
  ctx.beginPath()
  for (let i = minI; i <= maxI; i++) {
    if (!isMajorIndex(i)) continue
    const x = i * minorStep
    ctx.moveTo(x, bounds.minY)
    ctx.lineTo(x, bounds.maxY)
  }
  for (let j = minJ; j <= maxJ; j++) {
    if (!isMajorIndex(j)) continue
    const y = j * minorStep
    ctx.moveTo(bounds.minX, y)
    ctx.lineTo(bounds.maxX, y)
  }
  ctx.stroke()
  ctx.restore()
}

function drawGridDots(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  size: { width: number; height: number },
): void {
  const minorStep = GRID_MINOR_STEP
  const majorStride = GRID_MAJOR_STRIDE
  const zoom = viewport.zoom
  const bounds = viewport.getVisibleWorldBounds(size.width, size.height)
  const minI = Math.floor(bounds.minX / minorStep)
  const maxI = Math.ceil(bounds.maxX / minorStep)
  const minJ = Math.floor(bounds.minY / minorStep)
  const maxJ = Math.ceil(bounds.maxY / minorStep)

  const isMajorIndex = (n: number): boolean => {
    const m = ((n % majorStride) + majorStride) % majorStride
    return m === 0
  }

  ctx.save()
  // Radius in world units: after applyWorldTransform, device px radius = r * dpr * zoom.
  // Target ~1.2–2.1 CSS px on screen (same order as 1/zoom line stroke → ~1 CSS px hairline).
  const rMinor = 1.2 / zoom
  const rMed = 1.65 / zoom
  const rMajor = 2.1 / zoom

  for (let j = minJ; j <= maxJ; j++) {
    for (let i = minI; i <= maxI; i++) {
      const x = i * minorStep
      const y = j * minorStep
      const mx = isMajorIndex(i)
      const my = isMajorIndex(j)
      let r: number
      let alpha: number
      if (mx && my) {
        r = rMajor
        alpha = 0.2
      } else if (mx || my) {
        r = rMed
        alpha = 0.15
      } else {
        r = rMinor
        alpha = 0.12
      }
      ctx.fillStyle = `rgba(0,0,0,${alpha})`
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  ctx.restore()
}
