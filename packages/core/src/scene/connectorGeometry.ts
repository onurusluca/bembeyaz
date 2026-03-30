import type { ArrowElement, ConnectorEdgeSide, Element, Point } from '../types.js'
import { getElementBounds } from './elements.js'
import type { Scene } from './Scene.js'
import { expandAABB } from '../utils/math.js'
import type { AABB } from '../utils/math.js'

const HANDLE_R_WORLD = 7

export function isAttachedArrow(el: ArrowElement): boolean {
  return Boolean(el.sourceId && el.targetId)
}

export interface ResolvedAttachedArrow {
  start: Point
  /** Quadratic Bezier control (chord midpoint + bend offset). */
  control: Point
  end: Point
  labelPoint: Point
}

function rectCenter(x: number, y: number, w: number, h: number): Point {
  return { x: x + w / 2, y: y + h / 2 }
}

function rayExitRect(
  x: number,
  y: number,
  w: number,
  h: number,
  from: Point,
  toward: Point,
): { side: ConnectorEdgeSide; t: number; p: Point } {
  const cx = x + w / 2
  const cy = y + h / 2
  const dx = toward.x - cx
  const dy = toward.y - cy
  const len = Math.hypot(dx, dy)
  if (len < 1e-9) {
    return { side: 'n', t: 0.5, p: { x: x + w / 2, y: y } }
  }
  const ux = dx / len
  const uy = dy / len
  let bestU = Number.POSITIVE_INFINITY
  let best: { side: ConnectorEdgeSide; t: number; p: Point } | null = null

  const tryEdge = (side: ConnectorEdgeSide, u: number, px: number, py: number, t: number): void => {
    if (u > 1e-9 && u < bestU) {
      bestU = u
      best = { side, t, p: { x: px, y: py } }
    }
  }

  if (ux > 1e-9) {
    const u = (x + w - from.x) / ux
    const py = from.y + u * uy
    if (py >= y - 1e-6 && py <= y + h + 1e-6) tryEdge('e', u, x + w, py, (py - y) / h)
  }
  if (ux < -1e-9) {
    const u = (x - from.x) / ux
    const py = from.y + u * uy
    if (py >= y - 1e-6 && py <= y + h + 1e-6) tryEdge('w', u, x, py, (py - y) / h)
  }
  if (uy > 1e-9) {
    const u = (y + h - from.y) / uy
    const px = from.x + u * ux
    if (px >= x - 1e-6 && px <= x + w + 1e-6) tryEdge('s', u, px, y + h, (px - x) / w)
  }
  if (uy < -1e-9) {
    const u = (y - from.y) / uy
    const px = from.x + u * ux
    if (px >= x - 1e-6 && px <= x + w + 1e-6) tryEdge('n', u, px, y, (px - x) / w)
  }

  if (best) return best
  return { side: 'n', t: 0.5, p: { x: x + w / 2, y: y } }
}

function pointOnRectEdge(
  x: number,
  y: number,
  w: number,
  h: number,
  side: ConnectorEdgeSide,
  t: number,
): Point {
  const tt = Math.max(0, Math.min(1, t))
  switch (side) {
    case 'n':
      return { x: x + tt * w, y: y }
    case 'e':
      return { x: x + w, y: y + tt * h }
    case 's':
      return { x: x + tt * w, y: y + h }
    case 'w':
      return { x: x, y: y + tt * h }
  }
}

