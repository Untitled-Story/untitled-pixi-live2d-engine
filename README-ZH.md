# untitled-pixi-live2d-engine

![NPM Version](https://img.shields.io/npm/v/untitled-pixi-live2d-engine?style=flat-square&label=version)
![Cubism version](https://img.shields.io/badge/Cubism-2/3/4/5-ff69b4?style=flat-square)

[**English**](README.md) | **简体中文 (当前)** | [**日本語**](README-JA.md)

一款面向 **[PixiJS v8](https://pixijs.com/)** 的 Live2D 显示与控制插件。

本项目旨在为 Web 端 Live2D 模型的加载、渲染与交互提供 **统一、简洁且高可维护性** 的 API。
相较于官方 Live2D SDK，本库在保持功能完整的同时，显著降低了使用复杂度，并在稳定性与长期维护性上进行了优化。

本项目基于 [pixi-live2d-display-mulmotion](https://github.com/Sekai-World/pixi-live2d-display) 分支开发，**完全适配 PixiJS v8 与 Live2D Cubism 5.4 SDK**，
并在此基础上：

- 增加了多项实用 API
- 强化了 TypeScript 类型安全
- 优化了内部结构，使其更易扩展与维护

## 功能特性

- 支持 **所有版本** 的 Live2D 模型（Cubism 2 / 3 / 4 / 5）
- 兼容 `PIXI.RenderTexture`（渲染纹理）与 `PIXI.Filter`（滤镜）
- 提供完整的 **PixiJS 风格变换 API**
  - `position`（位置）
  - `scale`（缩放）
  - `rotation`（旋转）
  - `skew`（倾斜）
  - `anchor`（锚点）

- 内置交互支持
  - 鼠标追踪
  - 点击命中检测（Hit Area）

- 相比官方 SDK，优化了 **动作预约与调度逻辑**
- 完整且严格的 **TypeScript 类型定义**
- 支持实时口型同步（Lip Sync）
- 支持 **多动作并行播放**
- 支持播放动作的 **末帧状态（Freeze）**

## 依赖要求

- **PixiJS**：`8.x`
- **Cubism 运行时**：`2.1` 或 `5`
- **浏览器环境**：需支持 `WebGL` 与 `ES6`

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

### 通过 HTML 导入

```html
<script src="https://cdn.jsdelivr.net/npm/untitled-pixi-live2d-engine/dist/index.min.js"></script>
```

## Cubism 运行时说明

本项目支持 **所有版本的 Live2D 模型**，根据 Cubism 架构差异分为两类：

- **Cubism Legacy**：Cubism 2.1
- **Cubism Modern**：Cubism 3 / 4 / 5

你可以根据实际模型类型选择对应的运行时入口。

### 同时使用 Cubism Legacy 与 Cubism Modern

#### 使用的打包文件

```text
index.js
```

> 当项目中需要同时加载 Cubism 2 与 Cubism 3+ 模型时，请使用统一入口。

### Cubism Legacy Only（Cubism 2.1）

#### 前置要求

需要手动引入 `live2d.min.js`：

- 官方已于
  [2019 年 9 月 4 日](https://help.live2d.com/en/other/other_20/)
  停止提供该文件
- 可从以下来源获取：
  - GitHub：
    [https://github.com/dylanNew/live2d/tree/master/webgl/Live2D/lib](https://github.com/dylanNew/live2d/tree/master/webgl/Live2D/lib)
  - jsDelivr CDN：
    [https://cdn.jsdelivr.net/gh/dylanNew/live2d/webgl/Live2D/lib/live2d.min.js](https://cdn.jsdelivr.net/gh/dylanNew/live2d/webgl/Live2D/lib/live2d.min.js)

#### 使用的打包文件

```text
cubism-legacy.js
```

### Cubism Modern Only（Cubism 3 / 4 / 5）

#### 前置要求

需要引入 `live2dcubismcore.min.js`：

- 可从官方 **Cubism 5 SDK** 下载
  [https://www.live2d.com/download/cubism-sdk/download-web/](https://www.live2d.com/download/cubism-sdk/download-web/)

#### 使用的打包文件

```text
cubism.js
```

## 快速开始

以下示例基于 **PixiJS v8**，同时支持 Cubism Legacy 与 Cubism Modern。

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

// 配置 Cubism Modern 的工作内存（可选，默认 16MB）
// 当同时加载多个模型或高复杂模型时，建议适当增大
// configureCubismSDK({
//   memorySizeMB: 32
// })

const model = await Live2DModel.from('model/model3.json')
model.anchor.set(0.5)
model.position.set(app.screen.width / 2, app.screen.height / 2)

app.stage.addChild(model)
```

## 常用 API 示例

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

### 播放动作末帧

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

### 唇形同步

```ts
model.speak('audio_file_url')
```

### 表情

```ts
model.expression('id')
```

详细用法可参见
[pixi-live2d-display-lipsync](https://github.com/RaSan147/pixi-live2d-display)

## 常见问题

### Q: 为什么同时加载多个模型后，模型更新异常？

在 **Cubism Modern** 运行时下，通常是由于 `configureCubismSDK` 时配置的工作内存不足导致。

请尝试在初始化阶段增大 `memorySizeMB` 的值（最小 16MB）。
