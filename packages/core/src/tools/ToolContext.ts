import type { CanvasPair, Viewport } from '../canvas/canvas.js'
import type { Element, PenOptions, ToolName } from '../types.js'
import type { Scene } from '../scene/Scene.js'

export interface ToolContext {
  scene: Scene
  viewport: Viewport
  canvas: CanvasPair
  getPenOptions(): PenOptions
  getSelection(): readonly string[]
  setSelection(ids: string[]): void
  setTool(name: ToolName): void
  getHitThresholdWorld(): number
  requestStaticRender(): void
  requestInteractiveRender(): void
  emitSceneChange(): void
  emitSelectionChange(): void
  emitViewportChange(): void
  beginTextPlacement(worldX: number, worldY: number, pointerId?: number): void
  beginTextEdit(elementId: string): void
  beginConnectorLabelEdit(elementId: string): void
  isTextEditing(): boolean
  /** Undo/redo: call immediately after `scene.addElement`. */
  notifyElementAdded(id: string): void
  /** After elements were removed; snapshots use indices from before removal. */
  notifyElementsRemoved(snapshots: { index: number; element: Element }[]): void
  /** After an in-place update (e.g. drag); full element snapshots. */
  notifyElementUpdated(before: Element, after: Element): void
  /** After moving or grouping multiple elements in one gesture. */
  notifyElementsUpdated(pairs: { before: Element; after: Element }[]): void
}
