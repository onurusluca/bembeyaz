import { cloneElement } from '../scene/elements.js'
import type { ToolContext } from './ToolContext.js'
import { LASER_AFTER_FADE_MS, capLaserPolylineLength, type LaserSegment } from './LaserTool.js'

/** Same capture spacing as the laser pointer trail. */
const MIN_CAPTURE_DIST = 2.5

/** Drag to remove any element whose geometry is hit (whole stroke/shape). */
export class EraserTool {
  readonly name = 'eraser' as const
  private ctx: ToolContext | null = null
  private activePointerId: number | null = null
  private segments: LaserSegment[] = []
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
    const c = this.ctx
    if (c) {
      c.setSelection([])
      c.emitSelectionChange()
    }
    this.segments.push({ points: [{ x: worldX, y: worldY, d: 0 }], upAt: null })
    this.scheduleAnimation()
    this.eraseAt(worldX, worldY)
    c?.requestInteractiveRender()
  }

  onPointerMove(worldX: number, worldY: number, pointerId: number, _e?: PointerEvent): void {
    if (this.activePointerId !== pointerId) return
    this.appendTrail(worldX, worldY)
    this.eraseAt(worldX, worldY)
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

  private appendTrail(worldX: number, worldY: number): void {
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

  private scheduleAnimation(): void {
    if (this.rafId) return
    this.rafId = requestAnimationFrame(this.tick)
  }

  private tick = (): void => {
    this.rafId = 0
    const now = Date.now()

    for (const seg of this.segments) {
      if (seg.upAt !== null) continue
      capLaserPolylineLength(seg.points)
    }

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

  private eraseAt(worldX: number, worldY: number): void {
    const c = this.ctx
    if (!c) return
    const t = c.getHitThresholdWorld() * 1.75
    const hit = c.scene.getElementAtWorldPoint(worldX, worldY, t)
    if (!hit) return
    const idx = c.scene.indexOfElement(hit.id)
    const prev = c.scene.getById(hit.id)
    if (idx < 0 || !prev) return
    const snap = cloneElement(prev)
    if (c.scene.removeElement(hit.id)) {
      c.notifyElementsRemoved([{ index: idx, element: snap }])
      c.emitSceneChange()
      c.requestStaticRender()
      c.requestInteractiveRender()
    }
  }
}
