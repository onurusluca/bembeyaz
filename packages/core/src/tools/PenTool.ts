import type { Point } from '../types.js'
import { createPathElement, defaultElementStyle } from '../scene/elements.js'
import { smoothStroke } from '../utils/smoothing.js'
import type { ToolContext } from './ToolContext.js'

const RDP_EPSILON = 2.5
const SPLINE_SEGMENTS = 6

export class PenTool {
  readonly name = 'pen' as const
  private ctx: ToolContext | null = null
  private points: Point[] = []
  private activePointerId: number | null = null

  setContext(ctx: ToolContext): void {
    this.ctx = ctx
  }

  getPreviewPoints(): readonly Point[] {
    return this.points
  }

  isDrawing(): boolean {
    return this.activePointerId !== null
  }

  onPointerDown(worldX: number, worldY: number, pointerId: number, _e?: PointerEvent): void {
    if (this.activePointerId !== null) return
    this.activePointerId = pointerId
    this.points = [{ x: worldX, y: worldY }]
    this.ctx?.requestInteractiveRender()
  }

  onPointerMove(worldX: number, worldY: number, pointerId: number, _e?: PointerEvent): void {
    if (this.activePointerId !== pointerId) return
    this.points.push({ x: worldX, y: worldY })
    this.ctx?.requestInteractiveRender()
  }

  onPointerUp(worldX: number, worldY: number, pointerId: number, _e?: PointerEvent): void {
    if (this.activePointerId !== pointerId) return
    this.activePointerId = null
    const c = this.ctx
    if (!c) return
    this.points.push({ x: worldX, y: worldY })
    const pen = c.getPenOptions()
    const smoothed = smoothStroke(this.points, RDP_EPSILON, SPLINE_SEGMENTS)
    this.points = []
    if (smoothed.length < 2) {
      c.requestInteractiveRender()
      return
    }
    const style = defaultElementStyle({
      stroke: pen.color,
      strokeWidth: pen.strokeWidth,
      opacity: pen.opacity,
      strokeDash: pen.strokeDash,
    })
    const el = createPathElement(smoothed, style)
    c.scene.addElement(el)
    c.notifyElementAdded(el.id)
    c.emitSceneChange()
    c.requestStaticRender()
    c.requestInteractiveRender()
  }

  onPointerCancel(): void {
    this.activePointerId = null
    this.points = []
    this.ctx?.requestInteractiveRender()
  }
}
