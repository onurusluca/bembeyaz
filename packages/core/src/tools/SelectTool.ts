import {
  distancePointToAttachedArrowCurve,
  hitTestArrowHandle,
  isAttachedArrow,
  projectManualAnchor,
  resolveAttachedArrow,
  type ArrowHandleId,
} from '../scene/connectorGeometry.js'
import {
  aspectRatioResizeRect,
  cloneElement,
  getSelectionOuterRect,
  marqueeAABB,
  normalizeRect,
} from '../scene/elements.js'
import {
  expandSelectionByGroup,
  hitTestResizeHandle,
  idsInSameGroup,
  toggleSelectionIds,
  unionSelectionOuterBounds,
  type ResizeCorner,
} from '../scene/selection.js'
import type { ArrowElement, Element, LineElement } from '../types.js'
import type { AABB } from '../utils/math.js'
import { pointInAABB } from '../utils/math.js'
import type { ToolContext } from './ToolContext.js'

const MIN_SHAPE_SIZE = 1
/** Drag beyond this distance (screen px, converted to world) starts a marquee. */
const MARQUEE_DRAG_THRESHOLD_PX = 4

type ResizeLineEndpoint = 'start' | 'end'

type DragMode = 'translate' | 'resize' | 'connectorHandle' | 'maybeEmpty' | 'marquee' | null

export class SelectTool {
  readonly name = 'select' as const
  private ctx: ToolContext | null = null
  private dragPointerId: number | null = null
  private dragMode: DragMode = null
  private dragElementId: string | null = null
  /** All elements moved together in translate mode (includes `dragElementId`). */
  private dragTranslateIds: string[] | null = null
  private translateSnapshots: Map<string, Element> | null = null
  private resizeCorner: ResizeCorner | null = null
  private resizeLineEndpoint: ResizeLineEndpoint | null = null
  private connectorHandle: ArrowHandleId | null = null
  private lastWorld = { x: 0, y: 0 }
  private emptyPickStartWorld = { x: 0, y: 0 }
  private emptyPickShift = false
  /** Snapshot at drag start for undo (translate single / resize). */
  private dragHistoryBefore: Element | null = null
  private marqueeWorld: { x1: number; y1: number; x2: number; y2: number } | null = null

  setContext(ctx: ToolContext): void {
    this.ctx = ctx
  }

  /** Live marquee rect in world space while dragging, or null. */
  getMarqueeRect(): AABB | null {
    if (!this.marqueeWorld) return null
    const { x1, y1, x2, y2 } = this.marqueeWorld
    return marqueeAABB(x1, y1, x2, y2)
  }

  getResizeCursorHint(worldX: number, worldY: number): string | null {
    const c = this.ctx
    if (!c) return null
    if (this.dragMode === 'resize' && this.resizeCorner) {
      return cursorCssForCorner(this.resizeCorner)
    }
    const sel = c.getSelection()
    if (sel.length !== 1) return null
    const el = c.scene.getById(sel[0]!)
    if (!el || el.type === 'path') return null
    if (el.type === 'arrow' && isAttachedArrow(el)) {
      const h = hitTestArrowHandle(c.scene, el, worldX, worldY, c.viewport.zoom)
      if (!h) return null
      return h === 'bend' ? 'grab' : 'crosshair'
    }
    const corner = hitTestResizeHandle(el, worldX, worldY, c.viewport.zoom, c.scene)
    if (!corner) return null
    return cursorCssForCorner(corner)
  }

  /**
   * `move` when the pointer is over the selection chrome (inside dashed box) and not over
   * another element that would take priority.
   */
  getBodyDragCursorHint(worldX: number, worldY: number): string | null {
    const c = this.ctx
    if (!c || this.dragPointerId !== null) return null
    const sel = c.getSelection()
    if (sel.length === 0) return null
    const union = unionSelectionOuterBounds(c.scene, sel)
    if (!union || !pointInAABB(worldX, worldY, union)) return null
    if (selectionNearAttachedArrowCurve(c.scene, sel, worldX, worldY, c.viewport.zoom)) return null
    const hit = c.scene.getElementAtWorldPoint(worldX, worldY, c.getHitThresholdWorld())
    if (hit) {
      const hitExpanded = expandSelectionByGroup(c.scene, [hit.id])
      const selExpanded = new Set(expandSelectionByGroup(c.scene, sel))
      if (!hitExpanded.every((id) => selExpanded.has(id))) return null
    }
    return 'move'
  }

