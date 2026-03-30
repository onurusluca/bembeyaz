import { createCanvasManager, type CanvasPair, Viewport } from './canvas/canvas.js'
import { InputManager } from './input/InputManager.js'
import {
  cloneElement,
  createImageElement,
  defaultElementStyle,
  DEFAULT_TEXT_FONT_FAMILY,
  DEFAULT_TEXT_FONT_SIZE_WORLD,
  migrateLegacyElement,
  normalizeTextElement,
} from './scene/elements.js'
import { expandSelectionByGroup } from './scene/selection.js'
import { createId } from './utils/id.js'
import { Scene } from './scene/Scene.js'
import { SceneHistory } from './scene/SceneHistory.js'
import {
  applySceneOperations,
  type ApplyOperationsOptions,
  type ApplyOperationsResult,
  type SceneOperation,
} from './collaboration/operations.js'
import { PresenceStore, type PresencePeer } from './collaboration/presence.js'
import type {
  BembeyazEventMap,
  BembeyazEventName,
  BembeyazOptions,
  CollaborationChangeHandler,
  Element,
  ElementStyle,
  GridStyle,
  PenOptions,
  SelectionStylePatch,
  SerializedScene,
  ToolName,
  ViewportState,
} from './types.js'
import { TOOLS_WITH_CROSSHAIR } from './types.js'
import { ToolManager } from './tools/ToolManager.js'
import type { ToolContext } from './tools/ToolContext.js'
import { RenderLoop } from './renderer/RenderLoop.js'
import { TextEditOverlay } from './ui/TextEditOverlay.js'

const DEFAULT_BG = '#ffffff'

type Listener<K extends BembeyazEventName> = BembeyazEventMap[K]

class EventEmitter {
  private readonly listeners = new Map<BembeyazEventName, Set<(...args: unknown[]) => void>>()

  on<K extends BembeyazEventName>(event: K, fn: Listener<K>): () => void {
    let set = this.listeners.get(event)
    if (!set) {
      set = new Set()
      this.listeners.set(event, set)
    }
    set.add(fn as (...args: unknown[]) => void)
    return () => this.off(event, fn)
  }

  off<K extends BembeyazEventName>(event: K, fn: Listener<K>): void {
    const set = this.listeners.get(event)
    if (!set) return
    set.delete(fn as (...args: unknown[]) => void)
  }

  emit<K extends BembeyazEventName>(event: K, ...args: Parameters<Listener<K>>): void {
    const set = this.listeners.get(event)
    if (!set) return
    for (const fn of set) {
      ;(fn as (...a: Parameters<Listener<K>>) => void)(...args)
    }
  }

  removeAllListeners(): void {
    this.listeners.clear()
  }
}

/** Round eraser cursor (hotspot centered). */
const ERASER_CURSOR_CSS =
  'url("data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><circle cx="12" cy="12" r="8" fill="rgba(255,255,255,0.92)" stroke="#64748b" stroke-width="1.5"/></svg>',
  ) +
  '") 12 12, auto'

/** Red glowing dot cursor for the laser pointer tool. */
const LASER_CURSOR_CSS =
  'url("data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24">' +
    '<circle cx="12" cy="12" r="8" fill="rgba(255,60,82,0.14)" stroke="none"/>' +
    '<circle cx="12" cy="12" r="3.5" fill="rgba(255,60,82,0.88)" stroke="rgba(255,255,255,0.7)" stroke-width="1.2"/>' +
    '</svg>',
  ) +
  '") 12 12, crosshair'

export class Bembeyaz {
  private readonly container: HTMLElement
  private readonly canvas: ReturnType<typeof createCanvasManager>
  private readonly viewport: Viewport
  private readonly scene: Scene
  private readonly history: SceneHistory | null
  private readonly events = new EventEmitter()
  private readonly toolManager: ToolManager
  private renderLoop!: RenderLoop
  private readonly input: InputManager
  private readonly textEdit: TextEditOverlay

  private backgroundColor: string
  private gridEnabled: boolean
  private gridStyle: GridStyle
  private selection: string[] = []
  private penOptions: PenOptions = {
    color: '#111111',
    strokeWidth: 2,
    fill: 'transparent',
    opacity: 1,
    strokeDash: 'solid',
    textFontFamily: DEFAULT_TEXT_FONT_FAMILY,
    textFontSize: DEFAULT_TEXT_FONT_SIZE_WORLD,
    textAlign: 'left',
    textStrokeColor: '#334155',
    textStrokeWidth: 0,
  }
  private handMode = false
  private destroyed = false

