import type { ToolContext } from './ToolContext.js'

/** World-units of trail kept while actively drawing (~3s at a moderate pace). */
export const LASER_MAX_LENGTH = 550

/** How long (ms) the remaining trail fades out after the pointer is released. */
export const LASER_AFTER_FADE_MS = 900

/** Minimum world-unit distance between captured points (reduces jagged points). */
const MIN_CAPTURE_DIST = 2.5

export interface LaserPoint {
  x: number
  y: number
  /** Cumulative world-space distance from the start of this segment. */
  d: number
}

export interface LaserSegment {
  points: LaserPoint[]
  /** Timestamp when pointer was released; null while still drawing. */
  upAt: number | null
}

export class LaserTool {
  readonly name = 'laser' as const
  private ctx: ToolContext | null = null
  private segments: LaserSegment[] = []
  private activePointerId: number | null = null
  private rafId = 0

  setContext(ctx: ToolContext): void {
    this.ctx = ctx
  }

  getSegments(): readonly LaserSegment[] {
    return this.segments
  }

  onPointerDown(worldX: number, worldY: number, pointerId: number, _e?: PointerEvent): void {
    if (this.activePointerId !== null) return
    this.activePointerId = pointerId
    this.segments.push({ points: [{ x: worldX, y: worldY, d: 0 }], upAt: null })
    this.scheduleAnimation()
    this.ctx?.requestInteractiveRender()
  }

  onPointerMove(worldX: number, worldY: number, pointerId: number, _e?: PointerEvent): void {
    if (this.activePointerId !== pointerId) return
    const seg = this.segments[this.segments.length - 1]
    if (!seg) return
    const last = seg.points[seg.points.length - 1]!
    const dx = worldX - last.x
    const dy = worldY - last.y
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist < MIN_CAPTURE_DIST) return
    seg.points.push({ x: worldX, y: worldY, d: last.d + dist })
    this.ctx?.requestInteractiveRender()
  }

  onPointerUp(worldX: number, worldY: number, pointerId: number, _e?: PointerEvent): void {
    if (this.activePointerId !== pointerId) return
    this.activePointerId = null
    const seg = this.segments[this.segments.length - 1]
    if (seg) {
      const last = seg.points[seg.points.length - 1]!
      const dx = worldX - last.x
      const dy = worldY - last.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist >= MIN_CAPTURE_DIST) {
        seg.points.push({ x: worldX, y: worldY, d: last.d + dist })
      }
      seg.upAt = Date.now()
    }
    this.ctx?.requestInteractiveRender()
  }

  onPointerCancel(): void {
    this.activePointerId = null
    const seg = this.segments[this.segments.length - 1]
    if (seg && seg.upAt === null) seg.upAt = Date.now()
    this.ctx?.requestInteractiveRender()
  }

  private scheduleAnimation(): void {
    if (this.rafId) return
    this.rafId = requestAnimationFrame(this.tick)
  }

  private tick = (): void => {
    this.rafId = 0
    const now = Date.now()

    for (const seg of this.segments) {
      if (seg.upAt !== null) continue
      // Prune tail of active segments beyond the length window
      const pts = seg.points
      if (pts.length < 2) continue
      const totalD = pts[pts.length - 1]!.d
      const minKeepD = totalD - LASER_MAX_LENGTH
      if (minKeepD > 0) {
        const idx = pts.findIndex((p) => p.d >= minKeepD)
        // Keep one extra point before the cutoff for a smooth fade start
        if (idx > 1) pts.splice(0, idx - 1)
      }
    }

    // Remove completed segments that have fully faded
    this.segments = this.segments.filter(
      (seg) => seg.upAt === null || now - seg.upAt < LASER_AFTER_FADE_MS,
    )

    this.ctx?.requestInteractiveRender()

    if (this.segments.length > 0 || this.activePointerId !== null) {
      this.rafId = requestAnimationFrame(this.tick)
    }
  }

  destroy(): void {
    if (this.rafId) cancelAnimationFrame(this.rafId)
    this.rafId = 0
    this.segments = []
    this.activePointerId = null
  }
}
