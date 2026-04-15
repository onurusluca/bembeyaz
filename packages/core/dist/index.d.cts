/** Remote or local user overlay for cursors / avatars (wire to Supabase Presence or Broadcast). */
interface PresencePeer {
    userId: string;
    /** CSS color for cursor / ring */
    color: string;
    name?: string;
    cursorWorld?: {
        x: number;
        y: number;
    };
}
/** Mutable presence registry; engine holds one instance. */
declare class PresenceStore {
    private localUserId;
    private readonly peers;
    constructor(localUserId?: string);
    getLocalUserId(): string;
    /** Re-point local identity (e.g. after auth); keeps prior local entry merged by userId change only if you also migrate — caller should re-patch. */
    setLocalUserId(userId: string): void;
    /** Merge into the local peer and store. */
    patchLocal(patch: Partial<Omit<PresencePeer, 'userId'>>): PresencePeer;
    /** Apply a remote payload; `null` removes the peer. */
    applyRemote(userId: string, patch: Partial<PresencePeer> | null): void;
    getSnapshot(): ReadonlyMap<string, PresencePeer>;
}

interface AABB {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
}

declare class Scene {
    private elements;
    private dirty;
    private spatial;
    private collaborationSuppress;
    private collaborationSink?;
    /** Emit local scene mutations for collaboration (insert / update / delete). Undo/redo and remote apply use {@link runSuppressingCollaboration}. */
    setCollaborationSink(sink: ((op: SceneOperation) => void) | undefined): void;
    runSuppressingCollaboration<T>(fn: () => T): T;
    private emitCollaboration;
    getElements(): readonly Element[];
    isDirty(): boolean;
    markClean(): void;
    markDirty(): void;
    addElement(el: Element): void;
    removeElement(id: string): boolean;
    /**
     * @param options.emitCollaboration — Set `false` while coalescing many moves (e.g. pointer drag);
     * call {@link emitCollaborationUpdate} once when the gesture ends so wire payloads stay small for heavy elements (images).
     */
    updateElement(id: string, updater: (el: Element) => Element, options?: {
        emitCollaboration?: boolean;
    }): boolean;
    /** One `update` op for the current element (after silent `updateElement` during a drag). */
    emitCollaborationUpdate(id: string, baseVersion: number): boolean;
    getById(id: string): Element | undefined;
    /** Paint order index (0 = bottom). */
    indexOfElement(id: string): number;
    insertElementAt(index: number, el: Element): void;
    /** Replace element by id with an exact snapshot (used by undo/redo; no version bump). */
    replaceElementSnapshot(id: string, snapshot: Element): boolean;
    /** Top-most hit first (reverse paint order) */
    getElementAtWorldPoint(x: number, y: number, hitThresholdWorld: number): Element | undefined;
    getElementsInRect(rect: AABB): Element[];
    /** Elements whose bounds overlap `rect` (e.g. marquee), top-most order preserved. */
    getElementsIntersectingRect(rect: AABB): Element[];
    clear(): void;
    /** Replace all elements (e.g. load document). Prefer calling inside {@link runSuppressingCollaboration} so loads do not emit collaboration ops. */
    setElements(elements: Element[]): void;
    private rebuildIndex;
}

/**
 * Serializable scene mutation for syncing to a backend (e.g. Supabase) or applying remote peers' edits.
 * Insert and normal updates carry full element snapshots so the wire format is self-contained.
 * Local translate/resize drags coalesce to a single update per element on pointer up (see `Scene.updateElement`).
 */
type SceneOperation = {
    type: 'insert';
    element: Element; /** Paint order; omit to append. */
    index?: number;
} | {
    type: 'update';
    id: string;
    element: Element;
    /** Version the editor believed the element had before applying this update (optimistic concurrency). */
    baseVersion?: number;
} | {
    type: 'delete';
    id: string;
    baseVersion?: number;
};
interface ApplyOperationsOptions {
    /**
     * How to resolve update/delete when `baseVersion` does not match the current element version.
     * - `base-version` (default): skip conflicting ops (listed in `conflicts`).
     * - `last-write-wins`: apply the incoming element if `op.element.version` is greater than the current version (updates only).
     */
    conflictStrategy?: 'base-version' | 'last-write-wins';
    /** When a remote insert targets an id that already exists. Default `skip`. */
    duplicateInsert?: 'skip' | 'replace';
}
interface ApplyOperationIssue {
    op: SceneOperation;
    reason: string;
}
interface ApplyOperationsResult {
    /** Operations that were applied successfully (canonical copies). */
    applied: SceneOperation[];
    /** Ops ignored (e.g. delete missing id). */
    skipped: ApplyOperationIssue[];
    /** Ops not applied due to version / conflict rules. */
    conflicts: ApplyOperationIssue[];
}
declare function applySceneOperations(scene: Scene, ops: readonly SceneOperation[], options?: ApplyOperationsOptions): ApplyOperationsResult;

