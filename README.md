# untitled-pixi-live2d-engine

![NPM Version](https://img.shields.io/npm/v/untitled-pixi-live2d-engine?style=flat-square&label=version)
![Cubism version](https://img.shields.io/badge/Cubism-2/3/4/5-ff69b4?style=flat-square)
![PixiJS](https://img.shields.io/badge/PixiJS-v8-e72264?style=flat-square)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?style=flat-square)

**English (Current)** | [**简体中文**](README-ZH.md) | [**日本語**](README-JA.md)

A Live2D rendering engine for **[PixiJS v8](https://pixijs.com/)**, supporting **Cubism 2 / 3 / 4 / 5** models.

This project is a major refactor of [pixi-live2d-display-mulmotion](https://github.com/Sekai-World/pixi-live2d-display), adapted for PixiJS v8 and Cubism 5 SDK with improvements to API design, rendering pipeline, and type safety.

## Key Features

### Native PixiJS v8 Rendering

Registers a custom **Render Pipe** with `extensions.add(Live2DPlugin)` to integrate with the PixiJS v8 rendering architecture:

- Supports `Filter` and `RenderTexture`
- Participates in **zIndex sorting** and **blend modes**
- Inherits renderer resolution — filters won't blur due to downsampling

### Cubism 2–5 Support

Works with both **Cubism 2.1 (Legacy)** and **Cubism 5 (Modern)**, with separate bundle entries to import the corresponding runtime as needed.

### Texture LOD

For large texture atlases (4096px+), three LOD strategies are available:

- **`full`** (default): generates a full mipmap chain
- **`single-auto`**: generates a lower-resolution texture on demand based on the model's actual screen size, reducing VRAM usage
- **`false`**: uses the original texture only

```ts
const model = await Live2DModel.from('model.json', {
  textureOptions: { lod: 'single-auto' }
})
```

### Automatic High-Precision Mask Detection

Complex models (many masked drawables, high vertex density, etc.) can produce visual artifacts when mask precision is insufficient. The engine automatically analyzes the model structure and enables high-precision masks when needed. This is enabled by default and can also be controlled manually.

### Parallel Motions & Last-Frame Freeze

- **Parallel playback**: drive multiple motion groups simultaneously, useful for independent upper/lower body animations
- **Last-frame freeze**: hold a motion on its final frame, useful for pose switching or static illustrations
- **Loop override**: set `loop` per parallel motion item to override Cubism 3/4/5 motion JSON loop metadata

```ts
// Parallel playback
model.parallelMotion([
  { group: 'upper_body', index: 0 },
  { group: 'lower_body', index: 1, loop: true }
])

// Last-frame freeze
await model.parallelLastFrame([
  { group: 'arm', index: 0 },
  { group: 'expression', index: 2 }
])
```

## Feature List

- **Cubism 2 / 3 / 4 / 5** model support
- Native PixiJS v8 rendering pipeline (Filter / RenderTexture / Render Pipe)
- Texture LOD and automatic high-precision mask detection
- Parallel motion playback / last-frame freeze
- Real-time lip sync
- PixiJS-style transforms: `position` / `scale` / `rotation` / `skew` / `anchor`
- Mouse tracking / hit area detection
- Improved motion reservation and priority scheduling
- Strict TypeScript type definitions
- Configurable Cubism work memory size

## Requirements

- **PixiJS**: `8.x`
- **Cubism runtime**: `2.1` or `5`
- **Browser**: must support `WebGL` and `ES6`

## Installation

### Using npm / pnpm

```bash
pnpm add untitled-pixi-live2d-engine
# or
npm install untitled-pixi-live2d-engine
```

```ts
import { Live2DModel, Live2DPlugin } from 'untitled-pixi-live2d-engine'

// Cubism Legacy only (Cubism 2.1)
import { Live2DModel } from 'untitled-pixi-live2d-engine/cubism-legacy'

// Cubism Modern only (Cubism 3 / 4 / 5)
import { Live2DModel } from 'untitled-pixi-live2d-engine/cubism'
```

### Via HTML

```html
<script src="https://cdn.jsdelivr.net/npm/untitled-pixi-live2d-engine/dist/index.min.js"></script>
```

`@pixi/sound` is optional. Load it before this package only when using motion sounds, `model.speak()`, or lip sync:

```html
<script src="https://cdn.jsdelivr.net/npm/pixi.js@8/dist/pixi.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@pixi/sound@6/dist/pixi-sound.js"></script>
<script src="https://cdn.jsdelivr.net/npm/untitled-pixi-live2d-engine/dist/index.min.js"></script>
```

If your app does not use audio features, you can omit `pixi-sound.js`.

## Cubism Runtime

Live2D models are split into two categories by Cubism architecture, each requiring a different external runtime:

| Category | Model Version | External Runtime | Bundle Entry |
|---|---|---|---|
| **Cubism Legacy** | Cubism 2.1 | `live2d.min.js` | `cubism-legacy.js` |
| **Cubism Modern** | Cubism 3 / 4 / 5 | `live2dcubismcore.min.js` | `cubism.js` |
| **Both** | — | Both of the above | `index.js` |

### Obtaining the External Runtime

**Cubism Legacy** — `live2d.min.js`

Official distribution was discontinued on [September 4, 2019](https://help.live2d.com/en/other/other_20/). Available from:
- [GitHub](https://github.com/dylanNew/live2d/tree/master/webgl/Live2D/lib)
- [jsDelivr CDN](https://cdn.jsdelivr.net/gh/dylanNew/live2d/webgl/Live2D/lib/live2d.min.js)

**Cubism Modern** — `live2dcubismcore.min.js`

Download from the official [Cubism 5 SDK for Web](https://www.live2d.com/download/cubism-sdk/download-web/).

## Quick Start

The following example uses PixiJS v8 and supports both Cubism Legacy and Cubism Modern.

```ts
import { Application, extensions } from 'pixi.js'
import { configureCubismSDK, Live2DModel, Live2DPlugin } from 'untitled-pixi-live2d-engine'

// Register the Live2D render pipe before creating the Pixi renderer
extensions.add(Live2DPlugin)

const app = new Application()
await app.init({
  resizeTo: window,
  preference: 'webgl',
  autoDensity: true,
  resolution: window.devicePixelRatio
})

document.body.appendChild(app.canvas)

// Configure Cubism Modern work memory (optional, default 16MB)
// Increase when loading multiple or complex models
// configureCubismSDK({ memorySizeMB: 32 })

const model = await Live2DModel.from('model/model3.json')
model.anchor.set(0.5)
model.position.set(app.screen.width / 2, app.screen.height / 2)

app.stage.addChild(model)
```

## API Examples

### Play a Motion

```ts
model.motion('group', index)
```

### Parallel Motions

```ts
model.parallelMotion([
  { group: group1, index: index1 },
  { group: group2, index: index2, loop: true }
])
```

### Last-Frame Freeze

**Single motion:**

```ts
model.motionLastFrame('group', index)
```

**Multiple motions:**

```ts
await model.parallelLastFrame([
  { group: group1, index: index1 },
  { group: group2, index: index2 }
])
```

### Lip Sync

```ts
model.speak('audio_file_url')
```

### Expressions

```ts
model.expression('id')
```

## FAQ

### Q: Models stop updating after loading multiple models?

When using the Cubism Modern runtime, this is usually caused by insufficient work memory. Increase `memorySizeMB` during initialization (minimum 16MB):

```ts
configureCubismSDK({ memorySizeMB: 32 })
```

## License

[MIT](LICENSE)
