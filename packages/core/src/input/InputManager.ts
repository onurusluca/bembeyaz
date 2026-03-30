import type { Viewport } from '../canvas/canvas.js'

export interface InputCallbacks {
  onToolPointerDown: (worldX: number, worldY: number, pointerId: number, e: PointerEvent) => void
  onToolPointerMove: (worldX: number, worldY: number, pointerId: number, e: PointerEvent) => void
  onToolPointerUp: (worldX: number, worldY: number, pointerId: number, e: PointerEvent) => void
  onToolPointerCancel: (pointerId: number) => void
  onToolDoubleClick: (worldX: number, worldY: number, e: MouseEvent) => void
  onPanDelta: (dx: number, dy: number) => void
  onZoomAtScreen: (screenX: number, screenY: number, factor: number) => void
  onDelete: () => void
  onUndo?: () => void
  onRedo?: () => void
  /** Ctrl/Cmd+G — group current selection. */
  onGroup?: () => void
  /** Ctrl/Cmd+Shift+G — ungroup. */
  onUngroup?: () => void
  /** Ctrl/Cmd+A — select all elements (when focus is not in a text field). */
  onSelectAll?: () => void
}

export interface InputManagerOptions {
  element: HTMLElement
  viewport: Viewport
  callbacks: InputCallbacks
  shouldForcePan?: () => boolean
  /** When false, Ctrl+Z / Ctrl+Shift+Z are left to the browser (e.g. text field). */
  shouldHandleUndoRedo?: () => boolean
}

interface TrackedPointer {
  clientX: number
  clientY: number
  pointerType: string
}

/**
 * Pointer + wheel + keyboard. Pan (middle button or space+drag) and pinch zoom override tools.
 */
export class InputManager {
  private readonly element: HTMLElement
  private readonly viewport: Viewport
  private readonly cb: InputCallbacks
  private readonly shouldForcePan: () => boolean
  private readonly shouldHandleUndoRedo: () => boolean
  private spaceDown = false
  private panPointerId: number | null = null
  private lastPan: { x: number; y: number } | null = null
  private readonly pointers = new Map<number, TrackedPointer>()
  private pinchPrevDist: number | null = null

  private readonly onPointerDownBound = (e: PointerEvent) => this.onPointerDown(e)
  private readonly onPointerMoveBound = (e: PointerEvent) => this.onPointerMove(e)
  private readonly onPointerUpBound = (e: PointerEvent) => this.onPointerUp(e)
  private readonly onPointerCancelBound = (e: PointerEvent) => this.onPointerCancel(e)
  private readonly onDoubleClickBound = (e: MouseEvent) => this.onDoubleClick(e)
  private readonly onWheelBound = (e: WheelEvent) => this.onWheel(e)
  private readonly onKeyDownBound = (e: KeyboardEvent) => this.onKeyDown(e)
  private readonly onKeyUpBound = (e: KeyboardEvent) => this.onKeyUp(e)

  constructor(opts: InputManagerOptions) {
    this.element = opts.element
    this.viewport = opts.viewport
    this.cb = opts.callbacks
    this.shouldForcePan = opts.shouldForcePan ?? (() => false)
    this.shouldHandleUndoRedo = opts.shouldHandleUndoRedo ?? (() => true)
  }

  attach(): void {
    this.element.addEventListener('pointerdown', this.onPointerDownBound)
    this.element.addEventListener('pointermove', this.onPointerMoveBound)
    this.element.addEventListener('pointerup', this.onPointerUpBound)
    this.element.addEventListener('pointercancel', this.onPointerCancelBound)
    this.element.addEventListener('dblclick', this.onDoubleClickBound)
    this.element.addEventListener('wheel', this.onWheelBound, { passive: false })
    window.addEventListener('keydown', this.onKeyDownBound)
    window.addEventListener('keyup', this.onKeyUpBound)
  }

  detach(): void {
    this.element.removeEventListener('pointerdown', this.onPointerDownBound)
    this.element.removeEventListener('pointermove', this.onPointerMoveBound)
    this.element.removeEventListener('pointerup', this.onPointerUpBound)
    this.element.removeEventListener('pointercancel', this.onPointerCancelBound)
    this.element.removeEventListener('dblclick', this.onDoubleClickBound)
    this.element.removeEventListener('wheel', this.onWheelBound)
    window.removeEventListener('keydown', this.onKeyDownBound)
    window.removeEventListener('keyup', this.onKeyUpBound)
  }

  private screenToWorld(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.element.getBoundingClientRect()
    const sx = clientX - rect.left
    const sy = clientY - rect.top
    return this.viewport.screenToWorld(sx, sy)
  }

  private updatePointer(e: PointerEvent): void {
    this.pointers.set(e.pointerId, {
      clientX: e.clientX,
      clientY: e.clientY,
      pointerType: e.pointerType,
    })
  }

  private touchPointerPositions(): { x: number; y: number }[] {
    const out: { x: number; y: number }[] = []
    const rect = this.element.getBoundingClientRect()
    for (const [, p] of this.pointers) {
      if (p.pointerType === 'touch') {
        out.push({ x: p.clientX - rect.left, y: p.clientY - rect.top })
      }
    }
    return out
  }