  private readonly onChange?: CollaborationChangeHandler
  private pendingCollabOps: SceneOperation[] = []
  private collabFlushScheduled = false
  private readonly presence: PresenceStore

  constructor(options: BembeyazOptions) {
    this.container = options.container
    this.backgroundColor = options.backgroundColor ?? DEFAULT_BG
    this.gridEnabled = options.gridEnabled ?? true
    this.gridStyle = options.gridStyle ?? 'lines'

    this.viewport = new Viewport()
    this.scene = new Scene()
    this.onChange = options.onChange
    this.presence = new PresenceStore(options.localUserId)
    this.scene.setCollaborationSink((op) => this.enqueueCollaboration(op))
    const historyDepth = options.historyDepth ?? 100
    this.history = historyDepth > 0 ? new SceneHistory(historyDepth) : null

    const renderLoopSlot: { current: RenderLoop | null } = { current: null }

    const toolContext: ToolContext = {
      scene: this.scene,
      viewport: this.viewport,
      canvas: null as unknown as CanvasPair,
      getPenOptions: () => this.penOptions,
      getSelection: () => this.selection,
      setSelection: (ids) => {
        this.selection = [...ids]
        renderLoopSlot.current?.requestInteractive()
      },
      setTool: (name) => this.applyTool(name),
      getHitThresholdWorld: () => 8 / this.viewport.zoom,
      requestStaticRender: () => renderLoopSlot.current?.requestStatic(),
      requestInteractiveRender: () => renderLoopSlot.current?.requestInteractive(),
      emitSceneChange: () => this.events.emit('scene:change', this.scene.getElements()),
      emitSelectionChange: () => this.notifySelectionChange(),
      emitViewportChange: () => {
        this.events.emit('viewport:change', this.viewport.toState())
        this.textEdit.syncFromViewport()
      },
      beginTextPlacement: (wx, wy, pid) => this.textEdit.beginPlacement(wx, wy, pid),
      beginTextEdit: (id) => this.textEdit.beginEdit(id),
      beginConnectorLabelEdit: (id) => this.textEdit.beginConnectorLabelEdit(id),
      isTextEditing: () => this.textEdit.isActive(),
      notifyElementAdded: (id) => this.history?.recordAdd(this.scene, id),
      notifyElementsRemoved: (snapshots) => this.history?.recordRemovals(snapshots),
      notifyElementUpdated: (before, after) => this.history?.recordUpdate(before, after),
      notifyElementsUpdated: (pairs) => this.history?.recordUpdates(pairs),
    }

    this.canvas = createCanvasManager(this.container, () => {
      renderLoopSlot.current?.requestAll()
    })
    toolContext.canvas = this.canvas

    this.toolManager = new ToolManager(toolContext)

    this.renderLoop = new RenderLoop({
      canvas: this.canvas,
      viewport: this.viewport,
      scene: this.scene,
      backgroundColor: this.backgroundColor,
      gridEnabled: this.gridEnabled,
      gridStyle: this.gridStyle,
      getSelection: () => this.selection,
      getPenPreview: () => {
        const t = this.toolManager.getActiveToolName()
        if (t !== 'pen') return null
        const pts = this.toolManager.pen.getPreviewPoints()
        return pts.length ? pts : null
      },
      getPenPreviewStyle: () => ({
        stroke: this.penOptions.color,
        strokeWidth: this.penOptions.strokeWidth,
        strokeDash: this.penOptions.strokeDash,
        opacity: this.penOptions.opacity,
      }),
      getShapePreview: () => this.toolManager.getShapePreview(),
      getActiveTool: () => this.toolManager.getActiveToolName(),
      getMarqueeRect: () => this.toolManager.getMarqueeRect(),
      getLaserSegments: () => {
        const segs = this.toolManager.laser.getSegments()
        return segs.length > 0 ? segs : null
      },
      getConnectorPlacementPreview: () => this.toolManager.getArrowConnectPreview(),
    })
    renderLoopSlot.current = this.renderLoop

    this.textEdit = new TextEditOverlay({
      container: options.textOverlayParent ?? this.canvas.container,
      positionAnchor: this.canvas.container,
      viewport: this.viewport,
      getScene: () => this.scene,
      getTextPlacementStyle: () => ({
        color: this.penOptions.color,
        strokeColor: this.penOptions.textStrokeColor,
        strokeWidth: this.penOptions.textStrokeWidth,
        fontFamily: this.penOptions.textFontFamily,
        fontSize: this.penOptions.textFontSize,
        textAlign: this.penOptions.textAlign,
        opacity: this.penOptions.opacity,
      }),
      notifyElementAdded: (id) => this.history?.recordAdd(this.scene, id),
      notifyElementsRemoved: (snapshots) => this.history?.recordRemovals(snapshots),
      notifyElementUpdated: (before, after) => this.history?.recordUpdate(before, after),
      onCommitted: (info) => {
        if (info.kind === 'edit' && info.elementId) {
          const still = this.scene.getById(info.elementId)
          if (!still) {
            this.selection = this.selection.filter((id) => id !== info.elementId)
            this.notifySelectionChange()
          }
        }
        this.events.emit('scene:change', this.scene.getElements())
        if (info.kind === 'create' && info.elementId) {
          this.selection = [info.elementId]
          this.notifySelectionChange()
          this.applyTool('select')
        }
        renderLoopSlot.current?.requestAll()
      },
    })

    this.input = new InputManager({
      element: this.canvas.interactiveCanvas,
      viewport: this.viewport,
      shouldForcePan: () => this.handMode,
      shouldHandleUndoRedo: () => !this.textEdit.isActive(),
      callbacks: {
        onToolPointerDown: (wx, wy, pid, e) => {
          this.toolManager.onPointerDown(wx, wy, pid, e)
          const active = this.toolManager.getActiveToolName()
          if (active === 'text' && e.button === 0) {
            e.preventDefault()
          }
          if (active !== 'select' && active !== 'text' && active !== 'image' && e.button === 0) {
            try {
              this.canvas.interactiveCanvas.setPointerCapture(e.pointerId)
            } catch {
              /* ignore */
            }
          }
          this.updateHoverCursor(wx, wy)
        },
        onToolPointerMove: (wx, wy, pid, e) => {
          this.toolManager.onPointerMove(wx, wy, pid, e)
          this.updateHoverCursor(wx, wy)
        },
        onToolPointerUp: (wx, wy, pid, e) => {
          this.toolManager.onPointerUp(wx, wy, pid, e)
          try {
            this.canvas.interactiveCanvas.releasePointerCapture(e.pointerId)
          } catch {
            /* ignore */
          }
        },
        onToolPointerCancel: (pid) => {
          this.toolManager.onPointerCancel()
          try {
            this.canvas.interactiveCanvas.releasePointerCapture(pid)
          } catch {
            /* ignore */
          }
        },
        onToolDoubleClick: (wx, wy, e) => {
          e.preventDefault()
          this.toolManager.onDoubleClick(wx, wy)
        },
        onPanDelta: (dx, dy) => {
          this.viewport.panScreen(dx, dy)
          this.events.emit('viewport:change', this.viewport.toState())
          this.textEdit.syncFromViewport()
          this.renderLoop.requestAll()
        },
        onZoomAtScreen: (sx, sy, factor) => {
          this.viewport.zoomAtScreenPoint(sx, sy, factor)
          this.events.emit('viewport:change', this.viewport.toState())
          this.textEdit.syncFromViewport()
          this.renderLoop.requestAll()
        },
        onDelete: () => this.deleteSelected(),
        onUndo: () => this.undo(),
        onRedo: () => this.redo(),
        onGroup: () => this.groupSelection(),
        onUngroup: () => this.ungroupSelection(),
        onSelectAll: () => this.selectAll(),
      },
    })

    this.input.attach()
    this.canvas.interactiveCanvas.addEventListener('pointerleave', this.onCanvasPointerLeave)
    this.renderLoop.requestAll()
    this.syncInteractiveCursor()
  }