function projectToRectEdge(
  x: number,
  y: number,
  w: number,
  h: number,
  p: Point,
): { side: ConnectorEdgeSide; t: number; point: Point } {
  const x0 = x
  const x1 = x + w
  const y0 = y
  const y1 = y + h
  let bestD = Number.POSITIVE_INFINITY
  let best: { side: ConnectorEdgeSide; t: number; point: Point } | null = null

  const edges: { side: ConnectorEdgeSide; a: Point; b: Point }[] = [
    { side: 'n', a: { x: x0, y: y0 }, b: { x: x1, y: y0 } },
    { side: 'e', a: { x: x1, y: y0 }, b: { x: x1, y: y1 } },
    { side: 's', a: { x: x1, y: y1 }, b: { x: x0, y: y1 } },
    { side: 'w', a: { x: x0, y: y1 }, b: { x: x0, y: y0 } },
  ]
  for (const { side, a, b } of edges) {
    const abx = b.x - a.x
    const aby = b.y - a.y
    const apx = p.x - a.x
    const apy = p.y - a.y
    const ab2 = abx * abx + aby * aby
    const u = ab2 < 1e-12 ? 0 : Math.max(0, Math.min(1, (apx * abx + apy * aby) / ab2))
    const px = a.x + u * abx
    const py = a.y + u * aby
    const d = (p.x - px) ** 2 + (p.y - py) ** 2
    if (d < bestD) {
      bestD = d
      const t =
        side === 'n' || side === 's'
          ? w > 1e-9
            ? (px - x0) / w
            : 0.5
          : h > 1e-9
            ? (py - y0) / h
            : 0.5
      best = { side, t: Math.max(0, Math.min(1, t)), point: { x: px, y: py } }
    }
  }
  return best ?? { side: 'n', t: 0.5, point: { x: x + w / 2, y: y } }
}

function ellipseAnchorAuto(ex: number, ey: number, ew: number, eh: number, toward: Point): Point {
  const cx = ex + ew / 2
  const cy = ey + eh / 2
  const rx = Math.abs(ew) / 2
  const ry = Math.abs(eh) / 2
  const vx = toward.x - cx
  const vy = toward.y - cy
  const len = Math.hypot(vx, vy)
  if (len < 1e-9 || rx < 1e-9 || ry < 1e-9) {
    return { x: cx + rx, y: cy }
  }
  const ux = vx / len
  const uy = vy / len
  const s = 1 / Math.sqrt((ux / rx) ** 2 + (uy / ry) ** 2)
  return { x: cx + ux * s, y: cy + uy * s }
}

function projectToEllipseEdge(ex: number, ey: number, ew: number, eh: number, p: Point): Point {
  const cx = ex + ew / 2
  const cy = ey + eh / 2
  const rx = Math.abs(ew) / 2
  const ry = Math.abs(eh) / 2
  if (rx < 1e-9 || ry < 1e-9) return { x: cx, y: cy }
  const vx = p.x - cx
  const vy = p.y - cy
  const len = Math.hypot(vx, vy)
  if (len < 1e-9) return { x: cx + rx, y: cy }
  const ux = vx / len
  const uy = vy / len
  const s = 1 / Math.sqrt((ux / rx) ** 2 + (uy / ry) ** 2)
  return { x: cx + ux * s, y: cy + uy * s }
}

export function anchorTowardPoint(el: Element, toward: Point): Point {
  return anchorOnElement(el, toward, false, 'n', 0.5)
}

function anchorOnElement(el: Element, toward: Point, manual: boolean, side: ConnectorEdgeSide, t: number): Point {
  if (el.type === 'rectangle' || el.type === 'image') {
    const { x, y, width: w, height: h } = el
    if (!manual) {
      const c = rectCenter(x, y, w, h)
      const r = rayExitRect(x, y, w, h, c, toward)
      return r.p
    }
    return pointOnRectEdge(x, y, w, h, side, t)
  }
  if (el.type === 'text') {
    const b = getElementBounds(el)
    if (!b) return toward
    const w = b.maxX - b.minX
    const h = b.maxY - b.minY
    const x = b.minX
    const y = b.minY
    if (!manual) {
      const c = rectCenter(x, y, w, h)
      const r = rayExitRect(x, y, w, h, c, toward)
      return r.p
    }
    return pointOnRectEdge(x, y, w, h, side, t)
  }
  if (el.type === 'ellipse') {
    const { x, y, width: ew, height: eh } = el
    if (!manual) {
      return ellipseAnchorAuto(x, y, ew, eh, toward)
    }
    const cx = x + ew / 2
    const cy = y + eh / 2
    const theta = t * Math.PI * 2
    const rx = Math.abs(ew) / 2
    const ry = Math.abs(eh) / 2
    return { x: cx + Math.cos(theta) * rx, y: cy + Math.sin(theta) * ry }
  }
  const b = getElementBounds(el)
  if (!b) return toward
  return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 }
}

