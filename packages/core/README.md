# @bembeyaz/core

Zero-runtime-dependency whiteboard engine: Canvas 2D, infinite pan/zoom, pen + select tools.

## Install

```bash
npm install @bembeyaz/core
```

## Usage

```ts
import { Bembeyaz } from '@bembeyaz/core'

const wb = new Bembeyaz({
  container: document.getElementById('root')!,
})

wb.setTool('pen')
wb.setPenOptions({ color: '#111', strokeWidth: 2 })

wb.on('scene:change', (elements) => console.log(elements.length))
```

## Build

```bash
npm run build
```

## License

MIT