  private onCanvasPointerLeave = (): void => {
    this.toolManager.clearShapeHover()
    this.syncInteractiveCursor()
    this.renderLoop.requestInteractive()
  }

  private updateHoverCursor(worldX: number, worldY: number): void {
    if (this.handMode) {
      this.canvas.interactiveCanvas.style.cursor = 'grab'
      this.renderLoop.requestInteractive()
      return
    }
    const resizeHint = this.toolManager.getSelectResizeHoverCursor(worldX, worldY)
    if (resizeHint !== null) {
      this.canvas.interactiveCanvas.style.cursor = resizeHint
    } else {
      const moveHint = this.toolManager.getSelectBodyDragCursor(worldX, worldY)
      if (moveHint !== null) {
        this.canvas.interactiveCanvas.style.cursor = moveHint
      } else {
        this.syncInteractiveCursor()
      }
    }
  }

  private notifySelectionChange(): void {
    this.events.emit('selection:change', this.selection)
    this.events.emit('style:change', this.getEffectiveStyle())
  }

  setTool(name: ToolName): void {
    this.applyTool(name)
  }

  private applyTool(name: ToolName): void {
    if (this.toolManager.getActiveToolName() === name) return
    this.toolManager.setTool(name)
    this.syncInteractiveCursor()
    this.renderLoop.requestInteractive()
    this.events.emit('tool:change', name)
  }

