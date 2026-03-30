export function el(tag: string, className: string, attrs?: Record<string, string>): HTMLElement {
  const n = document.createElement(tag)
  n.className = className
  if (attrs) for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v)
  return n
}

export function btn(className: string, innerHTML?: string): HTMLButtonElement {
  const b = document.createElement('button')
  b.type = 'button'
  b.className = className
  if (innerHTML !== undefined) b.innerHTML = innerHTML
  return b
}
