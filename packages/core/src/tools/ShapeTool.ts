import { createAttachedArrowElement, defaultElementStyle, normalizeRect } from '../scene/elements.js'
import type { Element, ToolName } from '../types.js'
import { createId } from '../utils/id.js'
import type { ToolContext } from './ToolContext.js'

type ShapeToolName = Extract<ToolName, 'rectangle' | 'ellipse' | 'line' | 'arrow'>

const MIN_SHAPE_SIZE = 1

function isConnectable(el: Element | undefined): boolean {
  if (!el) return false
  return (
    el.type === 'rectangle' ||
    el.type === 'ellipse' ||
    el.type === 'text' ||
    el.type === 'image'
  )
}

export class ShapeTool {
  readonly name: ShapeToolName
  private ctx: ToolContext | null = null
  private activePointerId: number | null = null
  private start: { x: number; y: number } | null = null
  private current: { x: number; y: number } | null = null
  /** Arrow tool: first shape for two-click attach; hover tracks pointer for preview. */
  private arrowConnectSourceId: string | null = null
  private arrowConnectHover: { x: number; y: number } | null = null

  constructor(name: ShapeToolName) {
    this.name = name
  }

  setContext(ctx: ToolContext): void {
    this.ctx = ctx
  }

  /** Two-click attach preview (arrow tool only). */
  getArrowConnectPreview(): { sourceId: string; hover: { x: number; y: number } } | null {
    if (this.name !== 'arrow' || !this.arrowConnectSourceId || !this.arrowConnectHover) return null
    return { sourceId: this.arrowConnectSourceId, hover: this.arrowConnectHover }
  }

  getPreviewElement(): Element | null {
    if (this.name === 'arrow' && this.arrowConnectSourceId) return null
    if (this.start && this.current) return this.buildElement(this.start, this.current, false)
    return null
  }

  /** Clear arrow attach preview (e.g. pointer left canvas). */
  clearHover(): void {
    if (this.arrowConnectSourceId === null) return
    this.arrowConnectSourceId = null
    this.arrowConnectHover = null
    this.ctx?.requestInteractiveRender()
  }

  onPointerDown(worldX: number, worldY: number, pointerId: number, _e?: PointerEvent): void {
    if (this.name === 'arrow') {
      const done = this.handleArrowConnectPointerDown(worldX, worldY, pointerId)
      if (done) return
    }
    if (this.activePointerId !== null) return
    this.activePointerId = pointerId
    this.start = { x: worldX, y: worldY }
    this.current = { x: worldX, y: worldY }
    this.ctx?.requestInteractiveRender()
  }

  /**
   * Two-click attach: first click picks source shape, second click on another shape completes.
   * Returns true if the event was consumed (no freehand drag on this down).
   */
  private handleArrowConnectPointerDown(worldX: number, worldY: number, pointerId: number): boolean {
    const c = this.ctx
    if (!c) return false
    const hit = c.scene.getElementAtWorldPoint(worldX, worldY, c.getHitThresholdWorld())

    if (this.arrowConnectSourceId) {
      if (hit && isConnectable(hit) && hit.id !== this.arrowConnectSourceId) {
        const pen = c.getPenOptions()
        const style = defaultElementStyle({
          stroke: pen?.color ?? '#111111',
          fill: 'transparent',
          strokeWidth: pen?.strokeWidth ?? 2,
          opacity: pen?.opacity ?? 1,
          strokeDash: pen?.strokeDash ?? 'solid',
        })
        const el = createAttachedArrowElement(this.arrowConnectSourceId, hit.id, style)
        c.scene.addElement(el)
        c.notifyElementAdded(el.id)
        c.setSelection([el.id])
        c.emitSelectionChange()
        c.emitSceneChange()
        c.setTool('select')
        c.requestStaticRender()
        c.requestInteractiveRender()
        this.arrowConnectSourceId = null
        this.arrowConnectHover = null
        return true
      }
      if (hit && hit.id === this.arrowConnectSourceId) {
        this.arrowConnectHover = { x: worldX, y: worldY }
        c.requestInteractiveRender()
        return true
      }
      c.setSelection([])
      c.emitSelectionChange()
      this.arrowConnectSourceId = null
      this.arrowConnectHover = null
      return false
    }

    if (hit && isConnectable(hit)) {
      this.arrowConnectSourceId = hit.id
      this.arrowConnectHover = { x: worldX, y: worldY }
      c.setSelection([hit.id])
      c.emitSelectionChange()
      c.requestInteractiveRender()
      return true
    }

    return false
  }

  onPointerMove(worldX: number, worldY: number, pointerId: number, _e?: PointerEvent): void {
    if (this.name === 'arrow' && this.arrowConnectSourceId && this.activePointerId === null) {
      this.arrowConnectHover = { x: worldX, y: worldY }
      this.ctx?.requestInteractiveRender()
      return
    }
    if (this.activePointerId === null) return
    if (this.activePointerId !== pointerId || !this.start) return
    this.current = { x: worldX, y: worldY }
    this.ctx?.requestInteractiveRender()
  }

  onPointerUp(worldX: number, worldY: number, pointerId: number, _e?: PointerEvent): void {
    if (this.activePointerId !== pointerId || !this.start) return
    const c = this.ctx
    this.activePointerId = null
    this.current = { x: worldX, y: worldY }
    if (!c) return
    const el = this.buildElement(this.start, this.current, true)
    this.start = null
    this.current = null
    if (!el) {
      c.requestInteractiveRender()
      return
    }
    c.scene.addElement(el)
    c.notifyElementAdded(el.id)
    c.setSelection([el.id])
    c.emitSelectionChange()
    c.emitSceneChange()
    c.setTool('select')
    c.requestStaticRender()
    c.requestInteractiveRender()
  }

  onPointerCancel(): void {
    this.activePointerId = null
    this.start = null
    this.current = null
    this.arrowConnectSourceId = null
    this.arrowConnectHover = null
    this.ctx?.requestInteractiveRender()
  }

  private buildElement(
    start: { x: number; y: number },
    end: { x: number; y: number },
    enforceMinSize: boolean,
  ): Element | null {
    const pen = this.ctx?.getPenOptions()
    const style = defaultElementStyle({
      stroke: pen?.color ?? '#111111',
      fill: pen?.fill ?? 'transparent',
      strokeWidth: pen?.strokeWidth ?? 2,
      opacity: pen?.opacity ?? 1,
      strokeDash: pen?.strokeDash ?? 'solid',
    })
    if (this.name === 'rectangle' || this.name === 'ellipse') {
      const rect = normalizeRect(start.x, start.y, end.x, end.y)
      if (enforceMinSize && (rect.width < MIN_SHAPE_SIZE || rect.height < MIN_SHAPE_SIZE)) {
        return null
      }
      return {
        id: enforceMinSize ? createId() : `preview:${this.name}`,
        version: 1,
        type: this.name,
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        style,
      }
    }
    const dx = end.x - start.x
    const dy = end.y - start.y
    if (enforceMinSize && Math.hypot(dx, dy) < MIN_SHAPE_SIZE) {
      return null
    }
    return {
      id: enforceMinSize ? createId() : `preview:${this.name}`,
      version: 1,
      type: this.name,
      x1: start.x,
      y1: start.y,
      x2: end.x,
      y2: end.y,
      style,
    }
  }
}
