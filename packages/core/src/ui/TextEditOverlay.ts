import type { Viewport } from '../canvas/canvas.js'
import { isAttachedArrow, resolveAttachedArrow } from '../scene/connectorGeometry.js'
import { cloneElement, createTextElement } from '../scene/elements.js'
import type { Scene } from '../scene/Scene.js'
import type { Element, TextAlign, TextElement } from '../types.js'
import { measureTextContentBounds } from '../utils/textMeasure.js'

export interface TextPlacementStyle {
  color: string
  strokeColor: string
  strokeWidth: number
  fontFamily: string
  fontSize: number
  textAlign: TextAlign
  opacity: number
}

export interface TextCommitInfo {
  kind: 'create' | 'edit' | 'connector-edit'
  /** Set when a new element was added */
  elementId: string | null
}

export interface TextEditOverlayOptions {
  /** Where the overlay layer is mounted (often the app wrap, above the dock). */
  container: HTMLElement
  /** World→screen coords are relative to this element (the canvas container). */
  positionAnchor: HTMLElement
  viewport: Viewport
  getScene: () => Scene
  getTextPlacementStyle: () => TextPlacementStyle
  onCommitted: (info: TextCommitInfo) => void
  notifyElementAdded?: (id: string) => void
  notifyElementsRemoved?: (snapshots: { index: number; element: Element }[]) => void
  notifyElementUpdated?: (before: Element, after: Element) => void
}

/**
 * Screen-space textarea aligned to world coordinates for WYSIWYG text entry.
 */
export class TextEditOverlay {
  private readonly container: HTMLElement
  private readonly positionAnchor: HTMLElement
  private readonly viewport: Viewport
  private readonly getScene: () => Scene
  private readonly getTextPlacementStyle: () => TextPlacementStyle
  private readonly onCommitted: (info: TextCommitInfo) => void
  private readonly notifyElementAdded?: (id: string) => void
  private readonly notifyElementsRemoved?: (snapshots: { index: number; element: Element }[]) => void
  private readonly notifyElementUpdated?: (before: Element, after: Element) => void

  private skipBlurCommit = false
  private resizeObserver: ResizeObserver | null = null
  private layer: HTMLDivElement | null = null
  private textarea: HTMLTextAreaElement | null = null
  private mode: 'create' | 'edit' | 'connector-edit' | null = null
  private worldX = 0
  private worldY = 0
  private editId: string | null = null
  private snapshot = ''
  /** Wait for the opening pointer to finish so focus is not stolen by pointerup on the canvas. */
  private detachPointerUpForFocus: (() => void) | null = null
  /** Ignore until the opening gesture has finished (so the same click does not dismiss). */
  private acceptOutsideDismiss = false
  private boundOutsidePointerDown: ((e: PointerEvent) => void) | null = null

