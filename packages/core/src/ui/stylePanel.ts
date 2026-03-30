import type { ElementStyle, SelectionStylePatch, StrokeDash, TextAlign } from '../types.js'
import { DASH_ICONS } from './appIcons.js'
import { btn, el } from './dom.js'
import {
  layoutContentKey,
  resolveStylePanelLayout,
  type StylePanelLayout,
  type StyleSyncCtx,
} from './stylePanelLayout.js'

export type { StyleSyncCtx } from './stylePanelLayout.js'

const CHECKERBOARD_BG =
  'repeating-conic-gradient(#d1d5db 0% 25%, #fff 0% 50%) 0 0 / 8px 8px'

const COLOR_PALETTE = ['#334155', '#f43f5e', '#6366f1', '#10b981', '#f59e0b'] as const

const WIDTH_STEPS_SHAPE = [1, 3, 6, 12] as const
const WIDTH_STEPS_TEXT = [0, 1, 3, 6] as const
const FONT_SIZE_STEPS = [12, 16, 24, 32] as const

const FONT_PRESETS: readonly { label: string; value: string }[] = [
  {
    label: 'Sans',
    value: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  },
  { label: 'Serif', value: 'Georgia, "Times New Roman", serif' },
  { label: 'Mono', value: 'ui-monospace, "Cascadia Code", Consolas, monospace' },
]

function nearestStep<T extends number>(value: number, steps: readonly T[]): T {
  return steps.reduce((a, b) => (Math.abs(b - value) < Math.abs(a - value) ? b : a))
}

interface ColorPopoverHandle {
  show(anchor: HTMLElement, onPick: (color: string) => void): void
  hide(): void
  destroy(): void
}

function createColorPopover(): ColorPopoverHandle {
  const pop = el('div', 'bbz-color-pop')
  document.body.appendChild(pop)

  let activeCb: ((c: string) => void) | null = null
  let open = false

  for (const color of COLOR_PALETTE) {
    const b = btn('bbz-color-pop-btn')
    b.style.setProperty('--c', color)
    b.title = color
    b.addEventListener('pointerdown', (e) => {
      e.stopPropagation()
      activeCb?.(color)
      hide()
    })
    pop.appendChild(b)
  }

  const onOutside = (e: PointerEvent) => {
    if (!pop.contains(e.target as Node)) hide()
  }

  function show(anchor: HTMLElement, onPick: (color: string) => void): void {
    if (open) {
      hide()
      return
    }
    open = true
    activeCb = onPick
    pop.classList.add('bbz-color-pop--open')
    const r = anchor.getBoundingClientRect()
    pop.style.left = `${r.left + r.width / 2}px`
    pop.style.top = `${r.top - 8}px`
    setTimeout(() => {
      document.addEventListener('pointerdown', onOutside, { capture: true })
    }, 0)
  }

  function hide(): void {
    if (!open) return
    open = false
    activeCb = null
    pop.classList.remove('bbz-color-pop--open')
    document.removeEventListener('pointerdown', onOutside, { capture: true })
  }

  return {
    show,
    hide,
    destroy() {
      hide()
      pop.remove()
    },
  }
}

export interface StylePanelHandle {
  root: HTMLElement
  sync(ctx: StyleSyncCtx): void
  destroy(): void
}

interface BuiltPanel {
  layout: StylePanelLayout
  strokeSwatch: HTMLButtonElement
  fillSwatch: HTMLButtonElement
  fillClearBtn: HTMLButtonElement | null
  shapeWidthButtons: Map<number, HTMLButtonElement> | null
  textWidthButtons: Map<number, HTMLButtonElement> | null
  opacityButtons: Map<number, HTMLButtonElement> | null
  dashButtons: Map<StrokeDash, HTMLButtonElement> | null
  fontSizeButtons: Map<number, HTMLButtonElement> | null
  fontFamilyButtons: Map<string, HTMLButtonElement> | null
  alignButtons: Map<TextAlign, HTMLButtonElement> | null
  applyValues: (style: ElementStyle, ctx: StyleSyncCtx) => void
}

const OPACITY_STEPS = [25, 50, 75, 100] as const

const ALIGN_ICONS: Record<TextAlign, string> = {
  left: `<svg viewBox="0 0 20 14" fill="none" aria-hidden="true"><path d="M3 2h14M3 7h10M3 12h14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  center: `<svg viewBox="0 0 20 14" fill="none" aria-hidden="true"><path d="M3 2h14M5 7h10M3 12h14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  right: `<svg viewBox="0 0 20 14" fill="none" aria-hidden="true"><path d="M3 2h14M7 7h10M3 12h14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
}

