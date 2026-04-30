# untitled-pixi-live2d-engine

![NPM Version](https://img.shields.io/npm/v/untitled-pixi-live2d-engine?style=flat-square&label=version)
![Cubism version](https://img.shields.io/badge/Cubism-2/3/4/5-ff69b4?style=flat-square)
![PixiJS](https://img.shields.io/badge/PixiJS-v8-e72264?style=flat-square)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?style=flat-square)

[**English**](README.md) | [**简体中文**](README-ZH.md) | **日本語 (現在)**

**[PixiJS v8](https://pixijs.com/)** 向けの Live2D レンダリングエンジン。**Cubism 2 / 3 / 4 / 5** モデルに対応しています。

本プロジェクトは [pixi-live2d-display-mulmotion](https://github.com/Sekai-World/pixi-live2d-display) を大幅にリファクタリングし、PixiJS v8 と Cubism 5 SDK に対応させたものです。API 設計・レンダリングパイプライン・型安全性を改善しています。

## 主な特徴

### PixiJS v8 ネイティブレンダリング

カスタム **Render Pipe** により PixiJS v8 のレンダリングアーキテクチャに統合：

- `Filter` および `RenderTexture` に対応
- **zIndex ソート**・**ブレンドモード**に参加
- レンダラーの解像度を継承し、フィルター適用時のぼやけを防止

### Cubism 2–5 対応

**Cubism 2.1（Legacy）** と **Cubism 5（Modern）** の両方に対応。バンドルエントリを切り替えることで、必要なランタイムのみを読み込めます。

### テクスチャ LOD

大きなテクスチャアトラス（4096px 以上）に対して、3 つの LOD 戦略を提供：

- **`full`**（デフォルト）：完全な mipmap チェーンを生成
- **`single-auto`**：画面上のモデルの実際のサイズに応じて低解像度テクスチャを生成し、VRAM 使用量を削減
- **`false`**：元のテクスチャのみを使用

```ts
const model = await Live2DModel.from('model.json', {
  textureOptions: { lod: 'single-auto' }
})
```

### 高精度マスクの自動検出

複雑なモデル（多数のマスク Drawable、高い頂点密度など）では、マスク精度不足による描画の乱れが生じることがあります。エンジンがモデル構造を自動的に分析し、必要に応じて高精度マスクを有効にします。デフォルトで有効であり、手動での制御も可能です。

### 並列モーション・最終フレーム固定

- **並列再生**：複数のモーショングループを同時に駆動（上半身・下半身の独立アニメーションなど）
- **最終フレーム固定**：モーションを最終フレームで停止させる（立ち絵の切り替え、ポーズ固定など）

```ts
// 並列再生
model.parallelMotion([
  { group: 'upper_body', index: 0 },
  { group: 'lower_body', index: 1 }
])

// 最終フレーム固定
await model.parallelLastFrame([
  { group: 'arm', index: 0 },
  { group: 'expression', index: 2 }
])
```

## 機能一覧

- **Cubism 2 / 3 / 4 / 5** モデル対応
- PixiJS v8 ネイティブレンダリングパイプライン（Filter / RenderTexture / Render Pipe）
- テクスチャ LOD・高精度マスク自動検出
- 並列モーション再生 / 最終フレーム固定
- リアルタイムリップシンク
- PixiJS 形式のトランスフォーム：`position` / `scale` / `rotation` / `skew` / `anchor`
- マウス追従 / ヒットエリア検出
- 改善されたモーション予約・優先度スケジューリング
- 厳密な TypeScript 型定義
- Cubism ワークメモリサイズの設定

## 要件

- **PixiJS**：`8.x`
- **Cubism ランタイム**：`2.1` または `5`
- **ブラウザ**：`WebGL` と `ES6` をサポートすること

## インストール

### npm / pnpm

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

## Cubism ランタイム

Live2D モデルは Cubism アーキテクチャにより 2 種類に分かれ、それぞれ異なる外部ランタイムが必要です：

| 分類 | モデルバージョン | 外部ランタイム | バンドルエントリ |
|---|---|---|---|
| **Cubism Legacy** | Cubism 2.1 | `live2d.min.js` | `cubism-legacy.js` |
| **Cubism Modern** | Cubism 3 / 4 / 5 | `live2dcubismcore.min.js` | `cubism.js` |
| **両方を使用** | — | 上記の両方 | `index.js` |

### 外部ランタイムの入手

**Cubism Legacy** — `live2d.min.js`

公式配布は [2019 年 9 月 4 日](https://help.live2d.com/en/other/other_20/) に終了。以下から入手できます：
- [GitHub](https://github.com/dylanNew/live2d/tree/master/webgl/Live2D/lib)
- [jsDelivr CDN](https://cdn.jsdelivr.net/gh/dylanNew/live2d/webgl/Live2D/lib/live2d.min.js)

**Cubism Modern** — `live2dcubismcore.min.js`

公式 [Cubism 5 SDK for Web](https://www.live2d.com/download/cubism-sdk/download-web/) からダウンロードしてください。

## クイックスタート

以下は PixiJS v8 を使用した例で、Cubism Legacy と Cubism Modern の両方に対応します。

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

// Cubism Modern のワークメモリを設定（任意、デフォルト 16MB）
// 複数モデルや複雑なモデルを読み込む場合は増やしてください
// configureCubismSDK({ memorySizeMB: 32 })

const model = await Live2DModel.from('model/model3.json')
model.anchor.set(0.5)
model.position.set(app.screen.width / 2, app.screen.height / 2)

app.stage.addChild(model)
```

## API 例

### モーション再生

```ts
model.motion('group', index)
```

### 並列モーション

```ts
model.parallelMotion([
  { group: group1, index: index1 },
  { group: group2, index: index2 }
])
```

### 最終フレーム固定

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

## FAQ

### Q: 複数モデルを読み込むと更新が止まる？

Cubism Modern ランタイム使用時、ワークメモリ不足が原因であることが多いです。初期化時に `memorySizeMB` を増やしてください（最小 16MB）：

```ts
configureCubismSDK({ memorySizeMB: 32 })
```

## ライセンス

[MIT](LICENSE)