/** 2D point in world space */
interface Point {
    x: number;
    y: number;
}
type StrokeDash = 'solid' | 'dashed' | 'dotted';
/** Stroke / fill styling for drawable elements */
interface ElementStyle {
    stroke: string;
    /** CSS color or 'transparent' for no fill */
    fill: string;
    strokeWidth: number;
    /** 0–1 */
    opacity: number;
    strokeDash: StrokeDash;
}
type ElementType = 'path' | 'rectangle' | 'ellipse' | 'line' | 'arrow' | 'text' | 'image';
/** Which edge of a box-like shape an endpoint sits on (ellipse manual uses `t` as angle/2π only). */
type ConnectorEdgeSide = 'n' | 'e' | 's' | 'w';
interface BaseElement {
    id: string;
    type: ElementType;
    version: number;
    /** Shared id: elements with the same `groupId` select and move together. */
    groupId?: string;
}
/** Freehand stroke as a polyline in world coordinates */
interface PathElement extends BaseElement {
    type: 'path';
    points: Point[];
    style: ElementStyle;
}
interface RectangleElement extends BaseElement {
    type: 'rectangle';
    x: number;
    y: number;
    width: number;
    height: number;
    style: ElementStyle;
}
interface EllipseElement extends BaseElement {
    type: 'ellipse';
    x: number;
    y: number;
    width: number;
    height: number;
    style: ElementStyle;
}
interface LineElement extends BaseElement {
    type: 'line';
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    style: ElementStyle;
}
interface ArrowElement extends BaseElement {
    type: 'arrow';
    /** Free arrow: segment (x1,y1)→(x2,y2). Ignored when `sourceId` + `targetId` are set. */
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    style: ElementStyle;
    /** Attached arrow: anchors on shapes; smooth quadratic uses `bendOffset` from chord mid. */
    sourceId?: string;
    targetId?: string;
    sourceManual?: boolean;
    sourceSide?: ConnectorEdgeSide;
    sourceT?: number;
    targetManual?: boolean;
    targetSide?: ConnectorEdgeSide;
    targetT?: number;
    bendOffsetX?: number;
    bendOffsetY?: number;
    label?: string;
}
type TextAlign = 'left' | 'center' | 'right';
/** Multi-line label; coordinates are top-left of the layout box in world space. */
interface TextElement extends BaseElement {
    type: 'text';
    x: number;
    y: number;
    /** Minimum / wrapping width in world units; actual bounds use measured width. */
    width: number;
    height: number;
    text: string;
    fontSize: number;
    fontFamily: string;
    /** Fill colour of glyphs */
    color: string;
    /** Outline colour (used when `strokeWidth` > 0). */
    strokeColor: string;
    /** Outline width in world units; 0 = no outline */
    strokeWidth: number;
    textAlign: TextAlign;
    /** 0–1 */
    opacity: number;
}
/** Raster image in world space; `style.opacity` controls alpha (stroke/fill are unused for drawing). */
interface ImageElement extends BaseElement {
    type: 'image';
    x: number;
    y: number;
    width: number;
    height: number;
    /** Data URL or same-origin URL */
    src: string;
    /** width ÷ height of the bitmap; corner resize keeps this ratio. */
    aspectRatio: number;
    style: ElementStyle;
}
/** Keys from `ElementStyle` plus typography for text; used by the style panel + `setSelectedStyle`. */
type SelectionStylePatch = Partial<ElementStyle> & {
    fontFamily?: string;
    fontSize?: number;
    textAlign?: TextAlign;
};
type Element = PathElement | RectangleElement | EllipseElement | LineElement | ArrowElement | TextElement | ImageElement;
type ToolName = 'pen' | 'select' | 'eraser' | 'rectangle' | 'ellipse' | 'line' | 'arrow' | 'text' | 'image' | 'laser';
interface PenOptions {
    color: string;
    strokeWidth: number;
    /** CSS color or 'transparent' for no fill */
    fill: string;
    /** 0–1 */
    opacity: number;
    strokeDash: StrokeDash;
    /** Defaults for the next placed text box */
    textFontFamily: string;
    textFontSize: number;
    textAlign: TextAlign;
    textStrokeColor: string;
    /** Outline width for new text (0 = none) */
    textStrokeWidth: number;
}
interface ViewportState {
    offsetX: number;
    offsetY: number;
    zoom: number;
}
/** How the background grid is drawn when `gridEnabled` is true. */
type GridStyle = 'lines' | 'dots';
type CollaborationChangeHandler = (operations: readonly SceneOperation[]) => void;
type PresenceChangeHandler = (peers: ReadonlyMap<string, PresencePeer>) => void;
interface BembeyazOptions {
    container: HTMLElement;
    /**
     * Host for the floating text editor layer (defaults to the canvas container).
     * Use the app shell (e.g. `.bbz-wrap`) so the textarea stacks above the dock.
     */
    textOverlayParent?: HTMLElement;
    /** CSS color */
    backgroundColor?: string;
    /** When true (default), draws the background grid using {@link gridStyle}. */
    gridEnabled?: boolean;
    /** `lines` (default) or `dots`. Ignored when the grid is hidden. */
    gridStyle?: GridStyle;
    /** Max undo steps; set to 0 to disable undo/redo. Default 100. */
    historyDepth?: number;
    /**
     * Batched operation log for local edits (e.g. persist to Postgres or broadcast via Supabase Realtime).
     * Flushed once per microtask so rapid updates coalesce into one array.
     */
    onChange?: CollaborationChangeHandler;
    /** Stable id for {@link BembeyazEventMap} `presence:change` local peer (defaults to a random id). */
    localUserId?: string;
}
interface SerializedScene {
    version: 1;
    elements: Element[];
    viewport: ViewportState;
}
type SceneChangeHandler = (elements: readonly Element[]) => void;
type SelectionChangeHandler = (ids: readonly string[]) => void;
type ViewportChangeHandler = (viewport: ViewportState) => void;
type ToolChangeHandler = (tool: ToolName) => void;
type StyleChangeHandler = (style: ElementStyle) => void;
interface BembeyazEventMap {
    'scene:change': SceneChangeHandler;
    'selection:change': SelectionChangeHandler;
    'viewport:change': ViewportChangeHandler;
    'tool:change': ToolChangeHandler;
    'style:change': StyleChangeHandler;
    /** Local + remote presence entries (cursors, colors); drive from your sync layer. */
    'presence:change': PresenceChangeHandler;
}

