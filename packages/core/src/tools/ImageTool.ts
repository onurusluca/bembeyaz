import type { ToolContext } from './ToolContext.js'

/**
 * Image placement is handled by the app shell (e.g. file picker + engine API), not canvas
 * pointer routing. `ToolManager` treats `active === 'image'` like `text`: it does not dispatch
 * to `byName`. This class exists for symmetry, tests, or future in-canvas behavior.
 */
export class ImageTool {
  readonly name = 'image' as const
  setContext(_ctx: ToolContext): void {}
  onPointerDown(): void {}
  onPointerMove(): void {}
  onPointerUp(): void {}
  onPointerCancel(): void {}
}
