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
  /** Every selected item is text — typography + text colour */
  allText: boolean
  /** Text tool or all-text selection: one colour swatch only (no stroke/outline). */
  textColorOnly: boolean
  /** Heading shown above the style controls (tool name or "Selection"). */
  panelTitle: string | null
  /** Delete / copy / cut row (select tool with selection). */
  showSelectionActions?: boolean
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
  /** Stroke / line colour swatch */
  strokeSwatch: boolean
  /** Fill / text colour swatch */
  fillSwatch: boolean
  /** "No fill" appears in the fill colour popover (not beside the swatch). */
  fillNoFillInPopover: boolean
  /** Shape / pen / line stroke thickness presets */
  shapeStrokeWidth: boolean
  /** Text outline thickness — hidden when `textColorOnly` */
  textOutlineWidth: boolean
  /** Font size, family, alignment */
  typography: boolean
  opacity: boolean
  /** Solid / dashed / dotted */
  strokeDash: boolean
  /** Mirrors `StyleSyncCtx.textColorOnly` for panel build logic. */
  textColorOnly: boolean
  selectionActions: boolean
}

export function resolveStylePanelLayout(ctx: StyleSyncCtx): StylePanelLayout {
  if (!ctx.hasSelection) {
    return {
      showPanel: false,
      strokeSwatch: false,
      fillSwatch: false,
      fillNoFillInPopover: false,
      shapeStrokeWidth: false,
      textOutlineWidth: false,
      typography: false,
      opacity: false,
      strokeDash: false,
      textColorOnly: false,
      selectionActions: false,
    }
  }

  const textColorOnly = ctx.textColorOnly
  const showFill = (ctx.hasFillable || ctx.hasText) && !textColorOnly
  const textFillOnly = textColorOnly

  return {
    showPanel: true,
    strokeSwatch: !textFillOnly,
    fillSwatch: showFill || textFillOnly,
    fillNoFillInPopover: ctx.hasFillable && !ctx.allText,
    shapeStrokeWidth: ctx.hasNonText,
    textOutlineWidth: ctx.allText && !textColorOnly,
    typography: ctx.allText,
    opacity: true,
    strokeDash: ctx.hasNonText,
    textColorOnly,
    selectionActions: Boolean(ctx.showSelectionActions),
  }
}

export function layoutContentKey(layout: StylePanelLayout): string {
  if (!layout.showPanel) return ''
  return [
    layout.strokeSwatch ? '1' : '0',
    layout.fillSwatch ? '1' : '0',
    layout.fillNoFillInPopover ? '1' : '0',
    layout.shapeStrokeWidth ? '1' : '0',
    layout.textOutlineWidth ? '1' : '0',
    layout.typography ? '1' : '0',
    layout.opacity ? '1' : '0',
    layout.strokeDash ? '1' : '0',
    layout.textColorOnly ? '1' : '0',
    layout.selectionActions ? '1' : '0',
  ].join('')
}
