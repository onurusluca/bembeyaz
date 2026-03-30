import type { Point } from '../types.js'

export interface AABB {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export function vec2(x: number, y: number): Point {
  return { x, y }
}

export function distSq(a: Point, b: Point): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return dx * dx + dy * dy
}

export function dist(a: Point, b: Point): number {
  return Math.sqrt(distSq(a, b))
}

export function expandAABB(box: AABB, margin: number): AABB {
  return {
    minX: box.minX - margin,
    minY: box.minY - margin,
    maxX: box.maxX + margin,
    maxY: box.maxY + margin,
  }
}

/** Axis-aligned bounding box for a set of points */
export function pointsAABB(points: readonly Point[]): AABB | null {
  if (points.length === 0) return null
  let minX = points[0].x
  let minY = points[0].y
  let maxX = points[0].x
  let maxY = points[0].y
  for (let i = 1; i < points.length; i++) {
    const p = points[i]
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }
  return { minX, minY, maxX, maxY }
}

export function aabbIntersectsViewport(
  box: AABB,
  viewMinX: number,
  viewMinY: number,
  viewMaxX: number,
  viewMaxY: number,
): boolean {
  return !(box.maxX < viewMinX || box.minX > viewMaxX || box.maxY < viewMinY || box.minY > viewMaxY)
}

/** True if two axis-aligned boxes overlap (edges touching count as intersecting). */
export function aabbIntersects(a: AABB, b: AABB): boolean {
  return !(a.maxX < b.minX || a.minX > b.maxX || a.maxY < b.minY || a.minY > b.maxY)
}

export function pointInAABB(x: number, y: number, b: AABB): boolean {
  return x >= b.minX && x <= b.maxX && y >= b.minY && y <= b.maxY
}

/** Squared distance from point P to segment AB */
export function distToSegmentSq(p: Point, a: Point, b: Point): number {
  const abx = b.x - a.x
  const aby = b.y - a.y
  const apx = p.x - a.x
  const apy = p.y - a.y
  const abLenSq = abx * abx + aby * aby
  if (abLenSq < 1e-12) return distSq(p, a)
  let t = (apx * abx + apy * aby) / abLenSq
  t = Math.max(0, Math.min(1, t))
  const cx = a.x + t * abx
  const cy = a.y + t * aby
  const dx = p.x - cx
  const dy = p.y - cy
  return dx * dx + dy * dy
}

/** Minimum distance from point to polyline (world units) */
export function distPointToPolyline(p: Point, points: readonly Point[]): number {
  if (points.length === 0) return Infinity
  if (points.length === 1) return dist(p, points[0])
  let minSq = Infinity
  for (let i = 0; i < points.length - 1; i++) {
    const d = distToSegmentSq(p, points[i], points[i + 1])
    if (d < minSq) minSq = d
  }
  return Math.sqrt(minSq)
}

/** Hit test: point within threshold (world) of polyline */
export function hitTestPolyline(
  p: Point,
  points: readonly Point[],
  thresholdWorld: number,
): boolean {
  return distPointToPolyline(p, points) <= thresholdWorld
}

/** Point inside axis-aligned rectangle (inclusive), including interior. */
export function hitTestRectFill(p: Point, x: number, y: number, width: number, height: number): boolean {
  const x0 = Math.min(x, x + width)
  const x1 = Math.max(x, x + width)
  const y0 = Math.min(y, y + height)
  const y1 = Math.max(y, y + height)
  return p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1
}

export function hitTestRectStroke(
  p: Point,
  x: number,
  y: number,
  width: number,
  height: number,
  thresholdWorld: number,
): boolean {
  const x2 = x + width
  const y2 = y + height
  const edges = [
    [{ x, y }, { x: x2, y }],
    [{ x: x2, y }, { x: x2, y: y2 }],
    [{ x: x2, y: y2 }, { x, y: y2 }],
    [{ x, y: y2 }, { x, y }],
  ] as const
  return edges.some(([a, b]) => Math.sqrt(distToSegmentSq(p, a, b)) <= thresholdWorld)
}

/** Point inside ellipse (filled), including interior. */
export function hitTestEllipseFill(p: Point, x: number, y: number, width: number, height: number): boolean {
  const w = Math.abs(width)
  const h = Math.abs(height)
  if (w < 1e-9 || h < 1e-9) return false
  const rx = w / 2
  const ry = h / 2
  const cx = x + width / 2
  const cy = y + height / 2
  const nx = (p.x - cx) / rx
  const ny = (p.y - cy) / ry
  return nx * nx + ny * ny <= 1 + 1e-9
}

export function hitTestEllipseStroke(
  p: Point,
  x: number,
  y: number,
  width: number,
  height: number,
  thresholdWorld: number,
): boolean {
  const rx = width / 2
  const ry = height / 2
  if (rx < 1e-6 || ry < 1e-6) return false
  const cx = x + rx
  const cy = y + ry
  const nx = (p.x - cx) / rx
  const ny = (p.y - cy) / ry
  const r = Math.sqrt(nx * nx + ny * ny)
  const avgRadius = (rx + ry) / 2
  const normalizedThreshold = thresholdWorld / Math.max(1e-6, avgRadius)
  return Math.abs(r - 1) <= normalizedThreshold
}