  onPointerDown(worldX: number, worldY: number, pointerId: number, e?: PointerEvent): void {
    const c = this.ctx
    if (!c) return
    this.lastWorld = { x: worldX, y: worldY }
    const shift = e?.shiftKey ?? false
    const sel = c.getSelection()

    if (sel.length === 1) {
      const only = c.scene.getById(sel[0]!)
      if (only?.type === 'arrow' && isAttachedArrow(only)) {
        const h = hitTestArrowHandle(c.scene, only, worldX, worldY, c.viewport.zoom)
        if (h) {
          this.beginConnectorHandle(c, pointerId, only, h, worldX, worldY)
          return
        }
      }
      if (only && only.type !== 'path') {
        const corner = hitTestResizeHandle(only, worldX, worldY, c.viewport.zoom, c.scene)
        if (corner) {
          this.beginResize(c, pointerId, only, corner)
          return
        }
      }
    }

    const hit = c.scene.getElementAtWorldPoint(worldX, worldY, c.getHitThresholdWorld())
    if (hit) {
      const groupIds = idsInSameGroup(c.scene, hit.id)
      if (shift) {
        const next = toggleSelectionIds(sel, groupIds)
        c.setSelection(expandSelectionByGroup(c.scene, next))
        c.emitSelectionChange()
        this.dragPointerId = null
        this.dragMode = null
        this.dragTranslateIds = null
        this.translateSnapshots = null
        c.requestInteractiveRender()
        return
      }

      const expandedHit = expandSelectionByGroup(c.scene, groupIds)
      const allSelected =
        expandedHit.length > 0 &&
        expandedHit.every((id) => sel.includes(id)) &&
        expandedHit.length === sel.length
      const clickingMemberOfMulti =
        sel.length > 1 && expandedHit.every((id) => sel.includes(id))

      if (sel.length > 0 && (allSelected || clickingMemberOfMulti)) {
        this.beginTranslate(c, pointerId, worldX, worldY, expandSelectionByGroup(c.scene, sel))
        return
      }

      c.setSelection(expandedHit)
      c.emitSelectionChange()
      this.beginTranslate(c, pointerId, worldX, worldY, expandedHit)
      return
    }

    if (sel.length > 0 && !shift) {
      const union = unionSelectionOuterBounds(c.scene, sel)
      if (union && pointInAABB(worldX, worldY, union)) {
        if (!hit) {
          const narrowId = findAttachedArrowInSelectionNearCurve(
            c.scene,
            sel,
            worldX,
            worldY,
            c.viewport.zoom,
          )
          if (narrowId) {
            c.setSelection([narrowId])
            c.emitSelectionChange()
            c.requestInteractiveRender()
            return
          }
        }
        this.beginTranslate(c, pointerId, worldX, worldY, expandSelectionByGroup(c.scene, sel))
        return
      }
    }

    this.emptyPickStartWorld = { x: worldX, y: worldY }
    this.emptyPickShift = shift
    this.dragPointerId = pointerId
    this.dragMode = 'maybeEmpty'
    this.dragElementId = null
    this.dragTranslateIds = null
    this.translateSnapshots = null
    this.dragHistoryBefore = null
    this.resizeCorner = null
    this.resizeLineEndpoint = null
    this.connectorHandle = null
    this.marqueeWorld = null
    c.requestInteractiveRender()
  }

  private beginConnectorHandle(
    c: ToolContext,
    pointerId: number,
    only: ArrowElement,
    h: ArrowHandleId,
    worldX: number,
    worldY: number,
  ): void {
    this.dragPointerId = pointerId
    this.dragMode = 'connectorHandle'
    this.dragElementId = only.id
    this.dragTranslateIds = null
    this.translateSnapshots = null
    this.dragHistoryBefore = cloneElement(only)
    this.connectorHandle = h
    this.resizeCorner = null
    this.resizeLineEndpoint = null
    this.lastWorld = { x: worldX, y: worldY }
    try {
      c.canvas.interactiveCanvas.setPointerCapture(pointerId)
    } catch {
      /* ignore */
    }
    c.requestInteractiveRender()
  }

