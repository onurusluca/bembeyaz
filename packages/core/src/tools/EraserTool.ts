import { cloneElement } from '../scene/elements.js'
import type { ToolContext } from './ToolContext.js'

/** Drag to remove any element whose geometry is hit (whole stroke/shape). */
export class EraserTool {
  readonly name = 'eraser' as const
  private ctx: ToolContext | null = null
  private activePointerId: number | null = null

  setContext(ctx: ToolContext): void {
    this.ctx = ctx
  }

  onPointerDown(worldX: number, worldY: number, pointerId: number, _e?: PointerEvent): void {
    if (this.activePointerId !== null) return
    this.activePointerId = pointerId
    const c = this.ctx
    if (c) {
      c.setSelection([])
      c.emitSelectionChange()
    }
    this.eraseAt(worldX, worldY)
  }

  onPointerMove(worldX: number, worldY: number, pointerId: number, _e?: PointerEvent): void {
    if (this.activePointerId !== pointerId) return
    this.eraseAt(worldX, worldY)
  }

  onPointerUp(_worldX: number, _worldY: number, pointerId: number, _e?: PointerEvent): void {
    if (this.activePointerId !== pointerId) return
    this.activePointerId = null
  }

  onPointerCancel(): void {
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
