import type { CanvasPair, Viewport } from '../canvas/canvas.js'
import type { Scene } from '../scene/Scene.js'
import type { GridStyle, Point, ToolName } from '../types.js'
import type { AABB } from '../utils/math.js'
import { renderInteractiveOverlay, renderStaticScene } from './ElementRenderer.js'
import type { PenPreviewStyle } from './ElementRenderer.js'
import type { LaserSegment } from '../tools/LaserTool.js'
import type { PresencePeer } from '../collaboration/presence.js'

export interface RenderLoopOptions {
  canvas: CanvasPair
  viewport: Viewport
  scene: Scene
  backgroundColor: string
  gridEnabled: boolean
  gridStyle: GridStyle
  getSelection: () => readonly string[]
  getPenPreview: () => readonly Point[] | null
  getPenPreviewStyle: () => PenPreviewStyle | null
  getShapePreview: () => import('../types.js').Element | null
  getActiveTool: () => ToolName
  /** Select-tool marquee in world space, or null. */
  getMarqueeRect: () => AABB | null
  /** Active laser pointer trails; null when laser tool is not in use. */
  getLaserSegments: () => readonly LaserSegment[] | null
  /** Eraser drag trail; null when eraser tool is not in use. */
  getEraserSegments: () => readonly LaserSegment[] | null
  /** Presence-backed cursors for remote users (same data as `getPresence` / Realtime). */
  getPresenceRender?: () => { localUserId: string; peers: readonly PresencePeer[] }
  /** Remote laser segments from `Bembeyaz.applyRemoteLaser`. */
  getRemoteLaserRender?: () => readonly { userId: string; color: string; segments: readonly LaserSegment[] }[]
  getConnectorPlacementPreview?: () => { sourceId: string; hover: import('../types.js').Point } | null
}

export class RenderLoop {
  private raf = 0
  private dirtyStatic = true
  private dirtyInteractive = true

  constructor(private readonly opts: RenderLoopOptions) {}

  updateOptions(patch: Partial<RenderLoopOptions>): void {
    Object.assign(this.opts, patch)
  }

  requestStatic(): void {
    this.dirtyStatic = true
    this.schedule()
  }

  requestInteractive(): void {
    this.dirtyInteractive = true
    this.schedule()
  }

  requestAll(): void {
    this.dirtyStatic = true
    this.dirtyInteractive = true
    this.schedule()
  }

  flush(): void {
    this.dirtyStatic = true
    this.dirtyInteractive = true
    this.renderNow()
  }

  destroy(): void {
    if (this.raf) {
      cancelAnimationFrame(this.raf)
      this.raf = 0
    }
  }

  private schedule(): void {
    if (this.raf) return
    this.raf = requestAnimationFrame(() => {
      this.raf = 0
      this.renderFrame()
    })
  }

  private renderNow(): void {
    this.renderFrame()
  }

  private renderFrame(): void {
    const o = this.opts
    if (this.dirtyStatic) {
      renderStaticScene({
        canvas: o.canvas,
        viewport: o.viewport,
        scene: o.scene,
        elements: o.scene.getElements(),
        backgroundColor: o.backgroundColor,
        gridEnabled: o.gridEnabled,
        gridStyle: o.gridStyle,
        onImageDecoded: () => {
          this.dirtyStatic = true
          this.schedule()
        },
      })
      o.scene.markClean()
      this.dirtyStatic = false
    }
    if (this.dirtyInteractive) {
      const active = o.getActiveTool()
      const laserSegs = o.getLaserSegments?.() ?? null
      const eraserSegs = active === 'eraser' ? (o.getEraserSegments?.() ?? null) : null
      renderInteractiveOverlay({
        canvas: o.canvas,
        viewport: o.viewport,
        selection: [...o.getSelection()],
        scene: o.scene,
        penPreview: active === 'pen' ? o.getPenPreview() : null,
        penPreviewStyle: active === 'pen' ? (o.getPenPreviewStyle?.() ?? null) : null,
        shapePreview:
          active === 'pen' || active === 'select' || active === 'laser' || active === 'image'
            ? null
            : o.getShapePreview(),
        marqueeRect: active === 'select' ? o.getMarqueeRect?.() ?? null : null,
        laserSegments: laserSegs,
        eraserSegments: eraserSegs,
        laserNow: Date.now(),
        connectorPlacementPreview: o.getConnectorPlacementPreview?.() ?? null,
        remotePresence: o.getPresenceRender?.(),
        remoteLaser: o.getRemoteLaserRender?.(),
      })
      this.dirtyInteractive = false
    }
  }
}