  private beginResize(
    c: ToolContext,
    pointerId: number,
    only: Element,
    corner: ResizeCorner,
  ): void {
    this.dragPointerId = pointerId
    this.dragMode = 'resize'
    this.dragElementId = only.id
    this.dragTranslateIds = null
    this.translateSnapshots = null
    this.dragHistoryBefore = cloneElement(only)
    this.resizeCorner = corner
    this.connectorHandle = null
    this.resizeLineEndpoint =
      only.type === 'line' || only.type === 'arrow' ? lineEndpointForCorner(only, corner) : null
    try {
      c.canvas.interactiveCanvas.setPointerCapture(pointerId)
    } catch {
      /* ignore */
    }
    c.requestInteractiveRender()
  }

  private beginTranslate(
    c: ToolContext,
    pointerId: number,
    worldX: number,
    worldY: number,
    ids: readonly string[],
  ): void {
    this.dragPointerId = pointerId
    this.dragMode = 'translate'
    this.dragElementId = ids[0] ?? null
    this.dragTranslateIds = [...ids]
    this.translateSnapshots = new Map()
    for (const id of ids) {
      const el = c.scene.getById(id)
      if (el) this.translateSnapshots.set(id, cloneElement(el))
    }
    this.dragHistoryBefore = ids.length === 1 ? cloneElement(c.scene.getById(ids[0]!)!) : null
    this.resizeCorner = null
    this.resizeLineEndpoint = null
    this.connectorHandle = null
    this.lastWorld = { x: worldX, y: worldY }
    try {
      c.canvas.interactiveCanvas.setPointerCapture(pointerId)
    } catch {
      /* ignore */
    }
    c.requestInteractiveRender()
  }

  onPointerMove(worldX: number, worldY: number, pointerId: number): void {
    const c = this.ctx
    if (!c || this.dragPointerId !== pointerId) {
      this.lastWorld = { x: worldX, y: worldY }
      return
    }

    if (this.dragMode === 'maybeEmpty') {
      const dx = worldX - this.emptyPickStartWorld.x
      const dy = worldY - this.emptyPickStartWorld.y
      const thresholdWorld = MARQUEE_DRAG_THRESHOLD_PX / c.viewport.zoom
      if (Math.hypot(dx, dy) >= thresholdWorld) {
        this.dragMode = 'marquee'
        this.marqueeWorld = {
          x1: this.emptyPickStartWorld.x,
          y1: this.emptyPickStartWorld.y,
          x2: worldX,
          y2: worldY,
        }
        try {
          c.canvas.interactiveCanvas.setPointerCapture(pointerId)
        } catch {
          /* ignore */
        }
      }
      this.lastWorld = { x: worldX, y: worldY }
      c.requestInteractiveRender()
      return
    }

    if (this.dragMode === 'marquee' && this.marqueeWorld) {
      this.marqueeWorld = {
        ...this.marqueeWorld,
        x2: worldX,
        y2: worldY,
      }
      this.lastWorld = { x: worldX, y: worldY }
      c.requestInteractiveRender()
      return
    }

    if (!this.dragElementId || !this.dragMode) {
      this.lastWorld = { x: worldX, y: worldY }
      return
    }
    if (this.dragMode === 'resize') {
      const corner = this.resizeCorner
      if (!corner) return
      c.scene.updateElement(
        this.dragElementId,
        (el) => this.applyResize(el, corner, worldX, worldY, this.resizeLineEndpoint),
        { emitCollaboration: false },
      )
      c.emitSceneChange()
      c.requestStaticRender()
      c.requestInteractiveRender()
      return
    }
    if (this.dragMode === 'connectorHandle' && this.dragElementId && this.connectorHandle) {
      const el = c.scene.getById(this.dragElementId)
      if (!el || el.type !== 'arrow' || !isAttachedArrow(el)) return
      const h = this.connectorHandle
      if (h === 'bend') {
        const dx = worldX - this.lastWorld.x
        const dy = worldY - this.lastWorld.y
        this.lastWorld = { x: worldX, y: worldY }
        c.scene.updateElement(
          this.dragElementId,
          (e) => {
            if (e.type !== 'arrow' || !isAttachedArrow(e)) return e
            return {
              ...e,
              bendOffsetX: (e.bendOffsetX ?? 0) + dx,
              bendOffsetY: (e.bendOffsetY ?? 0) + dy,
            }
          },
          { emitCollaboration: false },
        )
      } else if (h === 'start') {
        const src = c.scene.getById(el.sourceId!)
        if (!src) return
        const proj = projectManualAnchor(src, { x: worldX, y: worldY })
        if (!proj) return
        c.scene.updateElement(
          this.dragElementId,
          (e) => {
            if (e.type !== 'arrow' || !isAttachedArrow(e)) return e
            return { ...e, sourceManual: true, sourceSide: proj.side, sourceT: proj.t }
          },
          { emitCollaboration: false },
        )
      } else if (h === 'end') {
        const tgt = c.scene.getById(el.targetId!)
        if (!tgt) return
        const proj = projectManualAnchor(tgt, { x: worldX, y: worldY })
        if (!proj) return
        c.scene.updateElement(
          this.dragElementId,
          (e) => {
            if (e.type !== 'arrow' || !isAttachedArrow(e)) return e
            return { ...e, targetManual: true, targetSide: proj.side, targetT: proj.t }
          },
          { emitCollaboration: false },
        )
      }
      this.lastWorld = { x: worldX, y: worldY }
      c.emitSceneChange()
      c.requestStaticRender()
      c.requestInteractiveRender()
      return
    }
    if (this.dragMode === 'translate' && this.dragTranslateIds) {
      const dx = worldX - this.lastWorld.x
      const dy = worldY - this.lastWorld.y
      this.lastWorld = { x: worldX, y: worldY }
      const ids = this.dragTranslateIds
      for (const id of ids) {
        const el = c.scene.getById(id)
        if (el?.type === 'arrow' && isAttachedArrow(el)) {
          const srcMv = ids.includes(el.sourceId!)
          const tgtMv = ids.includes(el.targetId!)
          if (srcMv || tgtMv) continue
        }
        c.scene.updateElement(id, (e) => this.translateElement(e, dx, dy), { emitCollaboration: false })
      }
      c.emitSceneChange()
      c.requestStaticRender()
      c.requestInteractiveRender()
    }
  }

