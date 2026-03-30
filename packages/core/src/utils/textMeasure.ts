import type { TextElement } from '../types.js'

let measureCanvas: HTMLCanvasElement | null = null

function getMeasureCtx(): CanvasRenderingContext2D {
  if (!measureCanvas) measureCanvas = document.createElement('canvas')
  const ctx = measureCanvas.getContext('2d')
  if (!ctx) throw new Error('Bembeyaz: 2D canvas not available for text measure')
  return ctx
}

/** Line height multiplier (matches canvas draw). */
export const TEXT_LINE_HEIGHT_FACTOR = 1.25

/**
 * Natural content size in world units (same font as ElementRenderer).
 * Used when committing from the editor so the frame is at least as large as the text.
 */
export function measureTextContentBounds(el: TextElement): { width: number; height: number } {
  const ctx = getMeasureCtx()
  ctx.font = `${el.fontSize}px ${el.fontFamily}`
  const lines = el.text.length ? el.text.split('\n') : ['']
  let maxW = 0
  for (const line of lines) {
    maxW = Math.max(maxW, ctx.measureText(line).width)
  }
  const lineHeight = el.fontSize * TEXT_LINE_HEIGHT_FACTOR
  const height = Math.max(lineHeight, lines.length * lineHeight)
  const width = maxW
  return { width, height }
}
