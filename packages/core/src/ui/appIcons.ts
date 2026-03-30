import type { StrokeDash, ToolName } from '../types.js'

/** Primary dock row only — drawing is Pen + shapes below (no separate “Draw” button). */
export type UiToolId = 'select' | 'hand' | 'erase'

export type DrawToolName = Exclude<ToolName, 'select' | 'eraser'>

const _T = 'stroke="none" d="M0 0h24v24H0z" fill="none"'
const _S =
  'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"'

export const ICONS: Record<UiToolId | 'menu' | 'exportPng' | 'grid', string> = {
  select: `<svg ${_S}><path ${_T}/><path d="M7.904 17.563a1.2 1.2 0 0 0 2.228 .308l2.09 -3.093l4.907 4.907a1.067 1.067 0 0 0 1.509 0l1.047 -1.047a1.067 1.067 0 0 0 0 -1.509l-4.907 -4.907l3.113 -2.09a1.2 1.2 0 0 0 -.309 -2.228l-13.582 -3.904l3.904 13.563"/></svg>`,
  hand: `<svg ${_S}><path ${_T}/><path d="M8 13v-7.5a1.5 1.5 0 0 1 3 0v6.5"/><path d="M11 5.5v-2a1.5 1.5 0 1 1 3 0v8.5"/><path d="M14 5.5a1.5 1.5 0 0 1 3 0v6.5"/><path d="M17 7.5a1.5 1.5 0 0 1 3 0v8.5a6 6 0 0 1 -6 6h-2h.208a6 6 0 0 1 -5.012 -2.7a69.74 69.74 0 0 1 -.196 -.3c-.312 -.479 -1.407 -2.388 -3.286 -5.728a1.5 1.5 0 0 1 .536 -2.022a1.867 1.867 0 0 1 2.28 .28l1.47 1.47"/></svg>`,
  erase: `<svg ${_S}><path ${_T}/><path d="M19 20h-10.5l-4.21 -4.3a1 1 0 0 1 0 -1.41l10 -10a1 1 0 0 1 1.41 0l5 5a1 1 0 0 1 0 1.41l-9.2 9.3"/><path d="M18 13.3l-6.3 -6.3"/></svg>`,
  menu: `<svg ${_S}><path ${_T}/><path d="M4 6l16 0"/><path d="M4 12l16 0"/><path d="M4 18l16 0"/></svg>`,
  exportPng: `<svg ${_S}><path ${_T}/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2"/><path d="M7 11l5 5l5 -5"/><path d="M12 4l0 12"/></svg>`,
  grid: `<svg ${_S}><path ${_T}/><path d="M4 6a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2l0 -12"/><path d="M4 12l16 0"/><path d="M12 4l0 16"/></svg>`,
}

/** Icons for pen + shape tools on the dock (after the primary row). */
export const DRAW_ICONS: Record<DrawToolName, string> = {
  pen: `<svg ${_S}><path ${_T}/><path d="M4 20h4l10.5 -10.5a2.828 2.828 0 1 0 -4 -4l-10.5 10.5v4"/><path d="M13.5 6.5l4 4"/></svg>`,
  rectangle: `<svg ${_S}><path ${_T}/><path d="M3 7a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-10"/></svg>`,
  ellipse: `<svg ${_S}><path ${_T}/><path d="M6 12a6 9 0 1 0 12 0a6 9 0 1 0 -12 0"/></svg>`,
  line: `<svg ${_S}><path ${_T}/><path d="M4 18a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"/><path d="M16 6a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"/><path d="M7.5 16.5l9 -9"/></svg>`,
  arrow: `<svg ${_S}><path ${_T}/><path d="M17 7l-10 10"/><path d="M8 7l9 0l0 9"/></svg>`,
  text: `<svg ${_S}><path ${_T}/><path d="M10 12h4"/><path d="M9 4a3 3 0 0 1 3 3v10a3 3 0 0 1 -3 3"/><path d="M15 4a3 3 0 0 0 -3 3v10a3 3 0 0 0 3 3"/></svg>`,
  image: `<svg ${_S}><path ${_T}/><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10" r="1.5"/><path d="M21 15l-5 -5l-5 5"/></svg>`,
  laser: `<svg ${_S}><path ${_T}/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="M2 12h2"/><path d="M20 12h2"/></svg>`,
}

/** Dash icons for the style panel (inline SVG, 24×12). */
export const DASH_ICONS: Record<StrokeDash, string> = {
  solid:
    `<svg viewBox="0 0 24 12" fill="none" aria-hidden="true"><line x1="2" y1="6" x2="22" y2="6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
  dashed:
    `<svg viewBox="0 0 24 12" fill="none" aria-hidden="true"><line x1="2" y1="6" x2="22" y2="6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-dasharray="5 3"/></svg>`,
  dotted:
    `<svg viewBox="0 0 24 12" fill="none" aria-hidden="true"><line x1="2" y1="6" x2="22" y2="6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-dasharray="1 4"/></svg>`,
}