  onPointerUp(worldX: number, worldY: number, pointerId: number, _e?: PointerEvent): void {
    if (this.dragPointerId !== pointerId) return
    const c = this.ctx
    if (this.dragMode === 'marquee' && this.marqueeWorld) {
      this.marqueeWorld = { ...this.marqueeWorld, x2: worldX, y2: worldY }
    }
    const mode = this.dragMode
    const elId = this.dragElementId
    const beforeSingle = this.dragHistoryBefore
    const translateIds = this.dragTranslateIds
    const snapshots = this.translateSnapshots
    const marqueeSnapshot = this.marqueeWorld
    const emptyShift = this.emptyPickShift

    this.dragPointerId = null
    this.dragMode = null
    this.dragElementId = null
    this.dragTranslateIds = null
    this.translateSnapshots = null
    this.dragHistoryBefore = null
    this.resizeCorner = null
    this.resizeLineEndpoint = null
    this.connectorHandle = null
    this.marqueeWorld = null

    if (c && mode === 'maybeEmpty') {
      if (!emptyShift) {
        c.setSelection([])
        c.emitSelectionChange()
      }
      c.requestInteractiveRender()
    }

    if (c && mode === 'marquee' && marqueeSnapshot) {
      const m = marqueeAABB(
        marqueeSnapshot.x1,
        marqueeSnapshot.y1,
        marqueeSnapshot.x2,
        marqueeSnapshot.y2,
      )
      const picked = c.scene.getElementsIntersectingRect(m)
      const pickedIds = expandSelectionByGroup(
        c.scene,
        picked.map((e) => e.id),
      )
      if (emptyShift) {
        const merged = new Set([...c.getSelection(), ...pickedIds])
        c.setSelection(expandSelectionByGroup(c.scene, [...merged]))
      } else {
        c.setSelection(pickedIds)
      }
      c.emitSelectionChange()
      c.requestInteractiveRender()
    }

    if (c && mode === 'resize' && beforeSingle && elId) {
      const after = c.scene.getById(elId)
      if (after && JSON.stringify(beforeSingle) !== JSON.stringify(after)) {
        c.notifyElementUpdated(beforeSingle, after)
        c.scene.emitCollaborationUpdate(elId, beforeSingle.version)
      }
    }

    if (c && mode === 'connectorHandle' && beforeSingle && elId) {
      const after = c.scene.getById(elId)
      if (after && JSON.stringify(beforeSingle) !== JSON.stringify(after)) {
        c.notifyElementUpdated(beforeSingle, after)
        c.scene.emitCollaborationUpdate(elId, beforeSingle.version)
      }
    }

    if (c && mode === 'translate' && snapshots && translateIds) {
      const pairs: { before: Element; after: Element }[] = []
      for (const id of translateIds) {
        const before = snapshots.get(id)
        const after = c.scene.getById(id)
        if (before && after && JSON.stringify(before) !== JSON.stringify(after)) {
          pairs.push({ before, after: cloneElement(after) })
          c.scene.emitCollaborationUpdate(id, before.version)
        }
      }
      if (pairs.length === 1) {
        c.notifyElementUpdated(pairs[0]!.before, pairs[0]!.after)
      } else if (pairs.length > 1) {
        c.notifyElementsUpdated(pairs)
      }
    }

    if (c) {
      try {
        c.canvas.interactiveCanvas.releasePointerCapture(pointerId)
      } catch {
        /* ignore */
      }
    }
    this.ctx?.requestInteractiveRender()
  }

