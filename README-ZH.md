# untitled-pixi-live2d-engine

![NPM Version](https://img.shields.io/npm/v/untitled-pixi-live2d-engine?style=flat-square&label=version)
![Cubism version](https://img.shields.io/badge/Cubism-2/3/4/5-ff69b4?style=flat-square)
![PixiJS](https://img.shields.io/badge/PixiJS-v8-e72264?style=flat-square)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?style=flat-square)

[**English**](README.md) | **简体中文 (当前)** | [**日本語**](README-JA.md)

基于 **[PixiJS v8](https://pixijs.com/)** 的 Live2D 渲染引擎，支持 **Cubism 2 / 3 / 4 / 5** 模型。

本项目基于 [pixi-live2d-display-mulmotion](https://github.com/Sekai-World/pixi-live2d-display) 大幅重构，适配 PixiJS v8 与 Cubism 5 SDK，并改进了 API 设计、渲染管线与类型安全。

## 主要特性

### PixiJS v8 原生渲染

通过自定义 **Render Pipe** 接入 PixiJS v8 渲染架构：

- 支持 `Filter`（滤镜）与 `RenderTexture`（离屏渲染）
- 参与 **zIndex 排序** 与 **混合模式**
- 继承渲染器分辨率，滤镜不会因降采样而模糊

### Cubism 2–5 支持

同时适配 **Cubism 2.1（Legacy）** 与 **Cubism 5（Modern）**，通过不同的打包入口按需引入对应运行时。

### 纹理 LOD

针对大尺寸纹理图集（4096px+），提供三种 LOD 策略：

- **`full`**（默认）：生成完整 mipmap 链
- **`single-auto`**：根据模型在屏幕上的实际大小，按需生成低分辨率纹理，减少显存占用
- **`false`**：仅使用原始纹理

```ts
const model = await Live2DModel.from('model.json', {
  textureOptions: { lod: 'single-auto' }
})
```

### 高精度遮罩自动检测

复杂模型（大量遮罩 Drawable、高顶点密度等）容易因遮罩精度不足产生视觉瑕疵。引擎会自动分析模型结构，在需要时启用高精度遮罩，默认开启，也可手动控制。

### 并行动作与末帧冻结

- **并行播放**：同时驱动多个动作组，适用于上下半身独立动画等场景
- **末帧冻结**：将动作定格在最后一帧，适用于立绘切换、姿态固定

```ts
// 并行播放
model.parallelMotion([
  { group: 'upper_body', index: 0 },
  { group: 'lower_body', index: 1 }
])

// 末帧冻结
await model.parallelLastFrame([
  { group: 'arm', index: 0 },
  { group: 'expression', index: 2 }
])
```

## 功能一览

- 支持 **Cubism 2 / 3 / 4 / 5** 模型
- PixiJS v8 原生渲染管线（Filter / RenderTexture / Render Pipe）
- 纹理 LOD 与高精度遮罩自动检测
- 并行动作播放 / 动作末帧冻结
- 实时口型同步（Lip Sync）
- PixiJS 风格变换：`position` / `scale` / `rotation` / `skew` / `anchor`
- 鼠标追踪 / 命中区域检测（Hit Area）
- 改进的动作预约与优先级调度
- 严格的 TypeScript 类型定义
- 可配置 Cubism 工作内存大小

## 依赖要求

- **PixiJS**：`8.x`
- **Cubism 运行时**：`2.1` 或 `5`
- **浏览器**：需支持 `WebGL` 与 `ES6`

## 安装

### 使用 npm / pnpm

```bash
pnpm add untitled-pixi-live2d-engine
# 或
npm install untitled-pixi-live2d-engine
```

```ts
import { Live2DModel } from 'untitled-pixi-live2d-engine'

// 仅使用 Cubism Legacy（Cubism 2.1）
import { Live2DModel } from 'untitled-pixi-live2d-engine/cubism-legacy'

// 仅使用 Cubism Modern（Cubism 3 / 4 / 5）
import { Live2DModel } from 'untitled-pixi-live2d-engine/cubism'
```

### 通过 HTML 引入

```html
<script src="https://cdn.jsdelivr.net/npm/untitled-pixi-live2d-engine/dist/index.min.js"></script>
```

## Cubism 运行时

Live2D 模型按 Cubism 架构分为两类，各自需要引入不同的外部运行时：

| 分类                | 模型版本             | 外部运行时                     | 打包入口               |
|-------------------|------------------|---------------------------|--------------------|
| **Cubism Legacy** | Cubism 2.1       | `live2d.min.js`           | `cubism-legacy.js` |
| **Cubism Modern** | Cubism 3 / 4 / 5 | `live2dcubismcore.min.js` | `cubism.js`        |
| **两者同时使用**        | —                | 以上两个                      | `index.js`         |

### 获取外部运行时

**Cubism Legacy** — `live2d.min.js`

官方已于 [2019 年 9 月 4 日](https://help.live2d.com/en/other/other_20/) 停止分发，可从以下来源获取：

- [GitHub](https://github.com/dylanNew/live2d/tree/master/webgl/Live2D/lib)
- [jsDelivr CDN](https://cdn.jsdelivr.net/gh/dylanNew/live2d/webgl/Live2D/lib/live2d.min.js)

**Cubism Modern** — `live2dcubismcore.min.js`

从官方 [Cubism 5 SDK for Web](https://www.live2d.com/download/cubism-sdk/download-web/) 下载。

## 快速开始

以下示例基于 PixiJS v8，同时支持 Cubism Legacy 与 Cubism Modern。

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

// 配置 Cubism Modern 工作内存（可选，默认 16MB）
// 同时加载多个或高复杂度模型时，建议适当增大
// configureCubismSDK({ memorySizeMB: 32 })

const model = await Live2DModel.from('model/model3.json')
model.anchor.set(0.5)
model.position.set(app.screen.width / 2, app.screen.height / 2)

app.stage.addChild(model)
```

## API 示例

### 播放动作

```ts
model.motion('group', index)
```

### 并行动作

```ts
model.parallelMotion([
  { group: group1, index: index1 },
  { group: group2, index: index2 }
])
```

### 末帧冻结

**单动作：**

```ts
model.motionLastFrame('group', index)
```

**多动作：**

```ts
await model.parallelLastFrame([
  { group: group1, index: index1 },
  { group: group2, index: index2 }
])
```

### 口型同步

```ts
model.speak('audio_file_url')
```

### 表情

```ts
model.expression('id')
```

## 常见问题

### Q: 同时加载多个模型后，模型更新异常？

使用 Cubism Modern 运行时时，通常是工作内存不足导致的。请在初始化时增大 `memorySizeMB`（最小 16MB）：

```ts
configureCubismSDK({ memorySizeMB: 32 })
```

## 许可证

[MIT](LICENSE)