function makeBlock(sectionEl: HTMLElement): HTMLElement {
  const block = el('div', 'bbz-style-block')
  const sep = el('div', 'bbz-style-sep')
  block.appendChild(sep)
  block.appendChild(sectionEl)
  return block
}

function buildPanel(
  layout: StylePanelLayout,
  onStyleChange: (patch: SelectionStylePatch) => void,
  colorPop: ColorPopoverHandle,
): { panel: BuiltPanel; topLevelNodes: HTMLElement[] } {
  const topLevelNodes: HTMLElement[] = []

  const strokeSwatch = btn('bbz-swatch bbz-swatch-stroke')
  strokeSwatch.title = 'Stroke colour'

  const fillSwatch = btn('bbz-swatch bbz-swatch-fill')
  fillSwatch.title = 'Fill colour'

  const fillClearBtn = layout.fillClear ? btn('bbz-fill-clear', '∅') : null
  if (fillClearBtn) fillClearBtn.title = 'No fill'

  const colorSection = el('div', 'bbz-style-section')
  colorSection.appendChild(strokeSwatch)
  if (layout.fillSwatch) {
    const fillGroup = el('div', 'bbz-fill-group')
    fillGroup.appendChild(fillSwatch)
    if (fillClearBtn) fillGroup.appendChild(fillClearBtn)
    colorSection.appendChild(fillGroup)
  }
  topLevelNodes.push(colorSection)

  let shapeWidthButtons: Map<number, HTMLButtonElement> | null = null
  let textWidthButtons: Map<number, HTMLButtonElement> | null = null

  if (layout.shapeStrokeWidth || layout.textOutlineWidth) {
    const widthSectionWrap = el('div', 'bbz-style-width-wrap')
    if (layout.shapeStrokeWidth) {
      shapeWidthButtons = new Map()
      const shapeWidthSection = el('div', 'bbz-style-section bbz-style-section-steps bbz-style-width-shape')
      for (const w of WIDTH_STEPS_SHAPE) {
        const sw = Math.min(w * 0.85, 8)
        const b = btn('bbz-step-btn')
        b.title = `${w}px`
        b.innerHTML = `<svg viewBox="0 0 20 14" fill="none" aria-hidden="true"><line x1="2" y1="7" x2="18" y2="7" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round"/></svg>`
        shapeWidthSection.appendChild(b)
        shapeWidthButtons.set(w, b)
      }
      widthSectionWrap.appendChild(shapeWidthSection)
    }
    if (layout.textOutlineWidth) {
      textWidthButtons = new Map()
      const textWidthSection = el('div', 'bbz-style-section bbz-style-section-steps bbz-style-width-text')
      for (const w of WIDTH_STEPS_TEXT) {
        const b = btn('bbz-step-btn')
        b.title = w === 0 ? 'No outline' : `${w}px`
        b.textContent = w === 0 ? '—' : `${w}`
        textWidthSection.appendChild(b)
        textWidthButtons.set(w, b)
      }
      widthSectionWrap.appendChild(textWidthSection)
    }
    topLevelNodes.push(makeBlock(widthSectionWrap))
  }

  let fontSizeButtons: Map<number, HTMLButtonElement> | null = null
  let fontFamilyButtons: Map<string, HTMLButtonElement> | null = null
  let alignButtons: Map<TextAlign, HTMLButtonElement> | null = null

  if (layout.typography) {
    fontSizeButtons = new Map()
    const fontSizeSection = el('div', 'bbz-style-section bbz-style-section-steps')
    for (const fs of FONT_SIZE_STEPS) {
      const b = btn('bbz-step-btn')
      b.title = `${fs}px`
      b.textContent = `${fs}`
      fontSizeSection.appendChild(b)
      fontSizeButtons.set(fs, b)
    }

    fontFamilyButtons = new Map()
    const fontFamilySection = el('div', 'bbz-style-section bbz-style-section-steps')
    for (const p of FONT_PRESETS) {
      const b = btn('bbz-step-btn')
      b.title = p.label
      b.textContent = p.label
      b.dataset.font = p.value
      fontFamilySection.appendChild(b)
      fontFamilyButtons.set(p.value, b)
    }

    alignButtons = new Map()
    const alignSection = el('div', 'bbz-style-section bbz-style-section-steps bbz-style-align')
    for (const al of ['left', 'center', 'right'] as TextAlign[]) {
      const b = btn('bbz-step-btn')
      b.title = al.charAt(0).toUpperCase() + al.slice(1)
      b.innerHTML = ALIGN_ICONS[al]
      alignSection.appendChild(b)
      alignButtons.set(al, b)
    }

    const textTypoInner = el('div', 'bbz-style-text-typo')
    textTypoInner.appendChild(fontSizeSection)
    textTypoInner.appendChild(fontFamilySection)
    textTypoInner.appendChild(alignSection)
    topLevelNodes.push(makeBlock(textTypoInner))
  }

  let opacityButtons: Map<number, HTMLButtonElement> | null = null
  if (layout.opacity) {
    opacityButtons = new Map()
    const opacitySection = el('div', 'bbz-style-section bbz-style-section-steps')
    for (const o of OPACITY_STEPS) {
      const b = btn('bbz-step-btn')
      b.title = `${o}%`
      b.textContent = `${o}`
      opacitySection.appendChild(b)
      opacityButtons.set(o, b)
    }
    topLevelNodes.push(makeBlock(opacitySection))
  }

  let dashButtons: Map<StrokeDash, HTMLButtonElement> | null = null
  if (layout.strokeDash) {
    dashButtons = new Map()
    const dashSection = el('div', 'bbz-style-section bbz-style-section-dash')
    for (const dash of ['solid', 'dashed', 'dotted'] as StrokeDash[]) {
      const b = btn('bbz-dash-btn')
      b.title = dash.charAt(0).toUpperCase() + dash.slice(1)
      b.innerHTML = DASH_ICONS[dash]
      b.dataset.dash = dash
      dashSection.appendChild(b)
      dashButtons.set(dash, b)
    }
    topLevelNodes.push(makeBlock(dashSection))
  }

  function updateStrokeSwatch(color: string): void {
    strokeSwatch.style.setProperty('--swatch-color', color)
  }

  function updateFillSwatch(fill: string): void {
    if (fill === 'transparent') {
      fillSwatch.style.background = CHECKERBOARD_BG
      fillSwatch.style.removeProperty('--swatch-color')
    } else {
      fillSwatch.style.background = ''
      fillSwatch.style.setProperty('--swatch-color', fill)
    }
  }

  function updateDashButtons(active: StrokeDash): void {
    if (!dashButtons) return
    for (const [dash, b] of dashButtons) {
      b.classList.toggle('active', dash === active)
    }
  }

  function updateShapeWidthButtons(w: number): void {
    if (!shapeWidthButtons) return
    const nearest = nearestStep(w, WIDTH_STEPS_SHAPE)
    for (const [val, b] of shapeWidthButtons) b.classList.toggle('active', val === nearest)
  }

  function updateTextWidthButtons(w: number): void {
    if (!textWidthButtons) return
    const nearest = nearestStep(w, WIDTH_STEPS_TEXT)
    for (const [val, b] of textWidthButtons) b.classList.toggle('active', val === nearest)
  }

  function updateOpacityButtons(opacity: number): void {
    if (!opacityButtons) return
    const pct = Math.round(opacity * 100)
    const nearest = nearestStep(pct, OPACITY_STEPS)
    for (const [val, b] of opacityButtons) b.classList.toggle('active', val === nearest)
  }

  function updateFontSizeButtons(fs: number): void {
    if (!fontSizeButtons) return
    const nearest = nearestStep(fs, FONT_SIZE_STEPS)
    for (const [val, b] of fontSizeButtons) b.classList.toggle('active', val === nearest)
  }

  function updateFontFamilyButtons(family: string): void {
    if (!fontFamilyButtons) return
    let matched = false
    for (const [val, b] of fontFamilyButtons) {
      const on = val === family
      b.classList.toggle('active', on)
      if (on) matched = true
    }
    if (!matched) {
      for (const [, b] of fontFamilyButtons) b.classList.remove('active')
    }
  }

  function updateAlignButtons(al: TextAlign): void {
    if (!alignButtons) return
    for (const [a, b] of alignButtons) b.classList.toggle('active', a === al)
  }

  function applyValues(style: ElementStyle, ctx: StyleSyncCtx): void {
    updateStrokeSwatch(style.stroke)
    if (layout.fillSwatch) {
      updateFillSwatch(style.fill ?? 'transparent')
    }
    if (shapeWidthButtons) {
      updateShapeWidthButtons(ctx.shapeStrokeWidth ?? style.strokeWidth)
    }
    if (textWidthButtons) {
      updateTextWidthButtons(ctx.textOutlineWidth ?? style.strokeWidth)
    }
    if (opacityButtons) {
      updateOpacityButtons(style.opacity ?? 1)
    }
    if (dashButtons) {
      updateDashButtons(style.strokeDash ?? 'solid')
    }
    if (fontSizeButtons && fontFamilyButtons && alignButtons) {
      const fs = ctx.textFontSize ?? 16
      const ff = ctx.textFontFamily ?? FONT_PRESETS[0]!.value
      const al = ctx.textAlign ?? 'left'
      updateFontSizeButtons(fs)
      updateFontFamilyButtons(ff)
      updateAlignButtons(al)
    }
  }

  strokeSwatch.addEventListener('click', () => {
    colorPop.show(strokeSwatch, (color) => {
      updateStrokeSwatch(color)
      onStyleChange({ stroke: color })
    })
  })

  if (layout.fillSwatch) {
    fillSwatch.addEventListener('click', () => {
      colorPop.show(fillSwatch, (color) => {
        updateFillSwatch(color)
        onStyleChange({ fill: color })
      })
    })
  }

  if (fillClearBtn) {
    fillClearBtn.addEventListener('click', () => {
      updateFillSwatch('transparent')
      onStyleChange({ fill: 'transparent' })
    })
  }

  if (shapeWidthButtons) {
    for (const [w, b] of shapeWidthButtons) {
      b.addEventListener('click', () => {
        updateShapeWidthButtons(w)
        onStyleChange({ strokeWidth: w })
      })
    }
  }

  if (textWidthButtons) {
    for (const [w, b] of textWidthButtons) {
      b.addEventListener('click', () => {
        updateTextWidthButtons(w)
        onStyleChange({ strokeWidth: w })
      })
    }
  }

  if (opacityButtons) {
    for (const [o, b] of opacityButtons) {
      b.addEventListener('click', () => {
        updateOpacityButtons(o / 100)
        onStyleChange({ opacity: o / 100 })
      })
    }
  }

  if (dashButtons) {
    for (const [dash, b] of dashButtons) {
      b.addEventListener('click', () => {
        updateDashButtons(dash)
        onStyleChange({ strokeDash: dash })
      })
    }
  }

  if (fontSizeButtons) {
    for (const [fs, b] of fontSizeButtons) {
      b.addEventListener('click', () => {
        updateFontSizeButtons(fs)
        onStyleChange({ fontSize: fs })
      })
    }
  }

  if (fontFamilyButtons) {
    for (const [val, b] of fontFamilyButtons) {
      b.addEventListener('click', () => {
        updateFontFamilyButtons(val)
        onStyleChange({ fontFamily: val })
      })
    }
  }

  if (alignButtons) {
    for (const [al, b] of alignButtons) {
      b.addEventListener('click', () => {
        updateAlignButtons(al)
        onStyleChange({ textAlign: al })
      })
    }
  }

  const panel: BuiltPanel = {
    layout,
    strokeSwatch,
    fillSwatch,
    fillClearBtn,
    shapeWidthButtons,
    textWidthButtons,
    opacityButtons,
    dashButtons,
    fontSizeButtons,
    fontFamilyButtons,
    alignButtons,
    applyValues,
  }

  return { panel, topLevelNodes }
}

