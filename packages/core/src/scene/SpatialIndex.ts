import type { AABB } from '../utils/math.js'

interface Item {
  id: string
  bounds: AABB
}

const MAX_ITEMS = 8
const MIN_SIZE = 1e-6

export class SpatialIndex {
  private items: Item[] = []
  private children: SpatialIndex[] | null = null
  private readonly bounds: AABB

  constructor(bounds: AABB) {
    this.bounds = { ...bounds }
  }

  clear(): void {
    this.items = []
    this.children = null
  }

  insert(id: string, bounds: AABB): void {
    if (!this.intersects(bounds, this.bounds)) return
    if (this.children) {
      for (const c of this.children) c.insert(id, bounds)
      return
    }
    this.items.push({ id, bounds: { ...bounds } })
    if (this.items.length > MAX_ITEMS && this.canSubdivide()) {
      this.subdivide()
    }
  }

  queryRect(rect: AABB, out: Set<string>): void {
    if (!this.intersects(rect, this.bounds)) return
    if (this.children) {
      for (const c of this.children) c.queryRect(rect, out)
      return
    }
    for (const it of this.items) {
      if (this.intersects(rect, it.bounds)) out.add(it.id)
    }
  }

  /** Point query: candidates whose bounds contain the point (refine with geometry) */
  queryPoint(x: number, y: number, out: Set<string>): void {
    if (x < this.bounds.minX || x > this.bounds.maxX || y < this.bounds.minY || y > this.bounds.maxY) {
      return
    }
    if (this.children) {
      for (const c of this.children) c.queryPoint(x, y, out)
      return
    }
    for (const it of this.items) {
      if (x >= it.bounds.minX && x <= it.bounds.maxX && y >= it.bounds.minY && y <= it.bounds.maxY) {
        out.add(it.id)
      }
    }
  }

  private canSubdivide(): boolean {
    const w = this.bounds.maxX - this.bounds.minX
    const h = this.bounds.maxY - this.bounds.minY
    return w > MIN_SIZE * 2 && h > MIN_SIZE * 2
  }

  private subdivide(): void {
    const { minX, minY, maxX, maxY } = this.bounds
    const mx = (minX + maxX) / 2
    const my = (minY + maxY) / 2
    this.children = [
      new SpatialIndex({ minX, minY, maxX: mx, maxY: my }),
      new SpatialIndex({ minX: mx, minY, maxX, maxY: my }),
      new SpatialIndex({ minX, minY: my, maxX: mx, maxY }),
      new SpatialIndex({ minX: mx, minY: my, maxX, maxY }),
    ]
    const toReinsert = this.items
    this.items = []
    for (const it of toReinsert) {
      for (const c of this.children) c.insert(it.id, it.bounds)
    }
  }

  private intersects(a: AABB, b: AABB): boolean {
    return !(a.maxX < b.minX || a.minX > b.maxX || a.maxY < b.minY || a.minY > b.maxY)
  }
}

/** World bounds large enough for typical whiteboard (rebuilt on full reindex) */
export const DEFAULT_WORLD_BOUNDS: AABB = {
  minX: -1e6,
  minY: -1e6,
  maxX: 1e6,
  maxY: 1e6,
}
