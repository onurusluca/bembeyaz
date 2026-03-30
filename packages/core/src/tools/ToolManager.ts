import type { Point, ShapeToolName, ToolName } from '../types.js'
import { SHAPE_TOOL_NAMES } from '../types.js'
import type { ToolContext } from './ToolContext.js'
import { PenTool } from './PenTool.js'
import { ShapeTool } from './ShapeTool.js'
import { SelectTool } from './SelectTool.js'
import { EraserTool } from './EraserTool.js'
import { LaserTool } from './LaserTool.js'
import { ImageTool } from './ImageTool.js'

type AnyTool = PenTool | SelectTool | ShapeTool | EraserTool | LaserTool

export class ToolManager {
  private active: ToolName = 'pen'
  readonly pen = new PenTool()
  readonly select = new SelectTool()
  readonly eraser = new EraserTool()
  readonly laser = new LaserTool()
  readonly rectangle = new ShapeTool('rectangle')
  readonly ellipse = new ShapeTool('ellipse')
  readonly line = new ShapeTool('line')
  readonly arrow = new ShapeTool('arrow')
  /** Not in `byName` — canvas does not route image tool; shell handles placement. */
  readonly image = new ImageTool()

  /** Same order as `SHAPE_TOOL_NAMES` — used for batch hover/preview helpers. */
  private readonly shapeTools = [this.rectangle, this.ellipse, this.line, this.arrow] as const
  private readonly byName: Record<Exclude<ToolName, 'text' | 'image'>, AnyTool>

  constructor(private readonly ctx: ToolContext) {
    this.byName = {
      pen: this.pen,
      select: this.select,
      eraser: this.eraser,
      laser: this.laser,
      rectangle: this.rectangle,
      ellipse: this.ellipse,
      line: this.line,
      arrow: this.arrow,
    }
    for (const t of Object.values(this.byName)) t.setContext(ctx)
    this.image.setContext(ctx)
  }

  setTool(name: ToolName): void {
    if (this.active === name) return
    if (this.active !== 'text' && this.active !== 'image') this.byName[this.active].onPointerCancel()
    this.active = name
  }

  getActiveToolName(): ToolName {
    return this.active
  }

  onPointerDown(worldX: number, worldY: number, pointerId: number, e?: PointerEvent): void {
    if (this.active === 'text') {
      if (!this.ctx.isTextEditing()) {
        this.ctx.beginTextPlacement(worldX, worldY, pointerId)
      }
      return
    }
    if (this.active === 'image') return
    this.byName[this.active].onPointerDown(worldX, worldY, pointerId, e)
  }

  onPointerMove(worldX: number, worldY: number, pointerId: number, e?: PointerEvent): void {
    if (this.active === 'text' || this.active === 'image') return
    this.byName[this.active].onPointerMove(worldX, worldY, pointerId, e)
  }

  onPointerUp(worldX: number, worldY: number, pointerId: number, e?: PointerEvent): void {
    if (this.active === 'text' || this.active === 'image') return
    this.byName[this.active].onPointerUp(worldX, worldY, pointerId, e)
  }

  getMarqueeRect(): import('../utils/math.js').AABB | null {
    if (this.active !== 'select') return null
    return this.select.getMarqueeRect()
  }

  getSelectBodyDragCursor(worldX: number, worldY: number): string | null {
    if (this.active !== 'select') return null
    return this.select.getBodyDragCursorHint(worldX, worldY)
  }

  onPointerCancel(): void {
    if (this.active === 'text' || this.active === 'image') return
    this.byName[this.active].onPointerCancel()
  }

  onDoubleClick(worldX: number, worldY: number): void {
    if (this.active === 'select') this.select.onDoubleClick(worldX, worldY)
  }

  /** Live shape preview while dragging, or null if not a shape tool. */
  getShapePreview(): import('../types.js').Element | null {
    const i = SHAPE_TOOL_NAMES.indexOf(this.active as ShapeToolName)
    return i >= 0 ? this.shapeTools[i]!.getPreviewElement() : null
  }

  /** Arrow tool: dashed line from first shape toward pointer before second click. */
  getArrowConnectPreview(): { sourceId: string; hover: Point } | null {
    if (this.active !== 'arrow') return null
    return this.arrow.getArrowConnectPreview()
  }

  /** @deprecated alias for RenderLoop — use `getArrowConnectPreview`. */
  getConnectorPlacementPreview(): { sourceId: string; hover: Point } | null {
    return this.getArrowConnectPreview()
  }

  /** Resize-handle hover / active resize cursor when select tool is active; otherwise null. */
  getSelectResizeHoverCursor(worldX: number, worldY: number): string | null {
    if (this.active !== 'select') return null
    return this.select.getResizeCursorHint(worldX, worldY)
  }

  clearShapeHover(): void {
    for (const s of this.shapeTools) s.clearHover()
  }

  destroy(): void {
    this.laser.destroy()
  }
}