/** World-units of trail kept while actively drawing (~3s at a moderate pace). */
declare const LASER_MAX_LENGTH = 550;
/** How long (ms) the remaining trail fades out after the pointer is released. */
declare const LASER_AFTER_FADE_MS = 900;
interface LaserPoint {
    x: number;
    y: number;
    /** Cumulative world-space distance from the start of this segment. */
    d: number;
}
interface LaserSegment {
    points: LaserPoint[];
    /** Timestamp when pointer was released; null while still drawing. */
    upAt: number | null;
}

declare class Bembeyaz {
    private readonly container;
    private readonly canvas;
    private readonly viewport;
    private readonly scene;
    private readonly history;
    private readonly events;
    private readonly toolManager;
    private renderLoop;
    private readonly input;
    private readonly textEdit;
    private backgroundColor;
    private gridEnabled;
    private gridStyle;
    private selection;
    private penOptions;
    private handMode;
    private destroyed;
    private readonly onChange?;
    private pendingCollabOps;
    private collabFlushScheduled;
    private readonly presence;
    private readonly remoteLaserByUser;
    private remoteLaserRaf;
    private readonly tickRemoteLaser;
    constructor(options: BembeyazOptions);
    private onCanvasPointerLeave;
    private updateHoverCursor;
    private notifySelectionChange;
    setTool(name: ToolName): void;
    private applyTool;
    private syncInteractiveCursor;
    getActiveTool(): ToolName;
    /**
     * Insert a raster at the visible viewport center (scaled so width ≤ 400 world units).
     * `offsetWorld` shifts placement for stacking multiple imports in one action.
     * With `appendToSelection`, the new id is added to the current selection instead of replacing it.
     */
    insertImageFromDataUrl(src: string, naturalWidth: number, naturalHeight: number, offsetWorld?: number, appendToSelection?: boolean): string | undefined;
    setPenOptions(opts: Partial<PenOptions>): void;
    /** Current pen / placement defaults (drives the style panel when nothing is selected). */
    getPenOptions(): Readonly<PenOptions>;
    /** Apply style to selected elements (shapes use `ElementStyle`; text uses stroke/fill/width as outline/fill + typography). */
    setSelectedStyle(style: SelectionStylePatch): void;
    /** Selected style for the panel, or pen defaults when nothing relevant is selected. */
    getEffectiveStyle(): ElementStyle;
    setBackgroundColor(color: string): void;
    setGridEnabled(enabled: boolean): void;
    isGridEnabled(): boolean;
    setGridStyle(style: GridStyle): void;
    getGridStyle(): GridStyle;
    /** Download the static canvas (background, grid, elements) as a PNG file. */
    exportToPngDownload(filename?: string): void;
    setHandMode(enabled: boolean): void;
    isHandMode(): boolean;
    undo(): boolean;
    redo(): boolean;
    canUndo(): boolean;
    canRedo(): boolean;
    /**
     * Apply ops from another client or from your server (e.g. Supabase Realtime `broadcast` / `postgres_changes`).
     * Does not re-invoke {@link BembeyazOptions.onChange}. Emits `scene:change` after applying.
     */
    applyOperations(ops: readonly SceneOperation[], options?: ApplyOperationsOptions): ApplyOperationsResult;
    /** Update local presence (cursor, color, name); emits `presence:change`. */
    setLocalPresence(patch: Partial<Omit<PresencePeer, 'userId'>>): void;
    /** Merge remote presence; pass `null` to remove a peer. */
    applyRemotePresence(userId: string, patch: Partial<PresencePeer> | null): void;
    /**
     * Remote laser strokes (same shape as `getLocalLaserSegments()`); feed from your Realtime broadcast.
     * Ignores the local `userId`.
     */
    applyRemoteLaser(userId: string, segments: readonly LaserSegment[] | null): void;
    /** Local laser segments (for broadcasting to peers). */
    getLocalLaserSegments(): readonly LaserSegment[];
    /**
     * Map global pointer coordinates (`PointerEvent.clientX` / `clientY`) to world space.
     * Matches the same transform as pen/laser input: rect is the **interactive canvas**, and
     * viewport offsets are in **CSS pixels** (not device pixels — do not multiply by `devicePixelRatio`).
     */
    clientPointToWorld(clientX: number, clientY: number): {
        x: number;
        y: number;
    };
    private pruneRemoteLaser;
    private hasRenderableRemoteLaser;
    getPresence(): ReadonlyMap<string, PresencePeer>;
    getLocalUserId(): string;
    private enqueueCollaboration;
    private pruneSelection;
    on<K extends keyof BembeyazEventMap>(event: K, fn: BembeyazEventMap[K]): () => void;
    off<K extends keyof BembeyazEventMap>(event: K, fn: BembeyazEventMap[K]): void;
    toJSON(): SerializedScene;
    fromJSON(data: unknown): void;
    getElements(): readonly Element[];
    clearSelection(): void;
    /** Select every element in the scene and switch to the select tool. */
    selectAll(): void;
    /** Assign one shared `groupId` to all currently selected elements (needs at least two). */
    groupSelection(): void;
    /** Clear grouping for every element sharing a group with the current selection. */
    ungroupSelection(): void;
    deleteSelected(): void;
    clear(): void;
    resize(width: number, height: number): void;
    destroy(): void;
}

interface BembeyazAppOptions extends Omit<BembeyazOptions, 'container'> {
    container: HTMLElement;
    locale?: 'en' | 'tr' | 'ja';
}
interface BembeyazApp {
    whiteboard: Bembeyaz;
    destroy(): void;
}
declare function createBembeyazApp(options: BembeyazAppOptions): BembeyazApp;

export { type ApplyOperationIssue, type ApplyOperationsOptions, type ApplyOperationsResult, type ArrowElement, type BembeyazApp, type BembeyazAppOptions, Bembeyaz as BembeyazEngine, type BembeyazEventMap, type BembeyazOptions, type CollaborationChangeHandler, type Element, type ElementStyle, type EllipseElement, type GridStyle, type ImageElement, LASER_AFTER_FADE_MS, LASER_MAX_LENGTH, type LaserPoint, type LaserSegment, type LineElement, type PathElement, type PenOptions, type Point, type PresenceChangeHandler, type PresencePeer, PresenceStore, type RectangleElement, type SceneOperation, type SelectionStylePatch, type SerializedScene, type StrokeDash, type TextAlign, type TextElement, type ToolName, type ViewportState, applySceneOperations, createBembeyazApp as createBembeyaz, createBembeyazApp };
