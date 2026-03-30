import type { Element } from '../types.js'
import type { AABB } from '../utils/math.js'
import type { Scene } from './Scene.js'
import { getSelectionOuterRect } from './elements.js'
import { isAttachedArrow } from './connectorGeometry.js'

export type ResizeCorner = 'nw' | 'ne' | 'se' | 'sw'

/** World-space edge length of resize grips (shared with ElementRenderer). */
export const RESIZE_HANDLE_WORLD = 11

/**
 * Hit-test selection resize handles (same positions as drawn in the interactive overlay).
 */
export function hitTestResizeHandle(
  el: Element,
  wx: number,
  wy: number,
  zoom: number,
  scene?: Scene,
): ResizeCorner | null {
  if (el.type === 'path') return null
  if (el.type === 'arrow' && isAttachedArrow(el)) return null
  const r = getSelectionOuterRect(el, scene)
  if (!r) return null
  const half = RESIZE_HANDLE_WORLD / zoom / 2 + 4 / zoom
  const corners: { id: ResizeCorner; x: number; y: number }[] = [
    { id: 'nw', x: r.minX, y: r.minY },
    { id: 'ne', x: r.maxX, y: r.minY },
    { id: 'se', x: r.maxX, y: r.maxY },
    { id: 'sw', x: r.minX, y: r.maxY },
  ]
  for (const c of corners) {
    const dx = wx - c.x
    const dy = wy - c.y
    if (dx * dx + dy * dy <= half * half) return c.id
  }
  return null
}

/** All element ids that belong to the same group as `elementId` (including itself), or `[elementId]` if ungrouped. */
export function idsInSameGroup(scene: Scene, elementId: string): string[] {
  const el = scene.getById(elementId)
  if (!el?.groupId) return [elementId]
  const gid = el.groupId
  return scene.getElements().filter((e) => e.groupId === gid).map((e) => e.id)
}

/** Union of `ids` with every id in the same group as any of them. */
export function expandSelectionByGroup(scene: Scene, ids: readonly string[]): string[] {
  const out = new Set<string>()
  for (const id of ids) {
    for (const x of idsInSameGroup(scene, id)) out.add(x)
  }
  return [...out]
}

/** Toggle membership: if every `toggleId` is selected, remove them; otherwise add all. */
export function toggleSelectionIds(current: readonly string[], toggleIds: readonly string[]): string[] {
  const set = new Set(current)
  const allPresent = toggleIds.length > 0 && toggleIds.every((id) => set.has(id))
  if (allPresent) {
    for (const id of toggleIds) set.delete(id)
  } else {
    for (const id of toggleIds) set.add(id)
  }
  return [...set]
}

/** Bounding box of the union of all selection outlines (dashed chrome) for `ids`. */
export function unionSelectionOuterBounds(scene: Scene, ids: readonly string[]): AABB | null {
  let first = true
  let minX = 0
  let minY = 0
  let maxX = 0
  let maxY = 0
  for (const id of ids) {
    const el = scene.getById(id)
    if (!el) continue
    const r = getSelectionOuterRect(el, scene)
    if (!r) continue
    if (first) {
      minX = r.minX
      minY = r.minY
      maxX = r.maxX
      maxY = r.maxY
      first = false
    } else {
      minX = Math.min(minX, r.minX)
      minY = Math.min(minY, r.minY)
      maxX = Math.max(maxX, r.maxX)
      maxY = Math.max(maxY, r.maxY)
    }
  }
  if (first) return null
  return { minX, minY, maxX, maxY }
}
