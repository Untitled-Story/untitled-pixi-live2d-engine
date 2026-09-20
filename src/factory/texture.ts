import type { Texture } from 'pixi.js'
import { Assets, loadTextures } from 'pixi.js'
import type { Live2DTextureLODOptions } from './texture-lod'
import { getTextureLODMode } from './texture-lod'

/**
 * Texture loading options accepted by Live2D model atlas loading.
 */
export interface Live2DTextureSourceOptions extends Live2DTextureLODOptions {
  /**
   * Forces Pixi to load texture resources without createImageBitmap.
   * Cubism 2 textures use this because their WebGL upload path depends on HTML image sources.
   * @default undefined
   */
  preferCreateImageBitmap?: boolean
}

export interface CreateTextureOptions extends Live2DTextureSourceOptions {
  crossOrigin?: string
  format?: string
}

export function getTextureFormat(path: string): string | undefined {
  const [pathname = ''] = path.split(/[?#]/, 1)
  const filename = pathname.slice(pathname.lastIndexOf('/') + 1)
  const extensionIndex = filename.lastIndexOf('.')

  if (extensionIndex <= 0 || extensionIndex === filename.length - 1) {
    return undefined
  }

  return filename.slice(extensionIndex + 1).toLowerCase()
}

export function createTexture(url: string, options: CreateTextureOptions = {}): Promise<Texture> {
  const config = loadTextures.config
  const previousCrossOrigin = config?.crossOrigin
  const previousPreferCreateImageBitmap = config?.preferCreateImageBitmap
  const previousPreferWorkers = config?.preferWorkers

  if (options.crossOrigin !== undefined && config) {
    config.crossOrigin = options.crossOrigin
  }
  if (options.preferCreateImageBitmap === false && config) {
    config.preferCreateImageBitmap = false
    config.preferWorkers = false
  }

  return Assets.load<Texture>({
    src: url,
    format: options.format,
    parser: 'texture',
    data: {
      autoGenerateMipmaps: getTextureLODMode(options.lod) === 'full'
    }
  })
    .catch((error: unknown) => {
      if (error instanceof Error) {
        throw error
      }

      throw new Error('Texture loading error', { cause: error })
    })
    .finally(() => {
      if (config) {
        config.crossOrigin = previousCrossOrigin ?? config.crossOrigin
        if (options.preferCreateImageBitmap === false) {
          config.preferCreateImageBitmap =
            previousPreferCreateImageBitmap ?? config.preferCreateImageBitmap
          config.preferWorkers = previousPreferWorkers ?? config.preferWorkers
        }
      }
    })
}