  onPointerCancel(): void {
    const pid = this.dragPointerId
    const c = this.ctx
    const mode = this.dragMode
    const elId = this.dragElementId
    const beforeSingle = this.dragHistoryBefore
    const translateIds = this.dragTranslateIds
    const snapshots = this.translateSnapshots

    this.dragPointerId = null
    this.dragMode = null
    this.dragElementId = null
    this.dragTranslateIds = null
    this.translateSnapshots = null
    this.dragHistoryBefore = null
    this.resizeCorner = null
    this.resizeLineEndpoint = null
    this.connectorHandle = null
    this.marqueeWorld = null

    if (c && pid !== null) {
      try {
        c.canvas.interactiveCanvas.releasePointerCapture(pid)
      } catch {
        /* ignore */
      }
    }

    if (c && mode === 'resize' && beforeSingle && elId) {
      const after = c.scene.getById(elId)
      if (after && JSON.stringify(beforeSingle) !== JSON.stringify(after)) {
        c.scene.emitCollaborationUpdate(elId, beforeSingle.version)
      }
    }
    if (c && mode === 'connectorHandle' && beforeSingle && elId) {
      const after = c.scene.getById(elId)
      if (after && JSON.stringify(beforeSingle) !== JSON.stringify(after)) {
        c.scene.emitCollaborationUpdate(elId, beforeSingle.version)
      }
    }
    if (c && mode === 'translate' && snapshots && translateIds) {
      for (const id of translateIds) {
        const before = snapshots.get(id)
        const after = c.scene.getById(id)
        if (before && after && JSON.stringify(before) !== JSON.stringify(after)) {
          c.scene.emitCollaborationUpdate(id, before.version)
        }
      }
    }

    this.ctx?.requestInteractiveRender()
  }

  private applyResize(
    el: Element,
    corner: ResizeCorner,
    wx: number,
    wy: number,
    lineEp: ResizeLineEndpoint | null,
  ): Element {
    if (el.type === 'image') {
      const R =
        typeof el.aspectRatio === 'number' && el.aspectRatio > 0
          ? el.aspectRatio
          : el.width / Math.max(el.height, 1e-9)
      const ex1 = el.x
      const ey1 = el.y
      const ex2 = el.x + el.width
      const ey2 = el.y + el.height
      let fx: number
      let fy: number
      switch (corner) {
        case 'nw':
          fx = ex2
          fy = ey2
          break
        case 'se':
          fx = ex1
          fy = ey1
          break
        case 'ne':
          fx = ex1
          fy = ey2
          break
        case 'sw':
          fx = ex2
          fy = ey1
          break
      }
      const r = aspectRatioResizeRect(fx, fy, wx, wy, R, MIN_SHAPE_SIZE)
      if (!r) return el
      return {
        ...el,
        x: r.x,
        y: r.y,
        width: r.width,
        height: r.height,
      }
    }
    if (el.type === 'rectangle' || el.type === 'ellipse' || el.type === 'text') {
      const ex1 = el.x
      const ey1 = el.y
      const ex2 = el.x + el.width
      const ey2 = el.y + el.height
      let fx: number
      let fy: number
      switch (corner) {
        case 'nw':
          fx = ex2
          fy = ey2
          break
        case 'se':
          fx = ex1
          fy = ey1
          break
        case 'ne':
          fx = ex1
          fy = ey2
          break
        case 'sw':
          fx = ex2
          fy = ey1
          break
      }
      const r = normalizeRect(wx, wy, fx, fy)
      if (r.width < MIN_SHAPE_SIZE || r.height < MIN_SHAPE_SIZE) return el
      return {
        ...el,
        x: r.x,
        y: r.y,
        width: r.width,
        height: r.height,
      }
    }
    if ((el.type === 'line' || el.type === 'arrow') && lineEp && !(el.type === 'arrow' && isAttachedArrow(el))) {
      if (lineEp === 'start') return { ...el, x1: wx, y1: wy }
      return { ...el, x2: wx, y2: wy }
    }
    return el
  }