  private syncInteractiveCursor(): void {
    const canvas = this.canvas.interactiveCanvas
    if (this.handMode) {
      canvas.style.cursor = 'grab'
      return
    }
    const t = this.toolManager.getActiveToolName()
    if (t === 'eraser') {
      canvas.style.cursor = ERASER_CURSOR_CSS
    } else if (t === 'laser') {
      canvas.style.cursor = LASER_CURSOR_CSS
    } else if (TOOLS_WITH_CROSSHAIR.has(t)) {
      canvas.style.cursor = 'crosshair'
    } else if (t === 'text') {
      canvas.style.cursor = 'text'
    } else if (t === 'image') {
      canvas.style.cursor = 'crosshair'
    } else {
      canvas.style.cursor = ''
    }
  }

  getActiveTool(): ToolName {
    return this.toolManager.getActiveToolName()
  }

  /**
   * Insert a raster at the visible viewport center (scaled so width ≤ 400 world units).
   * `offsetWorld` shifts placement for stacking multiple imports in one action.
   * With `appendToSelection`, the new id is added to the current selection instead of replacing it.
   */
  insertImageFromDataUrl(
    src: string,
    naturalWidth: number,
    naturalHeight: number,
    offsetWorld = 0,
    appendToSelection = false,
  ): string | undefined {
    if (this.destroyed) return undefined
    if (naturalWidth <= 0 || naturalHeight <= 0) return undefined
    const maxW = 400
    const scale = Math.min(1, maxW / naturalWidth)
    const w = naturalWidth * scale
    const h = naturalHeight * scale
    const size = this.canvas.getSize()
    const vb = this.viewport.getVisibleWorldBounds(size.width, size.height)
    const cx = (vb.minX + vb.maxX) / 2 + offsetWorld
    const cy = (vb.minY + vb.maxY) / 2 + offsetWorld
    const el = createImageElement(
      cx - w / 2,
      cy - h / 2,
      w,
      h,
      src,
      defaultElementStyle({
        stroke: 'transparent',
        fill: 'transparent',
        strokeWidth: 0,
        opacity: this.penOptions.opacity,
        strokeDash: 'solid',
      }),
      naturalWidth / naturalHeight,
    )
    this.scene.addElement(el)
    this.history?.recordAdd(this.scene, el.id)
    this.selection = appendToSelection ? [...this.selection, el.id] : [el.id]
    this.notifySelectionChange()
    this.events.emit('scene:change', this.scene.getElements())
    this.renderLoop.requestAll()
    return el.id
  }

  setPenOptions(opts: Partial<PenOptions>): void {
    this.penOptions = { ...this.penOptions, ...opts }
    this.events.emit('style:change', this.getEffectiveStyle())
  }

  /** Current pen / placement defaults (drives the style panel when nothing is selected). */
  getPenOptions(): Readonly<PenOptions> {
    return this.penOptions
  }

