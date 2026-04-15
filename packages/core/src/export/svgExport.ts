import {
  getAttachedArrowBounds,
  isAttachedArrow,
  resolveAttachedArrow,
} from '../scene/connectorGeometry.js'
import { getElementBounds, normalizeTextElement } from '../scene/elements.js'
import type { Scene } from '../scene/Scene.js'
import type { Element, ElementStyle, StrokeDash } from '../types.js'
import type { AABB } from '../utils/math.js'
import { TEXT_LINE_HEIGHT_FACTOR } from '../utils/textMeasure.js'

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function dashAttr(dash: StrokeDash | undefined, strokeWidth: number): string {
  const sw = Math.max(strokeWidth, 1)
  const m = Math.max(1, sw * 0.5)
  if (dash === 'dashed') {
    const on = 10 * m
    const off = 6 * m
    return ` stroke-dasharray="${on} ${off}"`
  }
  if (dash === 'dotted') {
    const dot = Math.max(2, sw * 0.85)
    const gap = Math.max(5, sw * 2.2)
    return ` stroke-dasharray="${dot} ${gap}" stroke-linecap="round"`
  }
  return ''
}

function unionSceneBounds(scene: Scene): AABB | null {
  let u: AABB | null = null
  for (const el of scene.getElements()) {
    const b =
      el.type === 'arrow' && isAttachedArrow(el) ? getAttachedArrowBounds(scene, el) : getElementBounds(el)
    if (!b) continue
    if (!u) {
      u = { minX: b.minX, minY: b.minY, maxX: b.maxX, maxY: b.maxY }
    } else {
      u.minX = Math.min(u.minX, b.minX)
      u.minY = Math.min(u.minY, b.minY)
      u.maxX = Math.max(u.maxX, b.maxX)
      u.maxY = Math.max(u.maxY, b.maxY)
    }
  }
  return u
}

function styleAttrs(style: ElementStyle, extra = ''): string {
  const o = style.opacity ?? 1
  return ` stroke="${escapeXml(style.stroke)}" stroke-width="${style.strokeWidth}" fill="none" opacity="${o}"${dashAttr(
    style.strokeDash,
    style.strokeWidth,
  )}${extra}`
}

