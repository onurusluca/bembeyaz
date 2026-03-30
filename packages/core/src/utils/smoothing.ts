import type { Point } from '../types.js'
import { distToSegmentSq } from './math.js'

/** Ramer–Douglas–Peucker polyline simplification */
export function simplifyRDP(points: readonly Point[], epsilon: number): Point[] {
  if (points.length <= 2) return [...points]
  const epsSq = epsilon * epsilon

  function rdpRange(start: number, end: number): Point[] {
    let maxDistSq = 0
    let maxIdx = start
    const a = points[start]!
    const b = points[end]!
    for (let i = start + 1; i < end; i++) {
      const dSq = distToSegmentSq(points[i]!, a, b)
      if (dSq > maxDistSq) {
        maxDistSq = dSq
        maxIdx = i
      }
    }
    if (maxDistSq > epsSq) {
      const left = rdpRange(start, maxIdx)
      const right = rdpRange(maxIdx, end)
      return [...left.slice(0, -1), ...right]
    }
    return [a, b]
  }

  return rdpRange(0, points.length - 1)
}

/** Catmull-Rom to uniform denser samples (chordal parameterization lite) */
export function catmullRomSpline(points: readonly Point[], segmentsPerSpan = 4): Point[] {
  if (points.length < 2) return [...points]
  if (points.length === 2) {
    return interpolateSegment(points[0]!, points[0]!, points[1]!, points[1]!, segmentsPerSpan)
  }

  const result: Point[] = []
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = i === 0 ? points[0]! : points[i - 1]!
    const p1 = points[i]!
    const p2 = points[i + 1]!
    const p3 = i + 2 < points.length ? points[i + 2]! : points[i + 1]!
    const segment = catmullRomSegment(p0, p1, p2, p3, segmentsPerSpan)
    if (i === 0) {
      result.push(...segment)
    } else {
      result.push(...segment.slice(1))
    }
  }
  return result
}

function catmullRomSegment(
  p0: Point,
  p1: Point,
  p2: Point,
  p3: Point,
  segments: number,
): Point[] {
  const out: Point[] = []
  for (let i = 0; i <= segments; i++) {
    const t = i / segments
    out.push(catmullRomPoint(p0, p1, p2, p3, t))
  }
  return out
}

function catmullRomPoint(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const t2 = t * t
  const t3 = t2 * t
  const x =
    0.5 *
    (2 * p1.x +
      (-p0.x + p2.x) * t +
      (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
      (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3)
  const y =
    0.5 *
    (2 * p1.y +
      (-p0.y + p2.y) * t +
      (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
      (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3)
  return { x, y }
}

function interpolateSegment(p0: Point, p1: Point, p2: Point, p3: Point, segments: number): Point[] {
  return catmullRomSegment(p0, p1, p2, p3, segments)
}

/** Full pipeline: simplify then smooth */
export function smoothStroke(points: readonly Point[], rdpEpsilon: number, splineSegments = 4): Point[] {
  if (points.length === 0) return []
  const simplified = simplifyRDP(points, rdpEpsilon)
  if (simplified.length < 2) return simplified
  return catmullRomSpline(simplified, splineSegments)
}
