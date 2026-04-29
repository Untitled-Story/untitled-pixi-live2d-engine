/**
 * Atlas texture LOD strategy used when loading and rendering Live2D model textures.
 *
 * - `full`: ask Pixi to generate a full mipmap chain for the original atlas.
 * - `single-auto`: keep the original atlas, and render with one generated downsampled
 *   atlas when the model is small enough on screen.
 * - `false`: use the original atlas only.
 */
export type Live2DTextureLODMode = false | 'full' | 'single-auto'

/**
 * Sampling filter used while generating a `single-auto` downsampled atlas.
 */
export type Live2DTextureLODFilter = 'linear' | 'nearest'

export interface Live2DTextureLODOptions {
  /**
   * Selects the atlas LOD strategy for model textures.
   *
   * `full` is the default and uses Pixi's mipmap generation for the original atlas.
   * `single-auto` creates one downsampled atlas on demand and switches to it while
   * rendering small models. `false` disables both paths.
   *
   * @default 'full'
   */
  lod?: Live2DTextureLODMode

  /**
   * Effective screen scale below which `single-auto` can switch to a generated
   * downsampled atlas. The effective scale is computed from model world scale and
   * renderer resolution.
   *
   * Ignored unless `lod` is `'single-auto'`.
   *
   * @default 0.5
   */
  lodScaleThreshold?: number

  /**
   * Minimum original atlas side length required before `single-auto` considers
   * generating a downsampled atlas.
   *
   * Ignored unless `lod` is `'single-auto'`.
   *
   * @default 4096
   */
  lodTextureSizeThreshold?: number

  /**
   * Maximum generated `single-auto` LOD level. Each level halves the atlas width and
   * height once, so level 1 is 1/2 size and level 2 is 1/4 size.
   *
   * Ignored unless `lod` is `'single-auto'`.
   *
   * @default undefined
   */
  lodMaxLevel?: number

  /**
   * Sampling filter used while drawing the generated `single-auto` atlas.
   *
   * Ignored unless `lod` is `'single-auto'`.
   *
   * @default 'linear'
   */
  lodFilter?: Live2DTextureLODFilter
}

export interface TextureLODPlanInput extends Live2DTextureLODOptions {
  effectiveScale: number
  textureWidth: number
  textureHeight: number
}

export interface TextureLODPlan {
  level: number
  width: number
  height: number
}

const DEFAULT_LOD_SCALE_THRESHOLD = 0.5
const DEFAULT_LOD_TEXTURE_SIZE_THRESHOLD = 4096

export function getTextureLODPlan({
  lod,
  effectiveScale,
  textureWidth,
  textureHeight,
  lodScaleThreshold,
  lodTextureSizeThreshold,
  lodMaxLevel
}: TextureLODPlanInput): TextureLODPlan | undefined {
  if (getTextureLODMode(lod) !== 'single-auto') {
    return undefined
  }

  if (!Number.isFinite(effectiveScale) || effectiveScale <= 0) {
    return undefined
  }

  const width = Math.floor(textureWidth)
  const height = Math.floor(textureHeight)

  if (width <= 1 || height <= 1) {
    return undefined
  }

  const scaleThreshold = validPositive(lodScaleThreshold, DEFAULT_LOD_SCALE_THRESHOLD)

  if (effectiveScale >= scaleThreshold) {
    return undefined
  }

  const textureSizeThreshold = validPositive(
    lodTextureSizeThreshold,
    DEFAULT_LOD_TEXTURE_SIZE_THRESHOLD
  )

  if (Math.max(width, height) < textureSizeThreshold) {
    return undefined
  }

  const rawLevel = Math.round(Math.log2(1 / effectiveScale))
  const maxDimensionLevel = Math.max(1, Math.floor(Math.log2(Math.max(width, height))))
  const maxLevel = Math.min(maxDimensionLevel, validMaxLevel(lodMaxLevel, maxDimensionLevel))
  const level = clamp(Math.max(1, rawLevel), 1, maxLevel)
  const factor = 2 ** level

  return {
    level,
    width: Math.max(1, Math.round(width / factor)),
    height: Math.max(1, Math.round(height / factor))
  }
}

export function getTextureLODMode(lod?: Live2DTextureLODMode): Live2DTextureLODMode {
  if (lod === false || lod === 'single-auto') {
    return lod
  }

  return 'full'
}

export function getTextureLODFilter(filter?: Live2DTextureLODFilter): Live2DTextureLODFilter {
  return filter === 'nearest' ? 'nearest' : 'linear'
}

function validPositive(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : fallback
}

function validMaxLevel(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value >= 1 ? Math.floor(value) : fallback
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