function centerOf(el: Element): Point {
  if (el.type === 'rectangle' || el.type === 'image') {
    return rectCenter(el.x, el.y, el.width, el.height)
  }
  if (el.type === 'ellipse') {
    return rectCenter(el.x, el.y, el.width, el.height)
  }
  if (el.type === 'text') {
    const b = getElementBounds(el)
    return b ? rectCenter(b.minX, b.minY, b.maxX - b.minX, b.maxY - b.minY) : { x: 0, y: 0 }
  }
  const b = getElementBounds(el)
  return b ? { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 } : { x: 0, y: 0 }
}

export function resolveAttachedArrow(scene: Scene, el: ArrowElement): ResolvedAttachedArrow | null {
  if (!isAttachedArrow(el)) return null
  const src = scene.getById(el.sourceId!)
  const tgt = scene.getById(el.targetId!)
  if (!src || !tgt) return null

  const tc = centerOf(tgt)
  const sc = centerOf(src)

  const sm = el.sourceManual ?? false
  const tm = el.targetManual ?? false
  const ss = el.sourceSide ?? 'e'
  const ts = el.targetSide ?? 'w'
  const st = el.sourceT ?? 0.5
  const tt = el.targetT ?? 0.5

  const start = anchorOnElement(src, tc, sm, ss, st)
  const end = anchorOnElement(tgt, sc, tm, ts, tt)

  const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 }
  const bx = el.bendOffsetX ?? 0
  const by = el.bendOffsetY ?? 0
  const control = { x: mid.x + bx, y: mid.y + by }
  const labelPoint = pointAtQuadArcLengthMid(start, control, end)
  return { start, control, end, labelPoint }
}

function quadPoint(p0: Point, p1: Point, p2: Point, t: number): Point {
  const u = 1 - t
  return {
    x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
    y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
  }
}

/** Tangent direction at t=1 for quadratic (from control toward end). */
export function attachedArrowEndTangent(resolved: ResolvedAttachedArrow): Point {
  const p0 = resolved.start
  const p1 = resolved.control
  const p2 = resolved.end
  const t = 1
  return {
    x: -2 * (1 - t) * p0.x + 2 * (1 - 2 * t) * p1.x + 2 * t * p2.x,
    y: -2 * (1 - t) * p0.y + 2 * (1 - 2 * t) * p1.y + 2 * t * p2.y,
  }
}

function pointAtQuadArcLengthMid(p0: Point, p1: Point, p2: Point): Point {
  const n = 48
  const pts: Point[] = []
  for (let i = 0; i <= n; i++) {
    pts.push(quadPoint(p0, p1, p2, i / n))
  }
  const segLen: number[] = []
  let total = 0
  for (let i = 0; i < n; i++) {
    const a = pts[i]!
    const b = pts[i + 1]!
    const d = Math.hypot(b.x - a.x, b.y - a.y)
    segLen.push(d)
    total += d
  }
  if (total < 1e-9) return quadPoint(p0, p1, p2, 0.5)
  let target = total * 0.5
  for (let i = 0; i < n; i++) {
    const d = segLen[i]!
    if (target <= d || i === n - 1) {
      const u = d < 1e-9 ? 0 : target / d
      const a = pts[i]!
      const b = pts[i + 1]!
      return { x: a.x + u * (b.x - a.x), y: a.y + u * (b.y - a.y) }
    }
    target -= d
  }
  return quadPoint(p0, p1, p2, 0.5)
}

export function getAttachedArrowBounds(scene: Scene, el: ArrowElement): AABB | null {
  const r = resolveAttachedArrow(scene, el)
  if (!r) return null
  return getResolvedAttachedBounds(r, el.style.strokeWidth)
}

