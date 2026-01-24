# untitled-pixi-live2d-engine

![NPM Version](https://img.shields.io/npm/v/untitled-pixi-live2d-engine?style=flat-square&label=version)
![Cubism version](https://img.shields.io/badge/Cubism-2/3/4/5-ff69b4?style=flat-square)

**English (Current)** | [**简体中文**](README-ZH.md) | [**日本語**](README-JA.md)

A Live2D rendering and control plugin designed for **[PixiJS v8](https://pixijs.com/)**.

This project aims to provide a **unified, concise, and highly maintainable** API for loading, rendering, and interacting with Live2D models on the Web.  
Compared to the official Live2D SDK, this library significantly reduces usage complexity while preserving full functionality, with additional optimizations for stability and long-term maintainability.

This project is based on the [pixi-live2d-display-mulmotion](https://github.com/Sekai-World/pixi-live2d-display) branch.  
It is **fully compatible with PixiJS v8 and Live2D Cubism 5.4 SDK**, and further provides:

- Additional practical APIs
- Stronger TypeScript type safety
- Optimized internal architecture for extensibility and maintainability

## Features

- Supports **all versions** of Live2D models (Cubism 2 / 3 / 4 / 5)
- Compatible with `PIXI.RenderTexture` and `PIXI.Filter`
- Provides a complete **PixiJS-style transform API**
  - `position`
  - `scale`
  - `rotation`
  - `skew`
  - `anchor`

- Built-in interaction support
  - Mouse tracking
  - Hit area detection

- Improved **motion scheduling and reservation logic** compared to the official SDK
- Complete and strict **TypeScript type definitions**
- Real-time lip sync support
- **Parallel motion playback**
- Support for **freezing at the last frame of motions**

## Requirements

- **PixiJS**: `8.x`
- **Cubism runtime**: `2.1` or `5`
- **Browser**: Must support `WebGL` and `ES6`

## Installation

### Using npm / pnpm

```bash
pnpm add untitled-pixi-live2d-engine
# or
npm install untitled-pixi-live2d-engine
```

```ts
import { Live2DModel } from 'untitled-pixi-live2d-engine'

// Cubism Legacy only (Cubism 2.1)
import { Live2DModel } from 'untitled-pixi-live2d-engine/cubism-legacy'

// Cubism Modern only (Cubism 3 / 4 / 5)
import { Live2DModel } from 'untitled-pixi-live2d-engine/cubism'
```

### Import via HTML

```html
<script src="https://cdn.jsdelivr.net/npm/untitled-pixi-live2d-engine/dist/index.min.js"></script>
```

## Cubism Runtime Overview

This project supports **all versions of Live2D models**, which can be categorized by Cubism architecture:

- **Cubism Legacy**: Cubism 2.1
- **Cubism Modern**: Cubism 3 / 4 / 5

Choose the appropriate runtime entry based on the model you are using.

### Using Cubism Legacy and Cubism Modern Together

#### Bundle entry

```text
index.js
```

> Use this unified entry when your project needs to load both Cubism 2 and Cubism 3+ models.

### Cubism Legacy Only (Cubism 2.1)

#### Prerequisites

You must manually include `live2d.min.js`:

- Official distribution was discontinued on
  [September 4, 2019](https://help.live2d.com/en/other/other_20/)
- Available from:
  - GitHub:
    [https://github.com/dylanNew/live2d/tree/master/webgl/Live2D/lib](https://github.com/dylanNew/live2d/tree/master/webgl/Live2D/lib)
  - jsDelivr CDN:
    [https://cdn.jsdelivr.net/gh/dylanNew/live2d/webgl/Live2D/lib/live2d.min.js](https://cdn.jsdelivr.net/gh/dylanNew/live2d/webgl/Live2D/lib/live2d.min.js)

#### Bundle entry

```text
cubism-legacy.js
```

### Cubism Modern Only (Cubism 3 / 4 / 5)

#### Prerequisites

You must include `live2dcubismcore.min.js`:

- Downloadable from the official **Cubism 5 SDK**
  [https://www.live2d.com/download/cubism-sdk/download-web/](https://www.live2d.com/download/cubism-sdk/download-web/)

#### Bundle entry

```text
cubism.js
```

## Quick Start

The following example is based on **PixiJS v8** and supports both Cubism Legacy and Cubism Modern.

```ts
import { Application } from 'pixi.js'
import { configureCubismSDK, Live2DModel } from 'untitled-pixi-live2d-engine'

const app = new Application()
await app.init({
  resizeTo: window,
  preference: 'webgl',
  autoDensity: true,
  resolution: window.devicePixelRatio
})

document.body.appendChild(app.canvas)

// Configure Cubism Modern work memory (optional, default is 16MB)
// Increase this value when loading multiple or high-complexity models
// configureCubismSDK({
//   memorySizeMB: 32
// })

const model = await Live2DModel.from('model/model3.json')
model.anchor.set(0.5)
model.position.set(app.screen.width / 2, app.screen.height / 2)

app.stage.addChild(model)
```

## Common API Examples

### Play a Motion

```ts
model.motion('group', index)
```

### Parallel Motions

```ts
model.parallelMotion([
  { group: group1, index: index1 },
  { group: group2, index: index2 }
])
```

### Play and Freeze at the Last Frame

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

For more advanced usage, see
[pixi-live2d-display-lipsync](https://github.com/RaSan147/pixi-live2d-display)

## FAQ

### Q: Why do models stop updating when multiple models are loaded?

When using the **Cubism Modern** runtime, this issue is usually caused by insufficient work memory configured via `configureCubismSDK`.

Try increasing `memorySizeMB` during initialization (minimum: 16MB).
