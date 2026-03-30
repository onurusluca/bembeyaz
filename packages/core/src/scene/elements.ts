import type {
  ArrowElement,
  Element,
  ElementStyle,
  EllipseElement,
  ImageElement,
  LineElement,
  PathElement,
  RectangleElement,
  TextAlign,
  TextElement,
} from '../types.js'
import type { AABB } from '../utils/math.js'
import { aabbIntersects, pointsAABB } from '../utils/math.js'
import { createId } from '../utils/id.js'
import { getAttachedArrowBounds, isAttachedArrow } from './connectorGeometry.js'
import type { Scene } from './Scene.js'

export const DEFAULT_TEXT_FONT_SIZE_WORLD = 16
export const DEFAULT_TEXT_FONT_FAMILY =
  'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'

export function defaultElementStyle(overrides?: Partial<ElementStyle>): ElementStyle {
  return {
    stroke: '#111111',
    fill: 'transparent',
    strokeWidth: 2,
    opacity: 1,
    strokeDash: 'solid',
    ...overrides,
  }
}

export function createPathElement(
  points: PathElement['points'],
  style: ElementStyle,
): PathElement {
  return {
    id: createId(),
    type: 'path',
    version: 1,
    points,
    style: { ...style },
  }
}

export function createRectangleElement(
  x: number,
  y: number,
  width: number,
  height: number,
  style: ElementStyle,
): RectangleElement {
  return {
    id: createId(),
    type: 'rectangle',
    version: 1,
    x,
    y,
    width,
    height,
    style: { ...style },
  }
}

export function createEllipseElement(
  x: number,
  y: number,
  width: number,
  height: number,
  style: ElementStyle,
): EllipseElement {
  return {
    id: createId(),
    type: 'ellipse',
    version: 1,
    x,
    y,
    width,
    height,
    style: { ...style },
  }
}

export function createLineElement(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  style: ElementStyle,
): LineElement {
  return {
    id: createId(),
    type: 'line',
    version: 1,
    x1,
    y1,
    x2,
    y2,
    style: { ...style },
  }
}

export function createArrowElement(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  style: ElementStyle,
): ArrowElement {
  return {
    id: createId(),
    type: 'arrow',
    version: 1,
    x1,
    y1,
    x2,
    y2,
    style: { ...style },
  }
}

/** Arrow snapped between two shapes (smooth quadratic + optional label). */
export function createAttachedArrowElement(
  sourceId: string,
  targetId: string,
  style: ElementStyle,
): ArrowElement {
  return {
    id: createId(),
    type: 'arrow',
    version: 1,
    x1: 0,
    y1: 0,
    x2: 0,
    y2: 0,
    sourceId,
    targetId,
    sourceManual: false,
    sourceSide: 'e',
    sourceT: 0.5,
    targetManual: false,
    targetSide: 'w',
    targetT: 0.5,
    bendOffsetX: 0,
    bendOffsetY: 0,
    label: '',
    style: { ...style },
  }
}

/** Old documents used `type: 'connector'`; normalize to `arrow` with attachment fields. */
export function migrateLegacyElement(el: Element): Element {
  const t = (el as { type?: string }).type
  if (t === 'connector') {
    const c = el as unknown as Record<string, unknown>
    return {
      ...c,
      type: 'arrow',
      x1: typeof c.x1 === 'number' ? c.x1 : 0,
      y1: typeof c.y1 === 'number' ? c.y1 : 0,
      x2: typeof c.x2 === 'number' ? c.x2 : 0,
      y2: typeof c.y2 === 'number' ? c.y2 : 0,
    } as Element
  }
  if (t === 'image') {
    const im = el as ImageElement
    if (typeof im.aspectRatio !== 'number' || !Number.isFinite(im.aspectRatio) || im.aspectRatio <= 0) {
      return {
        ...im,
        aspectRatio: im.width / Math.max(im.height, 1e-9),
      }
    }
  }
  return el
}

export function createImageElement(
  x: number,
  y: number,
  width: number,
  height: number,
  src: string,
  style: ElementStyle,
  aspectRatio: number,
): ImageElement {
  const ar =
    Number.isFinite(aspectRatio) && aspectRatio > 0
      ? aspectRatio
      : width / Math.max(height, 1e-9)
  return {
    id: createId(),
    type: 'image',
    version: 1,
    x,
    y,
    width,
    height,
    src,
    aspectRatio: ar,
    style: { ...style },
  }
}

export function createTextElement(
  x: number,
  y: number,
  text: string,
  opts: {
    fontSize: number
    fontFamily: string
    color: string
    strokeColor: string
    strokeWidth: number
    textAlign: TextAlign
    opacity: number
    width: number
    height: number
  },
): TextElement {
  return {
    id: createId(),
    type: 'text',
    version: 1,
    x,
    y,
    text,
    fontSize: opts.fontSize,
    fontFamily: opts.fontFamily,
    color: opts.color,
    strokeColor: opts.strokeColor,
    strokeWidth: opts.strokeWidth,
    textAlign: opts.textAlign,
    opacity: opts.opacity,
    width: opts.width,
    height: opts.height,
  }
}