export function getResolvedAttachedBounds(resolved: ResolvedAttachedArrow, strokeWidth: number): AABB {
  const { start: p0, control: p1, end: p2 } = resolved
  const n = 32
  let minX = p0.x
  let minY = p0.y
  let maxX = p0.x
  let maxY = p0.y
  for (let i = 0; i <= n; i++) {
    const q = quadPoint(p0, p1, p2, i / n)
    minX = Math.min(minX, q.x)
    minY = Math.min(minY, q.y)
    maxX = Math.max(maxX, q.x)
    maxY = Math.max(maxY, q.y)
  }
  const pad = strokeWidth / 2 + 14
  return expandAABB({ minX, minY, maxX, maxY }, pad)
}

export type ArrowHandleId = 'start' | 'bend' | 'end'

export function hitTestArrowHandle(
  scene: Scene,
  el: ArrowElement,
  wx: number,
  wy: number,
  zoom: number,
): ArrowHandleId | null {
  if (!isAttachedArrow(el)) return null
  const r = resolveAttachedArrow(scene, el)
  if (!r) return null
  const thr = HANDLE_R_WORLD / zoom
  const thr2 = thr * thr
  const pts: { id: ArrowHandleId; p: Point }[] = [
    { id: 'start', p: r.start },
    { id: 'bend', p: r.control },
    { id: 'end', p: r.end },
  ]
  for (const { id, p } of pts) {
    const d = (wx - p.x) ** 2 + (wy - p.y) ** 2
    if (d <= thr2) return id
  }
  return null
}

export function projectManualAnchor(
  el: Element,
  world: Point,
): { side: ConnectorEdgeSide; t: number } | null {
  if (el.type === 'rectangle' || el.type === 'image') {
    const { x, y, width: w, height: h } = el
    return projectToRectEdge(x, y, w, h, world)
  }
  if (el.type === 'text') {
    const b = getElementBounds(el)
    if (!b) return null
    const w = b.maxX - b.minX
    const h = b.maxY - b.minY
    return projectToRectEdge(b.minX, b.minY, w, h, world)
  }
  if (el.type === 'ellipse') {
    const ep = projectToEllipseEdge(el.x, el.y, el.width, el.height, world)
    const cx = el.x + el.width / 2
    const cy = el.y + el.height / 2
    const theta = Math.atan2(ep.y - cy, ep.x - cx)
    const tn = (theta / (Math.PI * 2) + 1) % 1
    return { side: 'n', t: tn }
  }
  return null
}

export function distancePointToAttachedArrowCurve(resolved: ResolvedAttachedArrow, p: Point): number {
  const p0 = resolved.start
  const p1 = resolved.control
  const p2 = resolved.end
  const segments = 64
  let best = Infinity
  let prev = quadPoint(p0, p1, p2, 0)
  for (let i = 1; i <= segments; i++) {
    const t = i / segments
    const cur = quadPoint(p0, p1, p2, t)
    best = Math.min(best, distancePointToSegment(p, prev, cur))
    prev = cur
  }
  return best
}

function distancePointToSegment(p: Point, a: Point, b: Point): number {
  const abx = b.x - a.x
  const aby = b.y - a.y
  const apx = p.x - a.x
  const apy = p.y - a.y
  const ab2 = abx * abx + aby * aby
  const u = ab2 < 1e-12 ? 0 : Math.max(0, Math.min(1, (apx * abx + apy * aby) / ab2))
  const px = a.x + u * abx
  const py = a.y + u * aby
  return Math.hypot(p.x - px, p.y - py)
}

/** @deprecated alias */
export const resolveConnector = resolveAttachedArrow
export const getConnectorBounds = getAttachedArrowBounds
export type ConnectorHandleId = ArrowHandleId
export const hitTestConnectorHandle = hitTestArrowHandle
export const distancePointToConnectorPolyline = distancePointToAttachedArrowCurve
