# Bembeyaz

**Bembeyaz** is a Canvas 2D whiteboard library with an optional full UI (toolbar, status bar, and engine integration). It ships with **no runtime dependencies** and works in any environment that can mount a DOM element (vanilla JavaScript, Vite, React, Vue, and similar).


<img width="1579" height="965" alt="image" src="https://github.com/user-attachments/assets/65aca722-d9fb-40db-bf23-967e65d33277" />


## Installation

```bash
npm install @bembeyaz/core
```

## Usage

The default integration mounts the complete application:

```ts
import { createBembeyaz } from '@bembeyaz/core'

createBembeyaz({
  container: document.getElementById('app')!,
  backgroundColor: '#ffffff',
  locale: 'en',
})
```

By default the board shows a **line grid** (`gridEnabled` true, `gridStyle` `'lines'`). Set `gridEnabled: false` or `gridStyle: 'dots'` on `createBembeyaz` / `Bembeyaz` options to change that.

For a headless setup with your own UI, use `BembeyazEngine` from the same package.

## Collaboration

The engine exposes **operation-based** scene changes so you can sync with an external backend or realtime layer (for example **Supabase Realtime** broadcast or `postgres_changes`, or your own WebSocket).

- **`onChange`** — Receives batched `SceneOperation[]` after local edits (insert / update / delete with full element snapshots and optional `baseVersion` for optimistic concurrency). Updates are flushed once per microtask so rapid gestures coalesce into one array.
- **`applyOperations(ops, options?)`** — Apply remote or server-delivered ops. Does **not** call `onChange` again (avoids echo). Use `conflictStrategy` (`'base-version'` or `'last-write-wins'`) and `duplicateInsert` (`'skip'` | `'replace'`) when needed.
- **Presence** — `setLocalPresence`, `applyRemotePresence`, `getPresence`, `getLocalUserId`, and **`presence:change`**. Remote peers’ **cursors and names** are drawn on the interactive canvas. For `cursorWorld`, use **`clientPointToWorld(clientX, clientY)`** (same math as the engine; viewport state is **CSS px**, not × `devicePixelRatio`). **Laser:** `getLocalLaserSegments()` out; **`applyRemoteLaser(userId, segments)`** in.

Undo/redo, `fromJSON`, and remote `applyOperations` do not emit collaboration ops. Types and helpers live under `SceneOperation`, `applySceneOperations`, `PresencePeer`, etc. (see package exports).

## Development

Clone the repository, install dependencies, and build:

```bash
npm install
npm run build
```

Development server (opens the demo):

```bash
npm run dev
```

Production build and local preview of the demo:

```bash
npm run demo
```

Open **http://localhost:4173/demo/** in your browser.

## License

MIT
