import type { Element } from '../types.js'
import type { Scene } from '../scene/Scene.js'
import { cloneElement } from '../scene/elements.js'

/**
 * Serializable scene mutation for syncing to a backend (e.g. Supabase) or applying remote peers' edits.
 * Insert and normal updates carry full element snapshots so the wire format is self-contained.
 * Local translate/resize drags coalesce to a single update per element on pointer up (see `Scene.updateElement`).
 */
export type SceneOperation =
  | { type: 'insert'; element: Element; /** Paint order; omit to append. */ index?: number }
  | {
      type: 'update'
      id: string
      element: Element
      /** Version the editor believed the element had before applying this update (optimistic concurrency). */
      baseVersion?: number
    }
  | {
      type: 'delete'
      id: string
      baseVersion?: number
    }

export interface ApplyOperationsOptions {
  /**
   * How to resolve update/delete when `baseVersion` does not match the current element version.
   * - `base-version` (default): skip conflicting ops (listed in `conflicts`).
   * - `last-write-wins`: apply the incoming element if `op.element.version` is greater than the current version (updates only).
   */
  conflictStrategy?: 'base-version' | 'last-write-wins'
  /** When a remote insert targets an id that already exists. Default `skip`. */
  duplicateInsert?: 'skip' | 'replace'
}

export interface ApplyOperationIssue {
  op: SceneOperation
  reason: string
}

export interface ApplyOperationsResult {
  /** Operations that were applied successfully (canonical copies). */
  applied: SceneOperation[]
  /** Ops ignored (e.g. delete missing id). */
  skipped: ApplyOperationIssue[]
  /** Ops not applied due to version / conflict rules. */
  conflicts: ApplyOperationIssue[]
}

export function applySceneOperations(
  scene: Scene,
  ops: readonly SceneOperation[],
  options: ApplyOperationsOptions = {},
): ApplyOperationsResult {
  const strategy = options.conflictStrategy ?? 'base-version'
  const duplicateInsert = options.duplicateInsert ?? 'skip'
  const applied: SceneOperation[] = []
  const skipped: ApplyOperationIssue[] = []
  const conflicts: ApplyOperationIssue[] = []

  for (const op of ops) {
    if (op.type === 'insert') {
      const el = cloneElement(op.element)
      const existing = scene.getById(el.id)
      if (existing) {
        if (duplicateInsert === 'replace') {
          scene.replaceElementSnapshot(el.id, el)
          applied.push({
            type: 'update',
            id: el.id,
            element: cloneElement(el),
            baseVersion: existing.version,
          })
        } else {
          skipped.push({ op, reason: 'duplicate id' })
        }
        continue
      }
      if (op.index !== undefined) {
        const n = Math.max(0, Math.min(op.index, scene.getElements().length))
        scene.insertElementAt(n, el)
        applied.push({ type: 'insert', element: cloneElement(el), index: n })
      } else {
        scene.addElement(el)
        applied.push({ type: 'insert', element: cloneElement(el), index: scene.getElements().length - 1 })
      }
      continue
    }

    if (op.type === 'delete') {
      const cur = scene.getById(op.id)
      if (!cur) {
        skipped.push({ op, reason: 'missing element' })
        continue
      }
      if (op.baseVersion !== undefined && op.baseVersion !== cur.version) {
        conflicts.push({ op, reason: 'baseVersion mismatch' })
        continue
      }
      scene.removeElement(op.id)
      applied.push({ type: 'delete', id: op.id, baseVersion: cur.version })
      continue
    }

    if (op.type === 'update') {
      const cur = scene.getById(op.id)
      if (!cur) {
        skipped.push({ op, reason: 'missing element' })
        continue
      }
      const incoming = cloneElement(op.element)
      if (incoming.id !== op.id) {
        skipped.push({ op, reason: 'id mismatch' })
        continue
      }

      let shouldApply = false
      if (op.baseVersion === undefined) {
        shouldApply = true
      } else if (op.baseVersion === cur.version) {
        shouldApply = true
      } else if (strategy === 'last-write-wins' && incoming.version > cur.version) {
        shouldApply = true
      }

      if (!shouldApply) {
        conflicts.push({ op, reason: 'baseVersion mismatch' })
        continue
      }

      scene.replaceElementSnapshot(op.id, incoming)
      applied.push({
        type: 'update',
        id: op.id,
        element: cloneElement(incoming),
        baseVersion: op.baseVersion,
      })
    }
  }

  return { applied, skipped, conflicts }
}