  /** Apply style to selected elements (shapes use `ElementStyle`; text uses stroke/fill/width as outline/fill + typography). */
  setSelectedStyle(style: SelectionStylePatch): void {
    const shapePatch = pickShapeStylePatch(style)
    const hasShapeKeys = Object.keys(shapePatch).length > 0
    const hasTextKeys = hasTextStylePatch(style)

    if (this.selection.length === 0) {
      const t = this.toolManager.getActiveToolName()
      if (t === 'text') {
        if (hasTextKeys) {
          if (style.stroke !== undefined) this.penOptions = { ...this.penOptions, textStrokeColor: style.stroke }
          if (style.fill !== undefined && style.fill !== 'transparent') this.penOptions = { ...this.penOptions, color: style.fill }
          if (style.strokeWidth !== undefined) this.penOptions = { ...this.penOptions, textStrokeWidth: style.strokeWidth }
          if (style.opacity !== undefined) this.penOptions = { ...this.penOptions, opacity: style.opacity }
          if (style.fontFamily !== undefined) this.penOptions = { ...this.penOptions, textFontFamily: style.fontFamily }
          if (style.fontSize !== undefined) this.penOptions = { ...this.penOptions, textFontSize: style.fontSize }
          if (style.textAlign !== undefined) this.penOptions = { ...this.penOptions, textAlign: style.textAlign }
        }
      } else if (t === 'image') {
        if (style.opacity !== undefined) this.penOptions = { ...this.penOptions, opacity: style.opacity }
      } else if (t !== 'select' && t !== 'eraser' && t !== 'laser') {
        if (hasShapeKeys) {
          if (style.stroke !== undefined) this.penOptions = { ...this.penOptions, color: style.stroke }
          if (style.fill !== undefined) this.penOptions = { ...this.penOptions, fill: style.fill }
          if (style.strokeWidth !== undefined) this.penOptions = { ...this.penOptions, strokeWidth: style.strokeWidth }
          if (style.opacity !== undefined) this.penOptions = { ...this.penOptions, opacity: style.opacity }
          if (style.strokeDash !== undefined) this.penOptions = { ...this.penOptions, strokeDash: style.strokeDash }
        }
      }
      this.events.emit('style:change', this.getEffectiveStyle())
      return
    }

    const pairs: { before: Element; after: Element }[] = []
    let updatedShape = false
    let updatedText = false

    for (const id of this.selection) {
      const el = this.scene.getById(id)
      if (!el) continue
      if (el.type === 'text') {
        if (!hasTextKeys) continue
        const before = cloneElement(el)
        this.scene.updateElement(id, (e) => {
          if (e.type !== 'text') return e
          let next = { ...e }
          if (style.stroke !== undefined) next = { ...next, strokeColor: style.stroke }
          if (style.fill !== undefined && style.fill !== 'transparent') next = { ...next, color: style.fill }
          if (style.strokeWidth !== undefined) next = { ...next, strokeWidth: style.strokeWidth }
          if (style.opacity !== undefined) next = { ...next, opacity: style.opacity }
          if (style.fontFamily !== undefined) next = { ...next, fontFamily: style.fontFamily }
          if (style.fontSize !== undefined) next = { ...next, fontSize: style.fontSize }
          if (style.textAlign !== undefined) next = { ...next, textAlign: style.textAlign }
          return next
        })
        const after = this.scene.getById(id)
        if (after) {
          pairs.push({ before, after: cloneElement(after) })
          updatedText = true
        }
      } else if (hasShapeKeys) {
        const before = cloneElement(el)
        this.scene.updateElement(id, (e) => {
          if (e.type === 'text') return e
          return { ...e, style: { ...e.style, ...shapePatch } }
        })
        const after = this.scene.getById(id)
        if (after) {
          pairs.push({ before, after: cloneElement(after) })
          updatedShape = true
        }
      }
    }

    if (pairs.length > 0) {
      this.history?.recordUpdates(pairs)
      this.events.emit('scene:change', this.scene.getElements())
      this.renderLoop.requestStatic()
    }

    if (updatedShape) {
      if (style.stroke !== undefined) this.penOptions = { ...this.penOptions, color: style.stroke }
      if (style.fill !== undefined) this.penOptions = { ...this.penOptions, fill: style.fill }
      if (style.strokeWidth !== undefined) this.penOptions = { ...this.penOptions, strokeWidth: style.strokeWidth }
      if (style.opacity !== undefined) this.penOptions = { ...this.penOptions, opacity: style.opacity }
      if (style.strokeDash !== undefined) this.penOptions = { ...this.penOptions, strokeDash: style.strokeDash }
    }
    if (updatedText) {
      if (style.stroke !== undefined) this.penOptions = { ...this.penOptions, textStrokeColor: style.stroke }
      if (style.fill !== undefined && style.fill !== 'transparent') this.penOptions = { ...this.penOptions, color: style.fill }
      if (style.strokeWidth !== undefined) this.penOptions = { ...this.penOptions, textStrokeWidth: style.strokeWidth }
      if (style.opacity !== undefined) this.penOptions = { ...this.penOptions, opacity: style.opacity }
      if (style.fontFamily !== undefined) this.penOptions = { ...this.penOptions, textFontFamily: style.fontFamily }
      if (style.fontSize !== undefined) this.penOptions = { ...this.penOptions, textFontSize: style.fontSize }
      if (style.textAlign !== undefined) this.penOptions = { ...this.penOptions, textAlign: style.textAlign }
    }

    this.events.emit('style:change', this.getEffectiveStyle())
  }

