import { isAttachedArrow } from './connectorGeometry.js'
import type { Element } from '../types.js'

/** Shared translate-by-delta used by SelectTool. */
export function translateElementByDelta(el: Element, dx: number, dy: number): Element {
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
