# untitled-pixi-live2d-engine

![NPM Version](https://img.shields.io/npm/v/untitled-pixi-live2d-engine?style=flat-square&label=version)
![Cubism version](https://img.shields.io/badge/Cubism-2/3/4/5-ff69b4?style=flat-square)

[**English**](README.md) | [**简体中文**](README-ZH.md) | **日本語 (現在)**

PixiJS v8 向けの Live2D 描画・制御プラグイン。

本プロジェクトは、Web 上で Live2D モデルを読み込み、描画し、操作するための**統一的で簡潔、かつ高い保守性**を備えた API を提供することを目的としています。  
公式 Live2D SDK と比べて、機能を損なわずに利用の複雑さを大幅に低減し、安定性と長期的な保守性を最適化しています。

本プロジェクトは [pixi-live2d-display-mulmotion](https://github.com/Sekai-World/pixi-live2d-display) 分岐を基にしており、  
**PixiJS v8 と Live2D Cubism 5.4 SDK に完全対応**しています。さらに、以下を提供します：

- 実用的な API の追加
- TypeScript の型安全性の強化
- 拡張性と保守性を高める内部構成の最適化

## 特長

- Live2D モデルの**全バージョン**に対応（Cubism 2 / 3 / 4 / 5）
- `PIXI.RenderTexture` と `PIXI.Filter` に対応
- **PixiJS 風の変換 API** を提供
  - `position`
  - `scale`
  - `rotation`
  - `skew`
  - `anchor`

- インタラクション機能を内蔵
  - マウス追従
  - ヒットエリア検出

- 公式 SDK よりも**モーションの予約・スケジューリングを改善**
- 厳密で完全な **TypeScript 型定義**
- リアルタイムのリップシンク対応
- **モーションの並列再生**
- **最終フレームで停止**する再生に対応

## 要件

- **PixiJS**: `8.x`
- **Cubism runtime**: `2.1` または `5`
- **ブラウザ**: `WebGL` と `ES6` をサポート

## インストール

### npm / pnpm を使用

```bash
pnpm add untitled-pixi-live2d-engine
# or
npm install untitled-pixi-live2d-engine
```

```ts
import { Live2DModel } from 'untitled-pixi-live2d-engine'

// Cubism Legacy のみ（Cubism 2.1）
import { Live2DModel } from 'untitled-pixi-live2d-engine/cubism-legacy'

// Cubism Modern のみ（Cubism 3 / 4 / 5）
import { Live2DModel } from 'untitled-pixi-live2d-engine/cubism'
```

### HTML から読み込み

```html
<script src="https://cdn.jsdelivr.net/npm/untitled-pixi-live2d-engine/dist/index.min.js"></script>
```

## Cubism ランタイムの概要

このプロジェクトは Live2D モデルの**全バージョン**に対応しており、Cubism の構成で次のように分類されます：

- **Cubism Legacy**: Cubism 2.1
- **Cubism Modern**: Cubism 3 / 4 / 5

使用するモデルに合わせて適切なランタイムエントリを選択してください。

### Cubism Legacy と Cubism Modern を併用する場合

#### バンドルエントリ

```text
index.js
```

> Cubism 2 と Cubism 3+ の両方を読み込む場合は、この統合エントリを使用します。

### Cubism Legacy のみ（Cubism 2.1）

#### 前提条件

`live2d.min.js` を手動で読み込む必要があります：

- 公式配布は 2019 年 9 月 4 日に終了
  [September 4, 2019](https://help.live2d.com/en/other/other_20/)
- 入手先：
  - GitHub:
    [https://github.com/dylanNew/live2d/tree/master/webgl/Live2D/lib](https://github.com/dylanNew/live2d/tree/master/webgl/Live2D/lib)
  - jsDelivr CDN:
    [https://cdn.jsdelivr.net/gh/dylanNew/live2d/webgl/Live2D/lib/live2d.min.js](https://cdn.jsdelivr.net/gh/dylanNew/live2d/webgl/Live2D/lib/live2d.min.js)

#### バンドルエントリ

```text
cubism-legacy.js
```

### Cubism Modern のみ（Cubism 3 / 4 / 5）

#### 前提条件

`live2dcubismcore.min.js` を読み込む必要があります：

- 公式 **Cubism 5 SDK** からダウンロード可能
  [https://www.live2d.com/download/cubism-sdk/download-web/](https://www.live2d.com/download/cubism-sdk/download-web/)

#### バンドルエントリ

```text
cubism.js
```

## クイックスタート

以下は **PixiJS v8** をベースにした例で、Cubism Legacy と Cubism Modern の両方に対応します。

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

// Cubism Modern のワークメモリを設定（任意、デフォルトは 16MB）
// 複数モデルや高精細モデルを読み込む場合に増やしてください
// configureCubismSDK({
//   memorySizeMB: 32
// })

const model = await Live2DModel.from('model/model3.json')
model.anchor.set(0.5)
model.position.set(app.screen.width / 2, app.screen.height / 2)

app.stage.addChild(model)
```

## よく使う API 例

### モーション再生

```ts
model.motion('group', index)
```

### モーションの並列再生

```ts
model.parallelMotion([
  { group: group1, index: index1 },
  { group: group2, index: index2 }
])
```

### 最終フレームで停止

**単一モーション：**

```ts
model.motionLastFrame('group', index)
```

**複数モーション：**

```ts
await model.parallelLastFrame([
  { group: group1, index: index1 },
  { group: group2, index: index2 }
])
```

### リップシンク

```ts
model.speak('audio_file_url')
```

### 表情

```ts
model.expression('id')
```

より高度な使い方は以下を参照してください：  
[pixi-live2d-display-lipsync](https://github.com/RaSan147/pixi-live2d-display)

## FAQ

### Q: 複数モデルを読み込むと更新が止まるのはなぜですか？

**Cubism Modern** ランタイムを使用している場合、`configureCubismSDK` で設定するワークメモリが不足している可能性があります。

初期化時に `memorySizeMB` を増やしてみてください（最小値: 16MB）。