  /** Selected style for the panel, or pen defaults when nothing relevant is selected. */
  getEffectiveStyle(): ElementStyle {
    if (this.selection.length > 0) {
      const allText = this.selection.every((id) => this.scene.getById(id)?.type === 'text')
      if (allText) {
        const first = this.scene.getById(this.selection[0]!)
        if (first?.type === 'text') {
          const t = normalizeTextElement(first)
          return defaultElementStyle({
            stroke: t.strokeColor,
            fill: t.color,
            strokeWidth: t.strokeWidth,
            opacity: t.opacity,
            strokeDash: 'solid',
          })
        }
      }
      if (this.selection.length === 1) {
        const el = this.scene.getById(this.selection[0]!)
        if (el && el.type !== 'text') return { ...el.style }
      }
    }
    return defaultElementStyle({
      stroke: this.penOptions.color,
      fill: this.penOptions.fill,
      strokeWidth: this.penOptions.strokeWidth,
      opacity: this.penOptions.opacity,
      strokeDash: this.penOptions.strokeDash,
    })
  }

  setBackgroundColor(color: string): void {
    this.backgroundColor = color
    this.renderLoop.updateOptions({ backgroundColor: color })
    this.renderLoop.requestStatic()
  }

  setGridEnabled(enabled: boolean): void {
    this.gridEnabled = enabled
    this.renderLoop.updateOptions({ gridEnabled: enabled })
    this.renderLoop.requestStatic()
  }

  isGridEnabled(): boolean {
    return this.gridEnabled
  }

  setGridStyle(style: GridStyle): void {
    this.gridStyle = style
    this.renderLoop.updateOptions({ gridStyle: style })
    this.renderLoop.requestStatic()
  }

  getGridStyle(): GridStyle {
    return this.gridStyle
  }

