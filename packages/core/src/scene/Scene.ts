import type { Element } from '../types.js'
import type { SceneOperation } from '../collaboration/operations.js'
import {
  distancePointToAttachedArrowCurve,
  getAttachedArrowBounds,
  isAttachedArrow,
  resolveAttachedArrow,
} from './connectorGeometry.js'
import { cloneElement, elementBoundsIntersectRect, getElementBounds } from './elements.js'
import {
  expandAABB,
  hitTestEllipseFill,
  hitTestPolyline,
  hitTestRectFill,
  pointsAABB,
} from '../utils/math.js'
import type { AABB } from '../utils/math.js'
import { DEFAULT_WORLD_BOUNDS, SpatialIndex } from './SpatialIndex.js'

export class Scene {
  private elements: Element[] = []
  private dirty = true
  private spatial = new SpatialIndex(DEFAULT_WORLD_BOUNDS)
  private collaborationSuppress = 0
  private collaborationSink?: (op: SceneOperation) => void

  /** Emit local scene mutations for collaboration (insert / update / delete). Undo/redo and remote apply use {@link runSuppressingCollaboration}. */
  setCollaborationSink(sink: ((op: SceneOperation) => void) | undefined): void {
    this.collaborationSink = sink
  }

  runSuppressingCollaboration<T>(fn: () => T): T {
    this.collaborationSuppress++
    try {
      return fn()
    } finally {
      this.collaborationSuppress--
    }
  }

  private emitCollaboration(op: SceneOperation): void {
    if (this.collaborationSuppress > 0) return
    this.collaborationSink?.(op)
  }

  getElements(): readonly Element[] {
    return this.elements
  }

  isDirty(): boolean {
    return this.dirty
  }

  markClean(): void {
    this.dirty = false
  }

  markDirty(): void {
    this.dirty = true
  }

  addElement(el: Element): void {
    this.elements.push(el)
    this.rebuildIndex()
    this.dirty = true
    this.emitCollaboration({
      type: 'insert',
      element: cloneElement(el),
      index: this.elements.length - 1,
    })
  }

  removeElement(id: string): boolean {
    const i = this.elements.findIndex((e) => e.id === id)
    if (i < 0) return false
    const prev = this.elements[i]!
    const baseVersion = prev.version
    this.elements.splice(i, 1)
    this.rebuildIndex()
    this.dirty = true
    this.emitCollaboration({ type: 'delete', id, baseVersion })
    return true
  }

  /**
   * @param options.emitCollaboration — Set `false` while coalescing many moves (e.g. pointer drag);
   * call {@link emitCollaborationUpdate} once when the gesture ends so wire payloads stay small for heavy elements (images).
   */
  updateElement(
    id: string,
    updater: (el: Element) => Element,
    options?: { emitCollaboration?: boolean },
  ): boolean {
    const i = this.elements.findIndex((e) => e.id === id)
    if (i < 0) return false
    const before = this.elements[i]!
    const baseVersion = before.version
    const next = updater(before)
    next.version = next.version + 1
    this.elements[i] = next
    this.rebuildIndex()
    this.dirty = true
    if (options?.emitCollaboration !== false) {
      this.emitCollaboration({
        type: 'update',
        id,
        element: cloneElement(next),
        baseVersion,
      })
    }
    return true
  }

  /** One `update` op for the current element (after silent `updateElement` during a drag). */
  emitCollaborationUpdate(id: string, baseVersion: number): boolean {
    const el = this.getById(id)
    if (!el) return false
    this.emitCollaboration({
      type: 'update',
      id,
      element: cloneElement(el),
      baseVersion,
    })
    return true
  }

  getById(id: string): Element | undefined {
    return this.elements.find((e) => e.id === id)
  }

  /** Paint order index (0 = bottom). */
  indexOfElement(id: string): number {
    return this.elements.findIndex((e) => e.id === id)
  }

  insertElementAt(index: number, el: Element): void {
    const n = Math.max(0, Math.min(index, this.elements.length))
    this.elements.splice(n, 0, el)
    this.rebuildIndex()
    this.dirty = true
    this.emitCollaboration({ type: 'insert', element: cloneElement(el), index: n })
  }

  /** Replace element by id with an exact snapshot (used by undo/redo; no version bump). */
  replaceElementSnapshot(id: string, snapshot: Element): boolean {
    const i = this.elements.findIndex((e) => e.id === id)
    if (i < 0) return false
    this.elements[i] = cloneElement(snapshot)
    this.rebuildIndex()
    this.dirty = true
    return true
  }

