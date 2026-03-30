import type { ViewportState } from '../types.js'

export interface CanvasPair {
  container: HTMLElement
  staticCanvas: HTMLCanvasElement
  interactiveCanvas: HTMLCanvasElement
  staticCtx: CanvasRenderingContext2D
  interactiveCtx: CanvasRenderingContext2D
  getSize(): { width: number; height: number }
  getDpr(): number
  destroy(): void
}

export function createCanvasManager(container: HTMLElement, onResize?: () => void): CanvasPair {
  container.style.position = container.style.position || 'relative'
  container.style.overflow = 'hidden'
  container.style.touchAction = 'none'

  const staticCanvas = document.createElement('canvas')
  staticCanvas.style.position = 'absolute'
  staticCanvas.style.left = '0'
  staticCanvas.style.top = '0'
  staticCanvas.style.zIndex = '0'
  staticCanvas.style.pointerEvents = 'none'

  const interactiveCanvas = document.createElement('canvas')
  interactiveCanvas.style.position = 'absolute'
  interactiveCanvas.style.left = '0'
  interactiveCanvas.style.top = '0'
  interactiveCanvas.style.zIndex = '1'
  interactiveCanvas.style.pointerEvents = 'auto'

  container.appendChild(staticCanvas)
  container.appendChild(interactiveCanvas)

  const staticCtx = staticCanvas.getContext('2d', { alpha: true })
  const interactiveCtx = interactiveCanvas.getContext('2d', { alpha: true })
  if (!staticCtx || !interactiveCtx) {
    throw new Error('Bembeyaz: 2D canvas context not available')
  }

  let width = 0
  let height = 0
  let dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1

  const resize = (): void => {
    width = container.clientWidth
    height = container.clientHeight
    dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
    const bw = Math.max(1, Math.floor(width * dpr))
    const bh = Math.max(1, Math.floor(height * dpr))
    for (const c of [staticCanvas, interactiveCanvas]) {
      c.width = bw
      c.height = bh
      c.style.width = `${width}px`
      c.style.height = `${height}px`
    }
    staticCtx.setTransform(dpr, 0, 0, dpr, 0, 0)
    interactiveCtx.setTransform(dpr, 0, 0, dpr, 0, 0)
    onResize?.()
  }

  resize()

  const ro =
    typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => {
          resize()
        })
      : null
  ro?.observe(container)

  return {
    container,
    staticCanvas,
    interactiveCanvas,
    staticCtx,
    interactiveCtx,
    getSize: () => ({ width, height }),
    getDpr: () => dpr,
    destroy: () => {
      ro?.disconnect()
      staticCanvas.remove()
      interactiveCanvas.remove()
    },
  }
}

export class Viewport {
  offsetX = 0
  offsetY = 0
  zoom = 1
  minZoom = 0.05
  maxZoom = 8

  screenToWorld(screenX: number, screenY: number): { x: number; y: number } {
    return {
      x: (screenX - this.offsetX) / this.zoom,
      y: (screenY - this.offsetY) / this.zoom,
    }
  }

  worldToScreen(worldX: number, worldY: number): { x: number; y: number } {
    return {
      x: worldX * this.zoom + this.offsetX,
      y: worldY * this.zoom + this.offsetY,
    }
  }

  /** Zoom toward a screen-space anchor (e.g. cursor). factor > 1 zooms in. */
  zoomAtScreenPoint(screenX: number, screenY: number, factor: number): void {
    const world = this.screenToWorld(screenX, screenY)
    const newZoom = Math.min(this.maxZoom, Math.max(this.minZoom, this.zoom * factor))
    this.zoom = newZoom
    this.offsetX = screenX - world.x * this.zoom
    this.offsetY = screenY - world.y * this.zoom
  }

  panScreen(dx: number, dy: number): void {
    this.offsetX += dx
    this.offsetY += dy
  }

  /** Visible world AABB for a canvas of logical size w x h */
  getVisibleWorldBounds(width: number, height: number): {
    minX: number
    minY: number
    maxX: number
    maxY: number
  } {
    const a = this.screenToWorld(0, 0)
    const b = this.screenToWorld(width, height)
    return {
      minX: Math.min(a.x, b.x),
      minY: Math.min(a.y, b.y),
      maxX: Math.max(a.x, b.x),
      maxY: Math.max(a.y, b.y),
    }
  }

  toState(): ViewportState {
    return {
      offsetX: this.offsetX,
      offsetY: this.offsetY,
      zoom: this.zoom,
    }
  }

  fromState(s: ViewportState): void {
    this.offsetX = s.offsetX
    this.offsetY = s.offsetY
    this.zoom = Math.min(this.maxZoom, Math.max(this.minZoom, s.zoom))
  }
}
