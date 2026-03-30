import type { ElementStyle, TextAlign } from '../types.js'

/** Sync payload from the app — selection + tool-derived flags + resolved style values. */
export interface StyleSyncCtx {
  style: ElementStyle
  hasSelection: boolean
  /** rect / ellipse in selection — can have fill */
  hasFillable: boolean
  /** Paths, shapes, images, … — stroke width + dash */
  hasNonText: boolean
  /** Selection includes at least one text element */
  hasText: boolean
  /** Every selected item is text — typography + text outline controls */
  allText: boolean
  textFontFamily?: string
  textFontSize?: number
  textAlign?: TextAlign
  shapeStrokeWidth?: number
  textOutlineWidth?: number
}

/**
 * Which UI chunks belong in the style panel for the current sync context.
 * Derived only from `StyleSyncCtx` (selection makeup + tool defaults from the app).
 */
export interface StylePanelLayout {
  showPanel: boolean
  /** Stroke colour swatch */
  strokeSwatch: boolean
  /** Fill / text colour swatch */
  fillSwatch: boolean
  /** Clear fill (shapes only, not all-text selection) */
  fillClear: boolean
  /** Shape / pen / line stroke thickness presets */
  shapeStrokeWidth: boolean
  /** Text outline thickness (all-text selection or text tool defaults) */
  textOutlineWidth: boolean
  /** Font size, family, alignment */
  typography: boolean
  opacity: boolean
  /** Solid / dashed / dotted */
  strokeDash: boolean
}

export function resolveStylePanelLayout(ctx: StyleSyncCtx): StylePanelLayout {
  if (!ctx.hasSelection) {
    return {
      showPanel: false,
      strokeSwatch: false,
      fillSwatch: false,
      fillClear: false,
      shapeStrokeWidth: false,
      textOutlineWidth: false,
      typography: false,
      opacity: false,
      strokeDash: false,
    }
  }

  const showFill = ctx.hasFillable || ctx.hasText

  return {
    showPanel: true,
    strokeSwatch: true,
    fillSwatch: showFill,
    fillClear: ctx.hasFillable && !ctx.allText,
    shapeStrokeWidth: ctx.hasNonText,
    textOutlineWidth: ctx.allText,
    typography: ctx.allText,
    opacity: true,
    strokeDash: ctx.hasNonText,
  }
}

export function layoutContentKey(layout: StylePanelLayout): string {
  if (!layout.showPanel) return ''
  return [
    layout.fillSwatch ? '1' : '0',
    layout.fillClear ? '1' : '0',
    layout.shapeStrokeWidth ? '1' : '0',
    layout.textOutlineWidth ? '1' : '0',
    layout.typography ? '1' : '0',
    layout.opacity ? '1' : '0',
    layout.strokeDash ? '1' : '0',
  ].join('')
}