  constructor(opts: TextEditOverlayOptions) {
    this.container = opts.container
    this.positionAnchor = opts.positionAnchor
    this.viewport = opts.viewport
    this.getScene = opts.getScene
    this.getTextPlacementStyle = opts.getTextPlacementStyle
    this.onCommitted = opts.onCommitted
    this.notifyElementAdded = opts.notifyElementAdded
    this.notifyElementsRemoved = opts.notifyElementsRemoved
    this.notifyElementUpdated = opts.notifyElementUpdated
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.syncFromViewport())
      this.resizeObserver.observe(this.container)
      if (this.positionAnchor !== this.container) {
        this.resizeObserver.observe(this.positionAnchor)
      }
    }
  }

  isActive(): boolean {
    return this.mode !== null
  }

  /** Remove overlay without changing scene (e.g. whiteboard teardown). */
  dispose(): void {
    this.clearPointerUpForFocus()
    this.detachOutsideDismissListener()
    this.resizeObserver?.disconnect()
    this.resizeObserver = null
    this.skipBlurCommit = true
    this.mode = null
    this.editId = null
    this.snapshot = ''
    this.teardownDomOnly()
    this.skipBlurCommit = false
  }

  cancel(): void {
    this.clearPointerUpForFocus()
    this.detachOutsideDismissListener()
    this.skipBlurCommit = true
    if (!this.mode) {
      this.teardown()
      return
    }
    if (this.mode === 'edit' && this.editId) {
      const id = this.editId
      const snap = this.snapshot
      this.getScene().updateElement(id, (el) => {
        if (el.type !== 'text') return el
        return { ...el, text: snap }
      })
    }
    if (this.mode === 'connector-edit' && this.editId) {
      const id = this.editId
      const snap = this.snapshot
      this.getScene().updateElement(id, (el) => {
        if (el.type !== 'arrow' || !isAttachedArrow(el)) return el
        return { ...el, label: snap }
      })
    }
    this.teardown()
  }

  syncFromViewport(): void {
    if (!this.textarea || !this.layer) return
    this.applyLayout()
  }

  beginPlacement(worldX: number, worldY: number, pointerId?: number): void {
    if (this.isActive()) this.cancel()
    this.acceptOutsideDismiss = false
    this.mode = 'create'
    this.worldX = worldX
    this.worldY = worldY
    this.editId = null
    this.snapshot = ''
    this.ensureDom('')
    this.applyLayout()
    this.scheduleFocusAfterPointer(pointerId)
  }

  beginConnectorLabelEdit(elementId: string): void {
    const el = this.getScene().getById(elementId)
    if (!el || el.type !== 'arrow' || !isAttachedArrow(el)) return
    if (this.isActive()) this.cancel()
    this.acceptOutsideDismiss = false
    this.mode = 'connector-edit'
    this.editId = elementId
    const r = resolveAttachedArrow(this.getScene(), el)
    if (!r) return
    this.worldX = r.labelPoint.x - 48
    this.worldY = r.labelPoint.y - 14
    this.snapshot = el.label ?? ''
    this.ensureDom(el.label ?? '')
    this.applyLayout()
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const ta = this.textarea
        if (!ta) return
        ta.focus({ preventScroll: true })
        ta.setSelectionRange(ta.value.length, ta.value.length)
        this.acceptOutsideDismiss = true
      })
    })
  }

  beginEdit(elementId: string): void {
    const el = this.getScene().getById(elementId)
    if (!el || el.type !== 'text') return
    if (this.isActive()) this.cancel()
    this.acceptOutsideDismiss = false
    this.mode = 'edit'
    this.editId = elementId
    this.worldX = el.x
    this.worldY = el.y
    this.snapshot = el.text
    this.ensureDom(el.text)
    this.applyLayout()
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const ta = this.textarea
        if (!ta) return
        ta.focus({ preventScroll: true })
        ta.setSelectionRange(ta.value.length, ta.value.length)
        this.acceptOutsideDismiss = true
      })
    })
  }

  private ensureDom(initial: string): void {
    this.detachOutsideDismissListener()
    this.teardownDomOnly()
    const layer = document.createElement('div')
    layer.className = 'bbz-text-edit-layer'
    layer.style.cssText = [
      'position:absolute',
      'left:0',
      'top:0',
      'right:0',
      'bottom:0',
      'pointer-events:none',
      'z-index:40',
    ].join(';')
    const ta = document.createElement('textarea')
    ta.className = 'bbz-text-edit'
    ta.value = initial
    ta.setAttribute('aria-label', 'Text')
    ta.style.cssText = [
      'position:absolute',
      'pointer-events:auto',
      'margin:0',
      'padding:2px 4px',
      'resize:none',
      'overflow:hidden',
      'border:1px solid #3a91f7',
      'border-radius:4px',
      'background:rgba(255,255,255,0.96)',
      'box-shadow:0 4px 14px rgba(22,34,50,0.12)',
      'outline:none',
      'line-height:1.25',
      'min-width:120px',
      'min-height:1.25em',
      'box-sizing:border-box',
    ].join(';')
    ta.addEventListener('input', () => this.autosize())
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        this.cancel()
      }
    })
    ta.addEventListener('blur', () => {
      window.setTimeout(() => this.commitFromBlur(), 0)
    })
    layer.appendChild(ta)
    this.container.appendChild(layer)
    this.layer = layer
    this.textarea = ta
    this.autosize()
    this.attachOutsideDismissListener()
  }

  private clearPointerUpForFocus(): void {
    this.detachPointerUpForFocus?.()
    this.detachPointerUpForFocus = null
  }

  /**
   * Focus after the pointer that opened the editor has released; avoids the canvas
   * stealing focus back on pointerup and firing a bogus blur → immediate commit.
   */
  private scheduleFocusAfterPointer(pointerId?: number): void {
    this.clearPointerUpForFocus()
    const onDone = (ev: PointerEvent): void => {
      if (pointerId !== undefined && ev.pointerId !== pointerId) return
      this.clearPointerUpForFocus()
      queueMicrotask(() => {
        const ta = this.textarea
        if (!ta || !this.mode) return
        ta.focus({ preventScroll: true })
        this.acceptOutsideDismiss = true
      })
    }
    window.addEventListener('pointerup', onDone, true)
    window.addEventListener('pointercancel', onDone, true)
    this.detachPointerUpForFocus = () => {
      window.removeEventListener('pointerup', onDone, true)
      window.removeEventListener('pointercancel', onDone, true)
    }
  }

  /**
   * Layer is pointer-events:none except the textarea; clicks on the board hit the canvas and
   * often do not blur the textarea. Dismiss (commit) on any pointerdown outside the textarea.
   */
  private attachOutsideDismissListener(): void {
    this.detachOutsideDismissListener()
    this.boundOutsidePointerDown = (e: PointerEvent) => {
      if (!this.mode || !this.textarea || !this.acceptOutsideDismiss) return
      const t = e.target
      if (t instanceof Node && (this.textarea === t || this.textarea.contains(t))) return
      this.commit()
    }
    window.addEventListener('pointerdown', this.boundOutsidePointerDown, true)
  }

  private detachOutsideDismissListener(): void {
    if (this.boundOutsidePointerDown) {
      window.removeEventListener('pointerdown', this.boundOutsidePointerDown, true)
      this.boundOutsidePointerDown = null
    }
  }

  private commitFromBlur(): void {
    if (this.skipBlurCommit) {
      this.skipBlurCommit = false
      return
    }
    if (!this.mode || !this.textarea) return
    const ta = this.textarea
    const active = document.activeElement
    if (active === ta || (this.layer && active && this.layer.contains(active))) return
    this.commit()
  }

  private commit(): void {
    if (!this.mode || !this.textarea) {
      this.teardown()
      return
    }
    const ta = this.textarea
    const text = ta.value
    const zoom = this.viewport.zoom
    const wScreen = Math.max(ta.offsetWidth, 40)
    const hScreen = Math.max(ta.offsetHeight, 24)
    const widthWorld = wScreen / zoom
    const heightWorld = hScreen / zoom
    const placement = this.getTextPlacementStyle()

    const kind = this.mode === 'connector-edit' ? 'connector-edit' : this.mode
    const editId = this.editId
    let createdId: string | null = null
    const scene = this.getScene()

    if (kind === 'create') {
      if (text.trim().length > 0) {
        const el = createTextElement(this.worldX, this.worldY, text, {
          fontSize: placement.fontSize,
          fontFamily: placement.fontFamily,
          color: placement.color,
          strokeColor: placement.strokeColor,
          strokeWidth: placement.strokeWidth,
          textAlign: placement.textAlign,
          opacity: placement.opacity,
          width: widthWorld,
          height: heightWorld,
        })
        const c = measureTextContentBounds(el)
        const normalized: TextElement = {
          ...el,
          width: Math.max(el.width, c.width),
          height: Math.max(el.height, c.height),
        }
        scene.addElement(normalized)
        this.notifyElementAdded?.(normalized.id)
        createdId = normalized.id
      }
    } else if (kind === 'connector-edit' && editId) {
      const beforeEl = scene.getById(editId)
      if (beforeEl?.type === 'arrow' && isAttachedArrow(beforeEl)) {
        const beforeSnap = cloneElement(beforeEl)
        scene.updateElement(editId, (el) => {
          if (el.type !== 'arrow' || !isAttachedArrow(el)) return el
          return { ...el, label: text }
        })
        const afterEl = scene.getById(editId)
        if (afterEl) this.notifyElementUpdated?.(beforeSnap, afterEl)
      }
    } else if (editId) {
      if (text.trim().length === 0) {
        const idx = scene.indexOfElement(editId)
        const prev = scene.getById(editId)
        if (idx >= 0 && prev) {
          const snap = cloneElement(prev)
          scene.removeElement(editId)
          this.notifyElementsRemoved?.([{ index: idx, element: snap }])
        }
      } else {
        const beforeEl = scene.getById(editId)
        if (beforeEl && beforeEl.type === 'text') {
          const beforeSnap = cloneElement(beforeEl)
          scene.updateElement(editId, (el) => {
            if (el.type !== 'text') return el
            const next: TextElement = {
              ...el,
              text,
              width: widthWorld,
              height: heightWorld,
            }
            const c = measureTextContentBounds(next)
            return {
              ...next,
              width: Math.max(next.width, c.width),
              height: Math.max(next.height, c.height),
            }
          })
          const afterEl = scene.getById(editId)
          if (afterEl) this.notifyElementUpdated?.(beforeSnap, afterEl)
        }
      }
    }
    this.teardown()
    this.onCommitted({
      kind,
      elementId: kind === 'create' ? createdId : editId,
    })
  }

  private autosize(): void {
    const ta = this.textarea
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.max(ta.scrollHeight, 28)}px`
  }

  /** Map canvas-local screen coords into `container` when the overlay is mounted on the app shell. */
  private canvasOffsetInOverlay(): { dx: number; dy: number } {
    if (this.positionAnchor === this.container) return { dx: 0, dy: 0 }
    const cr = this.container.getBoundingClientRect()
    const ar = this.positionAnchor.getBoundingClientRect()
    return { dx: ar.left - cr.left, dy: ar.top - cr.top }
  }

  private applyLayout(): void {
    const ta = this.textarea
    if (!ta) return
    const zoom = this.viewport.zoom
    const { width: cw } = this.container.getBoundingClientRect()
    const placement = this.getTextPlacementStyle()

    if (this.mode === 'connector-edit' && this.editId) {
      const e = this.getScene().getById(this.editId)
      if (e?.type === 'arrow' && isAttachedArrow(e)) {
        const r = resolveAttachedArrow(this.getScene(), e)
        if (r) {
          this.worldX = r.labelPoint.x - 48
          this.worldY = r.labelPoint.y - 14
        }
      }
    }
    let editEl: TextElement | null = null
    if (this.mode === 'edit' && this.editId) {
      const e = this.getScene().getById(this.editId)
      if (e?.type === 'text') editEl = e
    }
    const fsWorld = editEl?.fontSize ?? placement.fontSize
    const fontSizePx = fsWorld * zoom
    ta.style.fontSize = `${fontSizePx}px`
    ta.style.fontFamily = editEl?.fontFamily ?? placement.fontFamily
    ta.style.textAlign = (editEl?.textAlign ?? placement.textAlign) as string
    const opacity = editEl?.opacity ?? placement.opacity
    ta.style.opacity = String(opacity)
    // Outline renders on canvas only; -webkit-text-stroke here often hides glyph fill in Chromium.
    ta.style.removeProperty('-webkit-text-stroke')
    ta.style.removeProperty('-webkit-text-fill-color')

    const fill = editEl?.color ?? placement.color
    ta.style.color = fill
    ta.style.caretColor = fill

    if (editEl) {
      const wPx = Math.min(320, Math.max(120, editEl.width * zoom))
      ta.style.width = `${wPx}px`
    } else {
      const maxW = Math.min(320, Math.max(160, cw * 0.85))
      ta.style.width = `${maxW}px`
    }

    const { dx, dy } = this.canvasOffsetInOverlay()
    const sx = this.viewport.worldToScreen(this.worldX, this.worldY)
    ta.style.left = `${sx.x + dx}px`
    ta.style.top = `${sx.y + dy}px`
    this.autosize()
  }

  private teardownDomOnly(): void {
    if (this.layer) {
      this.layer.remove()
      this.layer = null
    }
    this.textarea = null
  }

  private teardown(): void {
    this.clearPointerUpForFocus()
    this.detachOutsideDismissListener()
    this.acceptOutsideDismiss = false
    this.mode = null
    this.editId = null
    this.snapshot = ''
    this.skipBlurCommit = false
    this.teardownDomOnly()
  }
}