  private onPointerDown(e: PointerEvent): void {
    this.updatePointer(e)

    const rect = this.element.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top

    const isMiddle = e.button === 1
    const isForcedPan = this.shouldForcePan() && e.button === 0
    const isPan = isMiddle || isForcedPan || (this.spaceDown && e.button === 0)

    if (isPan) {
      e.preventDefault()
      this.panPointerId = e.pointerId
      this.lastPan = { x: sx, y: sy }
      this.element.setPointerCapture(e.pointerId)
      return
    }

    const touches = this.touchPointerPositions()
    if (touches.length >= 2) {
      e.preventDefault()
      this.pinchPrevDist = touchDistance(touches[0]!, touches[1]!)
      return
    }

    const w = this.screenToWorld(e.clientX, e.clientY)
    this.cb.onToolPointerDown(w.x, w.y, e.pointerId, e)
  }

  private onPointerMove(e: PointerEvent): void {
    this.updatePointer(e)

    const rect = this.element.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top

    if (this.panPointerId !== null && e.pointerId === this.panPointerId && this.lastPan) {
      e.preventDefault()
      const dx = sx - this.lastPan.x
      const dy = sy - this.lastPan.y
      this.lastPan = { x: sx, y: sy }
      this.cb.onPanDelta(dx, dy)
      return
    }

    const touches = this.touchPointerPositions()
    if (touches.length >= 2 && this.pinchPrevDist !== null) {
      e.preventDefault()
      const d = touchDistance(touches[0]!, touches[1]!)
      if (d > 1e-6 && this.pinchPrevDist > 1e-6) {
        const factor = d / this.pinchPrevDist
        const cx = (touches[0]!.x + touches[1]!.x) / 2
        const cy = (touches[0]!.y + touches[1]!.y) / 2
        this.cb.onZoomAtScreen(cx, cy, factor)
        this.pinchPrevDist = d
      }
      return
    }

    const w = this.screenToWorld(e.clientX, e.clientY)
    this.cb.onToolPointerMove(w.x, w.y, e.pointerId, e)
  }

  private onPointerUp(e: PointerEvent): void {
    this.pointers.delete(e.pointerId)

    if (this.panPointerId === e.pointerId) {
      e.preventDefault()
      this.panPointerId = null
      this.lastPan = null
      try {
        this.element.releasePointerCapture(e.pointerId)
      } catch {
        /* ignore */
      }
      return
    }

    const touches = this.touchPointerPositions()
    if (touches.length < 2) {
      this.pinchPrevDist = null
    }

    const w = this.screenToWorld(e.clientX, e.clientY)
    this.cb.onToolPointerUp(w.x, w.y, e.pointerId, e)
  }

  private onDoubleClick(e: MouseEvent): void {
    const w = this.screenToWorld(e.clientX, e.clientY)
    this.cb.onToolDoubleClick(w.x, w.y, e)
  }

  private onPointerCancel(e: PointerEvent): void {
    this.pointers.delete(e.pointerId)
    if (this.panPointerId === e.pointerId) {
      this.panPointerId = null
      this.lastPan = null
    }
    const touches = this.touchPointerPositions()
    if (touches.length < 2) {
      this.pinchPrevDist = null
    }
    this.cb.onToolPointerCancel(e.pointerId)
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault()
    const rect = this.element.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    const factor = e.deltaY < 0 ? 1.08 : 1 / 1.08
    this.cb.onZoomAtScreen(sx, sy, factor)
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (e.code === 'Space') {
      if (!this.spaceDown) {
        this.spaceDown = true
        this.element.style.cursor = 'grab'
      }
      if (e.target === document.body || e.target === this.element) {
        e.preventDefault()
      }
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      if (!this.shouldHandleUndoRedo()) return
      e.preventDefault()
      if (e.shiftKey) {
        this.cb.onRedo?.()
      } else {
        this.cb.onUndo?.()
      }
      return
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
      if (!this.shouldHandleUndoRedo()) return
      e.preventDefault()
      this.cb.onRedo?.()
      return
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'g') {
      const t = e.target as HTMLElement
      if (t?.tagName === 'INPUT' || t?.tagName === 'TEXTAREA' || t?.isContentEditable) return
      e.preventDefault()
      if (e.shiftKey) this.cb.onUngroup?.()
      else this.cb.onGroup?.()
      return
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
      const t = e.target as HTMLElement
      if (t?.tagName === 'INPUT' || t?.tagName === 'TEXTAREA' || t?.isContentEditable) return
      e.preventDefault()
      this.cb.onSelectAll?.()
      return
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      const t = e.target as HTMLElement
      if (t?.tagName === 'INPUT' || t?.tagName === 'TEXTAREA' || t?.isContentEditable) return
      e.preventDefault()
      this.cb.onDelete()
    }
  }

  private onKeyUp(e: KeyboardEvent): void {
    if (e.code === 'Space') {
      this.spaceDown = false
      this.element.style.cursor = ''
    }
  }
}

function touchDistance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return Math.hypot(dx, dy)
}
