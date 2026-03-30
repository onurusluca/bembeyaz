import { Bembeyaz } from '../Bembeyaz.js'
import type { BembeyazOptions, GridStyle, ToolName } from '../types.js'
import { DRAW_ICONS, ICONS, type DrawToolName, type UiToolId } from './appIcons.js'
import { STRINGS } from './appStrings.js'
import { ensureStyles } from './appStyles.js'
import { DRAW_TOOLS, TOOLS } from './appToolConfig.js'
import { normalizeTextElement } from '../scene/elements.js'
import { btn, el } from './dom.js'
import { createStylePanel } from './stylePanel.js'

export interface BembeyazAppOptions extends Omit<BembeyazOptions, 'container'> {
  container: HTMLElement
  locale?: 'en' | 'tr'
}

export interface BembeyazApp {
  whiteboard: Bembeyaz
  destroy(): void
}

export function createBembeyazApp(options: BembeyazAppOptions): BembeyazApp {
  const root = options.container
  root.innerHTML = ''
  root.classList.add('bembeyaz-app-host')

  ensureStyles()

  const wrap = el('div', 'bbz-wrap')
  const stage = el('div', 'bbz-stage')
  const menu = el('div', 'bbz-menu')
  const menuBtn = btn('bbz-menu-btn', `<span class="bbz-icon">${ICONS.menu}</span>`)
  menu.appendChild(menuBtn)
  const menuPanel = el('div', 'bbz-menu-panel')
  menu.appendChild(menuPanel)

  const dock = el('div', 'bbz-dock')
  const toolGroup = el('div', 'bbz-group bbz-group-tools')
  dock.appendChild(toolGroup)

  wrap.appendChild(stage)
  wrap.appendChild(menu)
  wrap.appendChild(dock)
  root.appendChild(wrap)

  const whiteboard = new Bembeyaz({
    ...options,
    container: stage,
    textOverlayParent: wrap,
  })

  const uiToolButtons = new Map<UiToolId, HTMLButtonElement>()
  const drawToolbarButtons = new Map<DrawToolName, HTMLButtonElement>()
  const locale = STRINGS[options.locale ?? 'en'] ?? STRINGS.en

  const makeToolBtn = (
    kind: 'ui' | 'draw',
    id: string,
    icon: string,
    hotkey: string,
    label: string,
    onClick: () => void,
  ): HTMLButtonElement => {
    const b = btn(kind === 'draw' ? 'bbz-btn bbz-btn-draw' : 'bbz-btn')
    if (kind === 'ui') b.dataset.uiTool = id
    else b.dataset.drawTool = id
    b.title = `${label} (${hotkey})`
    b.ariaLabel = label
    b.innerHTML = `<span class="bbz-icon">${icon}</span><kbd>${hotkey}</kbd>`
    b.addEventListener('click', onClick)
    return b
  }

  const exportPngItem = btn('bbz-menu-item bbz-menu-item--action', `<span>${locale.exportPng}</span>`)
  const exportPngIcon = el('span', 'bbz-icon')
  exportPngIcon.innerHTML = ICONS.exportPng
  exportPngItem.prepend(exportPngIcon)
  exportPngItem.title = locale.exportPng
  exportPngItem.ariaLabel = locale.exportPng
  menuPanel.appendChild(exportPngItem)

  for (const t of TOOLS) {
    const label = locale[t.id]
    const toolButton = makeToolBtn('ui', t.id, ICONS[t.id], t.hotkey, label, () => setPrimaryTool(t.id))
    toolGroup.appendChild(toolButton)
    uiToolButtons.set(t.id, toolButton)
  }

  toolGroup.appendChild(el('div', 'bbz-dock-sep', { role: 'separator' }))

  for (const d of DRAW_TOOLS) {
    if (d.id === 'laser') {
      toolGroup.appendChild(el('div', 'bbz-dock-sep', { role: 'separator' }))
    }
    const label = (locale as Record<string, string>)[d.id] ?? d.id
    const toolBtn = makeToolBtn('draw', d.id, DRAW_ICONS[d.id], d.hotkey, label, () => activateDrawTool(d.id))
    if (d.id === 'laser') toolBtn.classList.add('bbz-btn-laser')
    toolGroup.appendChild(toolBtn)
    drawToolbarButtons.set(d.id, toolBtn)
  }

  const stylePanel = createStylePanel((patch) => {
    whiteboard.setSelectedStyle(patch)
  })
  wrap.appendChild(stylePanel.root)

  let currentSelectedIds: readonly string[] = []
  let destroyed = false

  function syncStylePanel(): void {
    const style = whiteboard.getEffectiveStyle()
    const hand = whiteboard.isHandMode()
    const tool = whiteboard.getActiveTool()
    const inSelectMode = !hand && tool === 'select'
    const hasSelection = currentSelectedIds.length > 0

    const showStyleWhileDrawing =
      !hand && tool !== 'select' && tool !== 'eraser' && tool !== 'laser'

    function hidePanel(): void {
      stylePanel.sync({
        style,
        hasSelection: false,
        hasFillable: false,
        hasNonText: false,
        hasText: false,
        allText: false,
      })
    }

    if (!inSelectMode && !showStyleWhileDrawing) {
      hidePanel()
      return
    }
    if (inSelectMode && !hasSelection) {
      hidePanel()
      return
    }

    if (inSelectMode && hasSelection) {
      const elements = whiteboard.getElements()
      const selectedSet = new Set(currentSelectedIds)
      const selected = elements.filter((e) => selectedSet.has(e.id))
      const hasFillable = selected.some((e) => e.type === 'rectangle' || e.type === 'ellipse')
      const hasNonText = selected.some((e) => e.type !== 'text')
      const hasText = selected.some((e) => e.type === 'text')
      const allText = selected.length > 0 && selected.every((e) => e.type === 'text')
      const firstText = hasText ? selected.find((e) => e.type === 'text') : undefined
      const firstNonText = hasNonText ? selected.find((e) => e.type !== 'text') : undefined
      let shapeStrokeWidth: number | undefined
      let textOutlineWidth: number | undefined
      if (firstNonText && 'style' in firstNonText) {
        shapeStrokeWidth = firstNonText.style.strokeWidth
      }
      if (firstText?.type === 'text') {
        textOutlineWidth = normalizeTextElement(firstText).strokeWidth
      }
      stylePanel.sync({
        style,
        hasSelection: true,
        hasFillable,
        hasNonText,
        hasText,
        allText,
        textFontFamily: firstText?.type === 'text' ? firstText.fontFamily : undefined,
        textFontSize: firstText?.type === 'text' ? firstText.fontSize : undefined,
        textAlign: firstText?.type === 'text' ? firstText.textAlign : undefined,
        shapeStrokeWidth,
        textOutlineWidth,
      })
      return
    }

    const pen = whiteboard.getPenOptions()
    let hasFillable = false
    let hasNonText = false
    let hasText = false
    let allText = false
    switch (tool) {
      case 'pen':
        hasFillable = true
        hasNonText = true
        break
      case 'rectangle':
      case 'ellipse':
        hasFillable = true
        hasNonText = true
        break
      case 'line':
      case 'arrow':
        hasNonText = true
        break
      case 'text':
        hasFillable = true
        hasText = true
        allText = true
        break
      case 'image':
        break
      default:
        break
    }
    stylePanel.sync({
      style,
      hasSelection: true,
      hasFillable,
      hasNonText,
      hasText,
      allText,
      textFontFamily: pen.textFontFamily,
      textFontSize: pen.textFontSize,
      textAlign: pen.textAlign,
      shapeStrokeWidth: pen.strokeWidth,
      textOutlineWidth: pen.textStrokeWidth,
    })
  }

  function syncToolbar(): void {
    const hand = whiteboard.isHandMode()
    const tool = whiteboard.getActiveTool()
    uiToolButtons.get('select')?.classList.toggle('active', !hand && tool === 'select')
    uiToolButtons.get('hand')?.classList.toggle('active', hand)
    uiToolButtons.get('erase')?.classList.toggle('active', !hand && tool === 'eraser')
    const drawing = !hand && tool !== 'select' && tool !== 'eraser'
    for (const [id, b] of drawToolbarButtons) {
      b.classList.toggle('active', drawing && id === tool)
    }
  }

  const imageFileInput = document.createElement('input')
  imageFileInput.type = 'file'
  imageFileInput.accept = 'image/*'
  imageFileInput.multiple = true
  imageFileInput.hidden = true
  root.appendChild(imageFileInput)

  imageFileInput.addEventListener('change', () => {
    void (async () => {
      const files = imageFileInput.files
      if (!files?.length) return
      let offset = 0
      let first = true
      for (const file of files) {
        if (!file.type.startsWith('image/')) continue
        try {
          const dataUrl = await new Promise<string>((res, rej) => {
            const r = new FileReader()
            r.onload = () => res(r.result as string)
            r.onerror = () => rej(r.error)
            r.readAsDataURL(file)
          })
          const { w, h } = await new Promise<{ w: number; h: number }>((res, rej) => {
            const img = new Image()
            img.onload = () => res({ w: img.naturalWidth, h: img.naturalHeight })
            img.onerror = () => rej(new Error('decode'))
            img.src = dataUrl
          })
          whiteboard.insertImageFromDataUrl(dataUrl, w, h, offset, !first)
          first = false
          offset += 24
        } catch {
          /* skip invalid image */
        }
      }
      whiteboard.setTool('select')
      syncToolbar()
    })()
  })

  function setPrimaryTool(uiTool: UiToolId): void {
    if (uiTool === 'erase') {
      whiteboard.setHandMode(false)
      whiteboard.clearSelection()
      whiteboard.setTool('eraser')
    } else if (uiTool === 'hand') {
      whiteboard.setHandMode(true)
    } else {
      whiteboard.setHandMode(false)
      whiteboard.setTool('select')
    }
    syncToolbar()
    syncStylePanel()
  }

  function activateDrawTool(tool: DrawToolName): void {
    if (tool === 'image') {
      whiteboard.setHandMode(false)
      whiteboard.setTool('image')
      syncToolbar()
      syncStylePanel()
      imageFileInput.value = ''
      imageFileInput.click()
      return
    }
    whiteboard.setHandMode(false)
    whiteboard.setTool(tool)
    syncToolbar()
    syncStylePanel()
  }

  const onToolChange = (tool: ToolName) => {
    if (tool === 'select' || tool === 'eraser') {
      whiteboard.setHandMode(false)
    }
    syncToolbar()
    syncStylePanel()
  }
  whiteboard.on('tool:change', onToolChange)

  const onStyleChange = () => syncStylePanel()
  whiteboard.on('style:change', onStyleChange)

  const onSelectionChange = (ids: readonly string[]) => {
    currentSelectedIds = ids
    syncStylePanel()
  }
  whiteboard.on('selection:change', onSelectionChange)

  syncToolbar()
  syncStylePanel()
  exportPngItem.addEventListener('click', () => {
    whiteboard.exportToPngDownload()
    menu.classList.remove('open')
  })

  menuPanel.appendChild(el('div', 'bbz-menu-sep'))
  const gridSectionLabel = el('div', 'bbz-menu-label')
  gridSectionLabel.textContent = locale.grid
  menuPanel.appendChild(gridSectionLabel)

  const gridShowItem = btn(
    'bbz-menu-item',
    `<span>${locale.gridShow}</span><span class="bbz-check">${locale.off}</span>`,
  )
  const gridShowIcon = el('span', 'bbz-icon')
  gridShowIcon.innerHTML = ICONS.grid
  gridShowItem.prepend(gridShowIcon)
  menuPanel.appendChild(gridShowItem)

  const gridLinesItem = btn(
    'bbz-menu-item bbz-menu-item--option',
    `<span>${locale.gridLines}</span><span class="bbz-menu-check" aria-hidden="true"></span>`,
  )
  const gridDotsItem = btn(
    'bbz-menu-item bbz-menu-item--option',
    `<span>${locale.gridDots}</span><span class="bbz-menu-check" aria-hidden="true"></span>`,
  )
  menuPanel.appendChild(gridLinesItem)
  menuPanel.appendChild(gridDotsItem)

  let gridEnabled = whiteboard.isGridEnabled()
  let gridStyle: GridStyle = whiteboard.getGridStyle()

  function syncGridMenu(): void {
    const chip = gridShowItem.querySelector('.bbz-check')
    if (chip) chip.textContent = gridEnabled ? locale.on : locale.off
    gridLinesItem.classList.toggle('active', gridStyle === 'lines')
    gridDotsItem.classList.toggle('active', gridStyle === 'dots')
    const markLines = gridLinesItem.querySelector('.bbz-menu-check')
    const markDots = gridDotsItem.querySelector('.bbz-menu-check')
    if (markLines) markLines.textContent = gridStyle === 'lines' ? '✓' : ''
    if (markDots) markDots.textContent = gridStyle === 'dots' ? '✓' : ''
  }

  gridShowItem.addEventListener('click', () => {
    gridEnabled = !gridEnabled
    whiteboard.setGridEnabled(gridEnabled)
    syncGridMenu()
  })
  gridLinesItem.addEventListener('click', () => {
    gridStyle = 'lines'
    whiteboard.setGridStyle('lines')
    syncGridMenu()
  })
  gridDotsItem.addEventListener('click', () => {
    gridStyle = 'dots'
    whiteboard.setGridStyle('dots')
    syncGridMenu()
  })
  syncGridMenu()

  const onMenuToggle = () => {
    const open = !menu.classList.contains('open')
    menu.classList.toggle('open', open)
  }
  menuBtn.addEventListener('click', onMenuToggle)
  const onDocPointerDown = (event: PointerEvent) => {
    if (!menu.contains(event.target as Node)) {
      menu.classList.remove('open')
    }
  }
  document.addEventListener('pointerdown', onDocPointerDown)

  const onKeyDown = (event: KeyboardEvent): void => {
    const target = event.target as HTMLElement | null
    if (target && ['INPUT', 'TEXTAREA'].includes(target.tagName)) return
    if (event.key.toLowerCase() === 'g') {
      gridEnabled = !gridEnabled
      whiteboard.setGridEnabled(gridEnabled)
      syncGridMenu()
      return
    }
    const hit = TOOLS.find((t) => t.hotkey === event.key)
    if (hit) {
      setPrimaryTool(hit.id)
      return
    }
    const drawHit = DRAW_TOOLS.find((d) => d.hotkey === event.key.toLowerCase())
    if (drawHit) {
      activateDrawTool(drawHit.id)
      return
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      whiteboard.deleteSelected()
    }
  }
  document.addEventListener('keydown', onKeyDown)

  return {
    whiteboard,
    destroy() {
      if (destroyed) return
      destroyed = true
      whiteboard.off('tool:change', onToolChange)
      whiteboard.off('style:change', onStyleChange)
      whiteboard.off('selection:change', onSelectionChange)
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onDocPointerDown)
      menuBtn.removeEventListener('click', onMenuToggle)
      stylePanel.destroy()
      whiteboard.destroy()
      root.innerHTML = ''
      root.classList.remove('bembeyaz-app-host')
    },
  }
}