export function createStylePanel(onStyleChange: (patch: SelectionStylePatch) => void): StylePanelHandle {
  const root = el('div', 'bbz-style-panel')
  const colorPop = createColorPopover()

  let lastLayoutKey = ''
  let panel: BuiltPanel | null = null

  root.classList.add('bbz-style-panel--hidden')

  return {
    root,
    sync(ctx: StyleSyncCtx): void {
      const layout = resolveStylePanelLayout(ctx)
      root.classList.toggle('bbz-style-panel--hidden', !layout.showPanel)

      if (!layout.showPanel) {
        root.replaceChildren()
        lastLayoutKey = ''
        panel = null
        return
      }

      const key = layoutContentKey(layout)
      if (key !== lastLayoutKey || !panel) {
        lastLayoutKey = key
        const built = buildPanel(layout, onStyleChange, colorPop)
        panel = built.panel
        root.replaceChildren(...built.topLevelNodes)
      }

      const titles = ctx.allText
      panel.strokeSwatch.title = titles ? 'Outline colour' : 'Stroke colour'
      if (layout.fillSwatch) {
        panel.fillSwatch.title = titles ? 'Text colour' : 'Fill colour'
      }

      panel.applyValues(ctx.style, ctx)
    },
    destroy(): void {
      colorPop.destroy()
      root.remove()
    },
  }
}