/** Fill defaults for older documents / partial objects. */
export function normalizeTextElement(el: TextElement): TextElement {
  return {
    ...el,
    strokeColor: el.strokeColor ?? 'transparent',
    strokeWidth: el.strokeWidth ?? 0,
    textAlign: el.textAlign ?? 'left',
  }
}

export function normalizeRect(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): { x: number; y: number; width: number; height: number } {
  const x = Math.min(x1, x2)
  const y = Math.min(y1, y2)
  const width = Math.abs(x2 - x1)
  const height = Math.abs(y2 - y1)
  return { x, y, width, height }
}

/**
 * Corner resize with fixed opposite corner `(fx, fy)` and pointer `(wx, wy)`,
 * keeping width / height = `aspectRatio` (width ÷ height).
 */
export function aspectRatioResizeRect(
  fx: number,
  fy: number,
  wx: number,
  wy: number,
  aspectRatio: number,
  minSize: number,
): { x: number; y: number; width: number; height: number } | null {
  const R = aspectRatio
  if (!Number.isFinite(R) || R <= 0) return null
  const dx = wx - fx
  const dy = wy - fy
  const adx = Math.abs(dx)
  const ady = Math.abs(dy)
  if (adx < minSize && ady < minSize) return null
  const sw = dx >= 0 ? 1 : -1
  const sh = dy >= 0 ? 1 : -1
  let w: number
  let h: number
  if (ady < 1e-12) {
    w = adx
    h = w / R
  } else if (adx / ady > R) {
    h = ady
    w = h * R
  } else {
    w = adx
    h = w / R
  }
  const s = Math.max(minSize / w, minSize / h, 1)
  w *= s
  h *= s
  const signedW = sw * w
  const signedH = sh * h
  return normalizeRect(fx, fy, fx + signedW, fy + signedH)
}

/** Padding around element bounds for selection outline and resize handles (world units). */
export const SELECTION_PADDING = 4

export function getElementBounds(el: Element): AABB | null {
  if (el.type === 'path') return pointsAABB(el.points)
  if (el.type === 'rectangle' || el.type === 'ellipse') {
    return { minX: el.x, minY: el.y, maxX: el.x + el.width, maxY: el.y + el.height }
  }
  if (el.type === 'line' || el.type === 'arrow') {
    if (el.type === 'arrow' && isAttachedArrow(el)) {
      return null
    }
    return {
      minX: Math.min(el.x1, el.x2),
      minY: Math.min(el.y1, el.y2),
      maxX: Math.max(el.x1, el.x2),
      maxY: Math.max(el.y1, el.y2),
    }
  }
  if (el.type === 'text' || el.type === 'image') {
    return {
      minX: el.x,
      minY: el.y,
      maxX: el.x + el.width,
      maxY: el.y + el.height,
    }
  }
  return null
}

/** Whether the element's bounds overlap `rect` (for marquee selection). */
export function elementBoundsIntersectRect(el: Element, rect: AABB, scene?: Scene): boolean {
  const b =
    el.type === 'arrow' && isAttachedArrow(el) && scene
      ? getAttachedArrowBounds(scene, el)
      : getElementBounds(el)
  if (!b) return false
  return aabbIntersects(b, rect)
}

export function marqueeAABB(x1: number, y1: number, x2: number, y2: number): AABB {
  return {
    minX: Math.min(x1, x2),
    minY: Math.min(y1, y2),
    maxX: Math.max(x1, x2),
    maxY: Math.max(y1, y2),
  }
}

/** Axis-aligned rect used for selection chrome (dashed box + handle positions). */
export function getSelectionOuterRect(el: Element, scene?: Scene): AABB | null {
  if (el.type === 'arrow' && isAttachedArrow(el)) {
    if (!scene) return null
    const b = getAttachedArrowBounds(scene, el)
    if (!b) return null
    return {
      minX: b.minX - SELECTION_PADDING,
      minY: b.minY - SELECTION_PADDING,
      maxX: b.maxX + SELECTION_PADDING,
      maxY: b.maxY + SELECTION_PADDING,
    }
  }
  const b = getElementBounds(el)
  if (!b) return null
  return {
    minX: b.minX - SELECTION_PADDING,
    minY: b.minY - SELECTION_PADDING,
    maxX: b.maxX + SELECTION_PADDING,
    maxY: b.maxY + SELECTION_PADDING,
  }
}

export function cloneElement(el: Element): Element {
  if (el.type === 'path') {
    return {
      ...el,
      points: el.points.map((p) => ({ ...p })),
      style: { ...el.style },
    }
  }
  if (el.type === 'rectangle' || el.type === 'ellipse') {
    return {
      ...el,
      style: { ...el.style },
    }
  }
  if (el.type === 'line' || el.type === 'arrow') {
    return {
      ...el,
      style: { ...el.style },
    }
  }
  if (el.type === 'text') {
    return normalizeTextElement({ ...el })
  }
  if (el.type === 'image') {
    return {
      ...el,
      style: { ...el.style },
    }
  }
  return el
}