  /** Download the static canvas (background, grid, elements) as a PNG file. */
  exportToPngDownload(filename = 'bembeyaz.png'): void {
    if (this.destroyed) return
    this.renderLoop.flush()
    const url = this.canvas.staticCanvas.toDataURL('image/png')
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  setHandMode(enabled: boolean): void {
    this.handMode = enabled
    this.syncInteractiveCursor()
    this.renderLoop.requestInteractive()
  }

  isHandMode(): boolean {
    return this.handMode
  }

  undo(): boolean {
    if (!this.history) return false
    let ok = false
    this.scene.runSuppressingCollaboration(() => {
      ok = this.history!.undo(this.scene)
    })
    if (!ok) return false
    this.pruneSelection()
    this.events.emit('scene:change', this.scene.getElements())
    this.renderLoop.requestAll()
    return true
  }

  redo(): boolean {
    if (!this.history) return false
    let ok = false
    this.scene.runSuppressingCollaboration(() => {
      ok = this.history!.redo(this.scene)
    })
    if (!ok) return false
    this.pruneSelection()
    this.events.emit('scene:change', this.scene.getElements())
    this.renderLoop.requestAll()
    return true
  }

  canUndo(): boolean {
    return this.history?.canUndo() ?? false
  }

  canRedo(): boolean {
    return this.history?.canRedo() ?? false
  }

  /**
   * Apply ops from another client or from your server (e.g. Supabase Realtime `broadcast` / `postgres_changes`).
   * Does not re-invoke {@link BembeyazOptions.onChange}. Emits `scene:change` after applying.
   */
  applyOperations(ops: readonly SceneOperation[], options?: ApplyOperationsOptions): ApplyOperationsResult {
    const result = this.scene.runSuppressingCollaboration(() =>
      applySceneOperations(this.scene, ops, options),
    )
    this.pruneSelection()
    this.events.emit('scene:change', this.scene.getElements())
    this.renderLoop.requestAll()
    return result
  }

  /** Update local presence (cursor, color, name); emits `presence:change`. */
  setLocalPresence(patch: Partial<Omit<PresencePeer, 'userId'>>): void {
    this.presence.patchLocal(patch)
    this.events.emit('presence:change', this.presence.getSnapshot())
  }

  /** Merge remote presence; pass `null` to remove a peer. */
  applyRemotePresence(userId: string, patch: Partial<PresencePeer> | null): void {
    this.presence.applyRemote(userId, patch)
    this.events.emit('presence:change', this.presence.getSnapshot())
  }

  getPresence(): ReadonlyMap<string, PresencePeer> {
    return this.presence.getSnapshot()
  }

  getLocalUserId(): string {
    return this.presence.getLocalUserId()
  }

  private enqueueCollaboration(op: SceneOperation): void {
    if (!this.onChange) return
    this.pendingCollabOps.push(op)
    if (this.collabFlushScheduled) return
    this.collabFlushScheduled = true
    queueMicrotask(() => {
      this.collabFlushScheduled = false
      if (this.pendingCollabOps.length === 0) return
      const batch = [...this.pendingCollabOps]
      this.pendingCollabOps = []
      this.onChange?.(batch)
    })
  }

  private pruneSelection(): void {
    const valid = new Set(this.scene.getElements().map((e) => e.id))
    const next = this.selection.filter((id) => valid.has(id))
    if (next.length !== this.selection.length) {
      this.selection = next
      this.notifySelectionChange()
    }
  }

  on<K extends keyof import('./types.js').BembeyazEventMap>(
    event: K,
    fn: import('./types.js').BembeyazEventMap[K],
  ): () => void {
    return this.events.on(event, fn as never)
  }

  off<K extends keyof import('./types.js').BembeyazEventMap>(
    event: K,
    fn: import('./types.js').BembeyazEventMap[K],
  ): void {
    this.events.off(event, fn as never)
  }

  toJSON(): SerializedScene {
    return serializeDocument(this.scene, this.viewport)
  }

  fromJSON(data: unknown): void {
    const parsed = parseSerializedSceneJson(data)
    this.history?.clear()
    this.scene.runSuppressingCollaboration(() => {
      applySerializedScene(parsed, this.scene, this.viewport)
    })
    this.selection = []
    this.events.emit('scene:change', this.scene.getElements())
    this.notifySelectionChange()
    this.events.emit('viewport:change', this.viewport.toState())
    this.renderLoop.requestAll()
  }

  getElements(): readonly Element[] {
    return this.scene.getElements()
  }

  clearSelection(): void {
    if (this.selection.length === 0) return
    this.selection = []
    this.notifySelectionChange()
    this.renderLoop.requestInteractive()
  }

  /** Select every element in the scene and switch to the select tool. */
  selectAll(): void {
    this.selection = this.scene.getElements().map((e) => e.id)
    this.notifySelectionChange()
    this.applyTool('select')
    this.renderLoop.requestAll()
  }

  /** Assign one shared `groupId` to all currently selected elements (needs at least two). */
  groupSelection(): void {
    const sel = [...this.selection]
    if (sel.length < 2) return
    const gid = createId()
    const pairs: { before: Element; after: Element }[] = []
    for (const id of sel) {
      const el = this.scene.getById(id)
      if (!el) continue
      const before = cloneElement(el)
      this.scene.updateElement(id, (e) => ({ ...e, groupId: gid }))
      const after = this.scene.getById(id)
      if (after) pairs.push({ before, after: cloneElement(after) })
    }
    if (pairs.length === 0) return
    this.history?.recordUpdates(pairs)
    this.events.emit('scene:change', this.scene.getElements())
    this.renderLoop.requestAll()
  }

  /** Clear grouping for every element sharing a group with the current selection. */
  ungroupSelection(): void {
    const groupIds = new Set<string>()
    for (const id of this.selection) {
      const el = this.scene.getById(id)
      if (el?.groupId) groupIds.add(el.groupId)
    }
    if (groupIds.size === 0) return
    const pairs: { before: Element; after: Element }[] = []
    for (const el of this.scene.getElements()) {
      if (!el.groupId || !groupIds.has(el.groupId)) continue
      const before = cloneElement(el)
      this.scene.updateElement(el.id, (e) => ({ ...e, groupId: undefined }))
      const after = this.scene.getById(el.id)
      if (after) pairs.push({ before, after: cloneElement(after) })
    }
    if (pairs.length === 0) return
    this.history?.recordUpdates(pairs)
    this.events.emit('scene:change', this.scene.getElements())
    this.renderLoop.requestAll()
  }

  deleteSelected(): void {
    if (this.selection.length === 0) return
    const expanded = expandSelectionByGroup(this.scene, this.selection)
    this.selection = expanded
    const captured: { index: number; element: Element }[] = []
    for (const id of this.selection) {
      const idx = this.scene.indexOfElement(id)
      const el = this.scene.getById(id)
      if (idx >= 0 && el) captured.push({ index: idx, element: cloneElement(el) })
    }
    captured.sort((a, b) => b.index - a.index)
    for (const { element } of captured) {
      this.scene.removeElement(element.id)
    }
    if (captured.length > 0) {
      this.history?.recordRemovals(captured.map((s) => ({ index: s.index, element: s.element })))
    }
    this.selection = []
    this.events.emit('scene:change', this.scene.getElements())
    this.notifySelectionChange()
    this.renderLoop.requestAll()
  }

  clear(): void {
    this.history?.clear()
    this.scene.clear()
    this.selection = []
    this.events.emit('scene:change', this.scene.getElements())
    this.notifySelectionChange()
    this.renderLoop.requestAll()
  }

  resize(width: number, height: number): void {
    this.container.style.width = `${width}px`
    this.container.style.height = `${height}px`
    this.renderLoop.requestAll()
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    this.textEdit.dispose()
    this.canvas.interactiveCanvas.removeEventListener('pointerleave', this.onCanvasPointerLeave)
    this.input.detach()
    this.toolManager.destroy()
    this.renderLoop.destroy()
    this.canvas.destroy()
    this.scene.setCollaborationSink(undefined)
    this.events.removeAllListeners()
  }
}

function pickShapeStylePatch(style: SelectionStylePatch): Partial<ElementStyle> {
  const out: Partial<ElementStyle> = {}
  if (style.stroke !== undefined) out.stroke = style.stroke
  if (style.fill !== undefined) out.fill = style.fill
  if (style.strokeWidth !== undefined) out.strokeWidth = style.strokeWidth
  if (style.opacity !== undefined) out.opacity = style.opacity
  if (style.strokeDash !== undefined) out.strokeDash = style.strokeDash
  return out
}

function hasTextStylePatch(style: SelectionStylePatch): boolean {
  return (
    style.stroke !== undefined ||
    (style.fill !== undefined && style.fill !== 'transparent') ||
    style.strokeWidth !== undefined ||
    style.opacity !== undefined ||
    style.fontFamily !== undefined ||
    style.fontSize !== undefined ||
    style.textAlign !== undefined
  )
}

function serializeDocument(scene: Scene, viewport: Viewport): SerializedScene {
  return {
    version: 1,
    elements: scene.getElements().map((el) => cloneElement(el)),
    viewport: viewport.toState(),
  }
}

function applySerializedScene(data: SerializedScene, scene: Scene, viewport: Viewport): void {
  if (data.version !== 1) {
    throw new Error(`Bembeyaz: unsupported scene version ${data.version}`)
  }
  viewport.fromState(data.viewport)
  scene.setElements(data.elements.map((el) => migrateLegacyElement(cloneElement(el))))
}

function parseSerializedSceneJson(json: unknown): SerializedScene {
  if (!json || typeof json !== 'object') {
    throw new Error('Bembeyaz: invalid JSON')
  }
  const o = json as Record<string, unknown>
  if (o.version !== 1) {
    throw new Error('Bembeyaz: unsupported scene version')
  }
  if (!Array.isArray(o.elements)) {
    throw new Error('Bembeyaz: invalid elements')
  }
  const vp = o.viewport as ViewportState | undefined
  if (!vp || typeof vp.offsetX !== 'number' || typeof vp.offsetY !== 'number' || typeof vp.zoom !== 'number') {
    throw new Error('Bembeyaz: invalid viewport')
  }
  return {
    version: 1,
    elements: o.elements as Element[],
    viewport: vp,
  }
}