  /** Top-most hit first (reverse paint order) */
  getElementAtWorldPoint(x: number, y: number, hitThresholdWorld: number): Element | undefined {
    const candidates = new Set<string>()
    this.spatial.queryPoint(x, y, candidates)
    const attachedThick = Math.max(hitThresholdWorld * 1.35, 14)
    for (let i = this.elements.length - 1; i >= 0; i--) {
      const el = this.elements[i]!
      if (!candidates.has(el.id)) continue
      if (el.type === 'arrow' && isAttachedArrow(el)) {
        const r = resolveAttachedArrow(this, el)
        if (!r) continue
        if (distancePointToAttachedArrowCurve(r, { x, y }) <= attachedThick) {
          return el
        }
      }
    }
    for (let i = this.elements.length - 1; i >= 0; i--) {
      const el = this.elements[i]!
      if (!candidates.has(el.id)) continue
      if (el.type === 'path') {
        if (hitTestPolyline({ x, y }, el.points, hitThresholdWorld)) {
          return el
        }
      } else if (el.type === 'rectangle') {
        if (hitTestRectFill({ x, y }, el.x, el.y, el.width, el.height)) {
          return el
        }
      } else if (el.type === 'ellipse') {
        if (hitTestEllipseFill({ x, y }, el.x, el.y, el.width, el.height)) {
          return el
        }
      } else if (el.type === 'line' || el.type === 'arrow') {
        if (el.type === 'arrow' && isAttachedArrow(el)) continue
        const pts = [
          { x: el.x1, y: el.y1 },
          { x: el.x2, y: el.y2 },
        ]
        if (hitTestPolyline({ x, y }, pts, hitThresholdWorld)) {
          return el
        }
      } else if (el.type === 'text' || el.type === 'image') {
        const b = getElementBounds(el)
        if (!b) continue
        const w = b.maxX - b.minX
        const h = b.maxY - b.minY
        if (hitTestRectFill({ x, y }, b.minX, b.minY, w, h)) {
          return el
        }
      }
    }
    return undefined
  }

  getElementsInRect(rect: AABB): Element[] {
    const ids = new Set<string>()
    this.spatial.queryRect(rect, ids)
    return this.elements.filter((e) => ids.has(e.id))
  }

  /** Elements whose bounds overlap `rect` (e.g. marquee), top-most order preserved. */
  getElementsIntersectingRect(rect: AABB): Element[] {
    const ids = new Set<string>()
    this.spatial.queryRect(rect, ids)
    return this.elements.filter((e) => ids.has(e.id) && elementBoundsIntersectRect(e, rect, this))
  }

  clear(): void {
    for (const el of this.elements) {
      this.emitCollaboration({ type: 'delete', id: el.id, baseVersion: el.version })
    }
    this.elements = []
    this.rebuildIndex()
    this.dirty = true
  }

  /** Replace all elements (e.g. load document). Prefer calling inside {@link runSuppressingCollaboration} so loads do not emit collaboration ops. */
  setElements(elements: Element[]): void {
    this.elements = [...elements]
    this.rebuildIndex()
    this.dirty = true
  }

  private rebuildIndex(): void {
    this.spatial.clear()
    for (const el of this.elements) {
      const b = elementBoundsForIndex(this, el)
      if (b) this.spatial.insert(el.id, b)
    }
  }
}

/** Extra world units around stroke for hit-test / spatial queries */
const HIT_PADDING = 12

function elementBoundsForIndex(scene: Scene, el: Element): AABB | null {
  if (el.type === 'arrow' && isAttachedArrow(el)) {
    const b = getAttachedArrowBounds(scene, el)
    if (!b) return null
    return expandAABB(b, HIT_PADDING)
  }
  if (el.type === 'path') {
    const raw = pointsAABB(el.points)
    if (!raw) return null
    const pad = el.style.strokeWidth / 2 + HIT_PADDING
    return expandAABB(raw, pad)
  }
  const raw = getElementBounds(el)
  if (!raw) return null
  const pad =
    el.type === 'text'
      ? el.fontSize * 0.15 + HIT_PADDING
      : el.type === 'image'
        ? el.style.strokeWidth / 2 + HIT_PADDING
        : ('style' in el ? el.style.strokeWidth / 2 : 1) + HIT_PADDING
  return expandAABB(raw, pad)
}
