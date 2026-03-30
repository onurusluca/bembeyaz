# Bembeyaz

**Bembeyaz** is a Canvas 2D whiteboard library with an optional full UI (toolbar, status bar, and engine integration). It ships with **no runtime dependencies** and works in any environment that can mount a DOM element (vanilla JavaScript, Vite, React, Vue, and similar).

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
  gridEnabled: false,
  locale: 'en',
})
```

For a headless setup with your own UI, use `BembeyazEngine` from the same package.

## Collaboration

The engine exposes **operation-based** scene changes so you can sync with an external backend or realtime layer (for example **Supabase Realtime** broadcast or `postgres_changes`, or your own WebSocket).

- **`onChange`** — Receives batched `SceneOperation[]` after local edits (insert / update / delete with full element snapshots and optional `baseVersion` for optimistic concurrency). Updates are flushed once per microtask so rapid gestures coalesce into one array.
- **`applyOperations(ops, options?)`** — Apply remote or server-delivered ops. Does **not** call `onChange` again (avoids echo). Use `conflictStrategy` (`'base-version'` or `'last-write-wins'`) and `duplicateInsert` (`'skip'` | `'replace'`) when needed.
- **Presence** — `setLocalPresence`, `applyRemotePresence`, `getPresence`, `getLocalUserId`, and the **`presence:change`** event for cursors and user colors. Pair with Supabase Presence or Broadcast payloads.

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