  private translateElement(el: Element, dx: number, dy: number): Element {
    if (el.type === 'path') {
      return {
        ...el,
        points: el.points.map((p) => ({ x: p.x + dx, y: p.y + dy })),
      }
    }
    if (el.type === 'rectangle' || el.type === 'ellipse') {
      return {
        ...el,
        x: el.x + dx,
        y: el.y + dy,
      }
    }
    if (el.type === 'line' || el.type === 'arrow') {
      if (el.type === 'arrow' && isAttachedArrow(el)) {
        return {
          ...el,
          bendOffsetX: (el.bendOffsetX ?? 0) + dx,
          bendOffsetY: (el.bendOffsetY ?? 0) + dy,
        }
      }
      return {
        ...el,
        x1: el.x1 + dx,
        y1: el.y1 + dy,
        x2: el.x2 + dx,
        y2: el.y2 + dy,
      }
    }
    if (el.type === 'text' || el.type === 'image') {
      return {
        ...el,
        x: el.x + dx,
        y: el.y + dy,
      }
    }
    return el
  }

  onDoubleClick(worldX: number, worldY: number): void {
    const c = this.ctx
    if (!c || c.isTextEditing()) return
    const hit = c.scene.getElementAtWorldPoint(worldX, worldY, c.getHitThresholdWorld())
    if (hit?.type === 'text') {
      c.beginTextEdit(hit.id)
    } else if (hit?.type === 'arrow' && isAttachedArrow(hit)) {
      c.beginConnectorLabelEdit(hit.id)
    }
  }
}

function selectionNearAttachedArrowCurve(
  scene: import('../scene/Scene.js').Scene,
  sel: readonly string[],
  wx: number,
  wy: number,
  zoom: number,
): boolean {
  const t = Math.max(18 / zoom, 14)
  for (const id of sel) {
    const el = scene.getById(id)
    if (!el || el.type !== 'arrow' || !isAttachedArrow(el)) continue
    const r = resolveAttachedArrow(scene, el)
    if (!r) continue
    if (distancePointToAttachedArrowCurve(r, { x: wx, y: wy }) <= t) return true
  }
  return false
}

function findAttachedArrowInSelectionNearCurve(
  scene: import('../scene/Scene.js').Scene,
  sel: readonly string[],
  wx: number,
  wy: number,
  zoom: number,
): string | null {
  const t = Math.max(18 / zoom, 14)
  for (let i = sel.length - 1; i >= 0; i--) {
    const id = sel[i]!
    const el = scene.getById(id)
    if (!el || el.type !== 'arrow' || !isAttachedArrow(el)) continue
    const r = resolveAttachedArrow(scene, el)
    if (!r) continue
    if (distancePointToAttachedArrowCurve(r, { x: wx, y: wy }) <= t) return id
  }
  return null
}

function cursorCssForCorner(corner: ResizeCorner): string {
  return corner === 'nw' || corner === 'se' ? 'nwse-resize' : 'nesw-resize'
}

function lineEndpointForCorner(
  el: LineElement | ArrowElement,
  corner: ResizeCorner,
): ResizeLineEndpoint {
  const r = getSelectionOuterRect(el, undefined)!
  const corners: Record<ResizeCorner, { x: number; y: number }> = {
    nw: { x: r.minX, y: r.minY },
    ne: { x: r.maxX, y: r.minY },
    se: { x: r.maxX, y: r.maxY },
    sw: { x: r.minX, y: r.maxY },
  }
  const p = corners[corner]
  const d1 = (el.x1 - p.x) ** 2 + (el.y1 - p.y) ** 2
  const d2 = (el.x2 - p.x) ** 2 + (el.y2 - p.y) ** 2
  return d1 <= d2 ? 'start' : 'end'
}