/** Serialize the scene to a standalone SVG string (world coordinates). */
export function exportSceneToSvgString(scene: Scene, backgroundColor: string): string {
  const pad = 8
  const bounds = unionSceneBounds(scene)
  if (!bounds) {
    return `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100%" height="100%" fill="${escapeXml(
      backgroundColor,
    )}"/></svg>`
  }
  const x0 = bounds.minX - pad
  const y0 = bounds.minY - pad
  const w = bounds.maxX - bounds.minX + pad * 2
  const h = bounds.maxY - bounds.minY + pad * 2

  const parts: string[] = []
  for (const el of scene.getElements()) {
    const frag = elementToSvgFragment(el, scene, x0, y0)
    if (frag) parts.push(frag)
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<rect width="100%" height="100%" fill="${escapeXml(backgroundColor)}"/>
${parts.join('\n')}
</svg>`
}

function elementToSvgFragment(el: Element, scene: Scene, originX: number, originY: number): string | null {
  const tx = (x: number) => x - originX
  const ty = (y: number) => y - originY

  if (el.type === 'path') {
    if (el.points.length < 2) return null
    const pts = el.points.map((p) => `${tx(p.x)},${ty(p.y)}`).join(' ')
    return `<polyline points="${pts}"${styleAttrs(
      el.style,
      ' fill="none" stroke-linejoin="round" stroke-linecap="round"',
    )}/>`
  }

  if (el.type === 'rectangle') {
    const hasFill = Boolean(el.style.fill && el.style.fill !== 'transparent')
    const s = el.style
    const o = s.opacity ?? 1
    const fill =
      hasFill && s.fill !== 'transparent' ? ` fill="${escapeXml(s.fill)}"` : ' fill="none"'
    const dash = dashAttr(s.strokeDash, s.strokeWidth)
    return `<rect x="${tx(el.x)}" y="${ty(el.y)}" width="${el.width}" height="${el.height}"${fill} stroke="${escapeXml(
      s.stroke,
    )}" stroke-width="${s.strokeWidth}" opacity="${o}"${dash}/>`
  }

  if (el.type === 'ellipse') {
    const hasFill = Boolean(el.style.fill && el.style.fill !== 'transparent')
    const s = el.style
    const o = s.opacity ?? 1
    const cx = tx(el.x + el.width / 2)
    const cy = ty(el.y + el.height / 2)
    const rx = Math.abs(el.width / 2)
    const ry = Math.abs(el.height / 2)
    const fill =
      hasFill && s.fill !== 'transparent' ? ` fill="${escapeXml(s.fill)}"` : ' fill="none"'
    const dash = dashAttr(s.strokeDash, s.strokeWidth)
    return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"${fill} stroke="${escapeXml(
      s.stroke,
    )}" stroke-width="${s.strokeWidth}" opacity="${o}"${dash}/>`
  }

  if (el.type === 'line') {
    return `<line x1="${tx(el.x1)}" y1="${ty(el.y1)}" x2="${tx(el.x2)}" y2="${ty(el.y2)}"${styleAttrs(
      el.style,
      ' stroke-linecap="round"',
    )}/>`
  }

  if (el.type === 'arrow') {
    if (isAttachedArrow(el)) {
      const r = resolveAttachedArrow(scene, el)
      if (!r) return null
      const x1 = tx(r.start.x)
      const y1 = ty(r.start.y)
      const x2 = tx(r.end.x)
      const y2 = ty(r.end.y)
      const cx = tx(r.control.x)
      const cy = ty(r.control.y)
      const s = el.style
      const o = s.opacity ?? 1
      const dash = dashAttr(s.strokeDash, s.strokeWidth)
      const path = `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`
      const head = arrowHeadPolygonSvg(r.end.x - r.control.x, r.end.y - r.control.y, tx(r.end.x), ty(r.end.y), 12)
      return `<g opacity="${o}"><path d="${path}" fill="none" stroke="${escapeXml(s.stroke)}" stroke-width="${
        s.strokeWidth
      }"${dash}/><polygon points="${head}" fill="${escapeXml(s.stroke)}"/></g>`
    }
    return `<line x1="${tx(el.x1)}" y1="${ty(el.y1)}" x2="${tx(el.x2)}" y2="${ty(el.y2)}"${styleAttrs(
      el.style,
      ' stroke-linecap="round"',
    )}/>`
  }

  if (el.type === 'text') {
    const t = normalizeTextElement(el)
    const lines = t.text.length ? t.text.split('\n') : ['']
    const lh = t.fontSize * TEXT_LINE_HEIGHT_FACTOR
    const o = t.opacity ?? 1
    const out: string[] = []
    let y = ty(t.y)
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!
      let x = tx(t.x)
      const w = 800
      if (t.textAlign === 'center') x = tx(t.x + t.width / 2)
      else if (t.textAlign === 'right') x = tx(t.x + t.width)
      const anchor = t.textAlign === 'center' ? 'middle' : t.textAlign === 'right' ? 'end' : 'start'
      out.push(
        `<text x="${x}" y="${y + t.fontSize * 0.85}" font-family="${escapeXml(
          t.fontFamily,
        )}" font-size="${t.fontSize}" fill="${escapeXml(t.color)}" text-anchor="${anchor}" opacity="${o}">${escapeXml(
          line,
        )}</text>`,
      )
      y += lh
    }
    return out.join('\n')
  }

  if (el.type === 'image') {
    const o = el.style.opacity ?? 1
    return `<image href="${escapeXml(el.src)}" x="${tx(el.x)}" y="${ty(el.y)}" width="${el.width}" height="${
      el.height
    }" preserveAspectRatio="none" opacity="${o}"/>`
  }

  return null
}

function arrowHeadPolygonSvg(dx: number, dy: number, tipX: number, tipY: number, size: number): string {
  const angle = Math.atan2(dy, dx)
  const a1 = angle - 0.55
  const a2 = angle + 0.55
  const p1x = tipX - Math.cos(a1) * size
  const p1y = tipY - Math.sin(a1) * size
  const p2x = tipX - Math.cos(a2) * size
  const p2y = tipY - Math.sin(a2) * size
  return `${tipX},${tipY} ${p1x},${p1y} ${p2x},${p2y}`
}
