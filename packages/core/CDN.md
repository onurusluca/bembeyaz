# Core bundle on jsDelivr (GitHub)

jsDelivr serves files **straight from your GitHub repo**. The built ESM file must be **committed** under `packages/core/dist/` (see root `.gitignore`).

## URLs

**Template:**

```text
https://cdn.jsdelivr.net/gh/<user>/<repo>@<ref>/packages/core/dist/index.js
```

**This repo (replace `@ref` with a branch, tag, or commit SHA):**

```text
https://cdn.jsdelivr.net/gh/onurusluca/bembeyaz@main/packages/core/dist/index.js
```

- Use **`@main`** for “latest on main” (changes when you push).
- Use **`@<commit-sha>`** or **`@v1.2.3`** (git tag) for a **stable, cache-friendly** URL.

**Type definitions (for editors / `tsc`, not for the browser):**

```text
https://cdn.jsdelivr.net/gh/onurusluca/bembeyaz@main/packages/core/dist/index.d.ts
```

## Deploy workflow

1. From repo root: `bun run build` (updates `packages/core/dist/`).
2. Commit the changed files under `packages/core/dist/`.
3. Push to GitHub (and optionally `git tag v0.x.y && git push origin v0.x.y`).
4. Wait a short time for jsDelivr cache; use a **new tag or commit** if you need to bust cache immediately.

## Browser usage (ESM)

The bundle has **no runtime npm dependencies**; you can import it directly:

```html
<script type="module">
  import { createBembeyaz } from 'https://cdn.jsdelivr.net/gh/onurusluca/bembeyaz@main/packages/core/dist/index.js'

  createBembeyaz({
    container: document.getElementById('app'),
    backgroundColor: '#ffffff',
    locale: 'en',
  })
</script>
```

## TypeScript in your app

Point types at the same `@ref` as the JS (or copy `index.d.ts` locally):

```json
{
  "compilerOptions": {
    "moduleResolution": "bundler",
    "paths": {
      "@bembeyaz/core": ["./types/bembeyaz.d.ts"]
    }
  }
}
```

Or install from Git with Bun/npm later and drop the path hack.
