import type { Element } from '../types.js'
import { cloneElement } from './elements.js'
import type { Scene } from './Scene.js'

type Command = {
  undo: (scene: Scene) => void
  redo: (scene: Scene) => void
}

export class SceneHistory {
  private undoStack: Command[] = []
  private redoStack: Command[] = []

  constructor(private readonly maxDepth: number) {}

  clear(): void {
    this.undoStack = []
    this.redoStack = []
  }

  canUndo(): boolean {
    return this.undoStack.length > 0
  }

  canRedo(): boolean {
    return this.redoStack.length > 0
  }

  private push(cmd: Command): void {
    this.redoStack = []
    this.undoStack.push(cmd)
    if (this.undoStack.length > this.maxDepth) {
      this.undoStack.shift()
    }
  }

  undo(scene: Scene): boolean {
    const cmd = this.undoStack.pop()
    if (!cmd) return false
    cmd.undo(scene)
    this.redoStack.push(cmd)
    return true
  }

  redo(scene: Scene): boolean {
    const cmd = this.redoStack.pop()
    if (!cmd) return false
    cmd.redo(scene)
    this.undoStack.push(cmd)
    return true
  }

  /** Call right after `addElement` (element is in the scene). */
  recordAdd(scene: Scene, elementId: string): void {
    const el = scene.getById(elementId)
    const index = scene.indexOfElement(elementId)
    if (!el || index < 0) return
    const snapshot = cloneElement(el)
    this.push({
      undo: (sc) => {
        sc.removeElement(elementId)
      },
      redo: (sc) => {
        const n = Math.min(index, sc.getElements().length)
        sc.insertElementAt(n, cloneElement(snapshot))
      },
    })
  }

  /**
   * Call after elements were removed. Snapshots must be from **before** removal,
   * with original indices (paint order).
   */
  recordRemovals(snapshots: { index: number; element: Element }[]): void {
    if (snapshots.length === 0) return
    const sorted = [...snapshots].sort((a, b) => a.index - b.index)
    const snap = sorted.map((s) => ({ index: s.index, element: cloneElement(s.element) }))
    this.push({
      undo: (sc) => {
        for (const { index, element } of snap) {
          const n = Math.min(index, sc.getElements().length)
          sc.insertElementAt(n, cloneElement(element))
        }
      },
      redo: (sc) => {
        for (const { element } of snap) {
          sc.removeElement(element.id)
        }
      },
    })
  }

  /** Call after `updateElement` / replace — full before and after snapshots (same id). */
  recordUpdate(before: Element, after: Element): void {
    if (before.id !== after.id) return
    const id = before.id
    const b = cloneElement(before)
    const a = cloneElement(after)
    this.push({
      undo: (sc) => {
        sc.replaceElementSnapshot(id, b)
      },
      redo: (sc) => {
        sc.replaceElementSnapshot(id, a)
      },
    })
  }

  /** One undo step for multi-element edits (e.g. multi-drag or group). */
  recordUpdates(pairs: { before: Element; after: Element }[]): void {
    if (pairs.length === 0) return
    const snap = pairs.map((p) => ({ before: cloneElement(p.before), after: cloneElement(p.after) }))
    this.push({
      undo: (sc) => {
        for (const { before } of snap) {
          sc.replaceElementSnapshot(before.id, before)
        }
      },
      redo: (sc) => {
        for (const { after } of snap) {
          sc.replaceElementSnapshot(after.id, after)
        }
      },
    })
  }
}
