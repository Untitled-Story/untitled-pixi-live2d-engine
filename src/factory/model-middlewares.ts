import { ModelSettings } from '@/cubism-common'
import { CubismLegacyModelSettings } from '@/cubism-legacy/CubismLegacyModelSettings'
import type { Live2DFactoryContext } from '@/factory/Live2DFactory'
import { Live2DFactory } from '@/factory/Live2DFactory'
import { Live2DLoader } from '@/factory/Live2DLoader'
import { createTexture } from '@/factory/texture'
import { logger } from '@/utils'
import type { Middleware } from '@/utils/middleware'
import type { JSONObject } from '@/types/helpers'
import { noop } from 'lodash-es'

const TAG = 'Live2DFactory'

/**
 * A middleware that converts the source from a URL to a settings JSON object.
 */
export const urlToJSON: Middleware<Live2DFactoryContext> = async (context, next) => {
  if (typeof context.source === 'string') {
    const data = (await Live2DLoader.load<JSONObject>({
      url: context.source,
      type: 'json',
      target: context.live2dModel
    })) as JSONObject & { url?: string }

    data.url = typeof data.url === 'string' ? data.url : context.source

    context.source = data

    context.live2dModel.emit('settingsJSONLoaded', data)
  }

  return next()
}

/**
 * A middleware that converts the source from a settings JSON object to a ModelSettings instance.
 */
export const jsonToSettings: Middleware<Live2DFactoryContext> = async (context, next) => {
  if (context.source instanceof ModelSettings) {
    context.settings = context.source

    return next()
  } else if (typeof context.source === 'object') {
    const runtime = Live2DFactory.findRuntime(context.source)

    if (runtime) {
      const settings = runtime.createModelSettings(context.source as JSONObject & { url: string })

      context.settings = settings
      context.live2dModel.emit('settingsLoaded', settings)

      return next()
    }
  }

  const url =
    context.source && typeof (context.source as { url?: unknown }).url === 'string'
      ? (context.source as { url: string }).url
      : undefined

  const runtimeVersions = Live2DFactory.runtimes.map((r) => r.version).join(', ')

  if (Live2DFactory.runtimes.length === 0) {
    throw new TypeError(
      [
        'Unknown settings format: no Live2D runtimes registered.',
        'Import a published runtime entry before loading models (e.g. "<package>/cubism" for Cubism 3/4/5, "<package>/cubism-legacy" for Cubism 2).',
        url ? `Settings URL: ${url}` : undefined
      ]
        .filter(Boolean)
        .join('\n')
    )
  }

  const topLevelKeys = (() => {
    try {
      if (!context.source || typeof context.source !== 'object' || Array.isArray(context.source)) {
        return undefined
      }
      return Object.keys(context.source as Record<string, unknown>)
        .slice(0, 30)
        .join(', ')
    } catch {
      return undefined
    }
  })()

  throw new TypeError(
    [
      'Unknown settings format: no matching runtime found for the loaded settings JSON.',
      runtimeVersions ? `Registered runtimes (versions): ${runtimeVersions}` : undefined,
      topLevelKeys ? `Settings JSON keys: ${topLevelKeys}` : undefined,
      url ? `Settings URL: ${url}` : undefined
    ]
      .filter(Boolean)
      .join('\n')
  )
}

export const waitUntilReady: Middleware<Live2DFactoryContext> = (context, next) => {
  if (context.settings) {
    const runtime = Live2DFactory.findRuntime(context.settings)

    if (runtime) {
      return runtime.ready().then(() => next())
    }
  }

  return next()
}

/**
 * A middleware that populates the Live2DModel with optional resources.
 * Requires InternalModel in context when all the subsequent middlewares have finished.
 */
export const setupOptionals: Middleware<Live2DFactoryContext> = async (context, next) => {
  // wait until all has finished
  await next()

  const internalModel = context.internalModel

  if (internalModel) {
    const settings = context.settings!
    const runtime = Live2DFactory.findRuntime(settings)

    if (runtime) {
      const tasks: Promise<void>[] = []
      const optionalDataType: XMLHttpRequestResponseType =
        settings instanceof CubismLegacyModelSettings ? 'json' : 'arraybuffer'

      if (settings.pose) {
        tasks.push(
          Live2DLoader.load<unknown>({
            settings,
            url: settings.pose,
            type: optionalDataType,
            target: internalModel
          })
            .then((data: unknown) => {
              internalModel.pose = runtime.createPose(internalModel.coreModel, data)
              context.live2dModel.emit('poseLoaded', internalModel.pose)
            })
            .catch((e: Error) => {
              context.live2dModel.emit('poseLoadError', e)
              logger.warn(TAG, 'Failed to load pose.', e)
            })
        )
      }

      if (settings.physics) {
        tasks.push(
          Live2DLoader.load<unknown>({
            settings,
            url: settings.physics,
            type: optionalDataType,
            target: internalModel
          })
            .then((data: unknown) => {
              internalModel.physics = runtime.createPhysics(internalModel.coreModel, data)
              context.live2dModel.emit('physicsLoaded', internalModel.physics)
            })
            .catch((e: Error) => {
              context.live2dModel.emit('physicsLoadError', e)
              logger.warn(TAG, 'Failed to load physics.', e)
            })
        )
      }

      if (tasks.length) {
        await Promise.all(tasks)
      }
    }
  }
}

/**
 * A middleware that populates the Live2DModel with essential resources.
 * Requires ModelSettings in context immediately, and InternalModel in context
 * when all the subsequent middlewares have finished.
 */
export const setupEssentials: Middleware<Live2DFactoryContext> = async (context, next) => {
  if (context.settings) {
    const live2DModel = context.live2dModel
    const textureOptions: { crossOrigin?: string; preferCreateImageBitmap?: boolean } = {
      crossOrigin: context.options.crossOrigin
    }

    if (context.settings instanceof CubismLegacyModelSettings) {
      textureOptions.preferCreateImageBitmap = false
    }

    const loadingTextures = Promise.all(
      context.settings.textures.map((tex) => {
        const url = context.settings!.resolveURL(tex)
        return createTexture(url, textureOptions)
      })
    )

    // we'll handle the error later (using await), this catch() is to suppress the unhandled rejection warning
    loadingTextures.catch(noop)

    // wait for the internal model to be created
    await next()

    if (context.internalModel) {
      live2DModel.internalModel = context.internalModel
      live2DModel.emit('modelLoaded', context.internalModel)
    } else {
      throw new TypeError('Missing internal model.')
    }

    live2DModel.textures = await loadingTextures
    live2DModel.emit('textureLoaded', live2DModel.textures)
  } else {
    throw new TypeError('Missing settings.')
  }
}

/**
 * A middleware that creates the InternalModel. Requires ModelSettings in context.
 */
export const createInternalModel: Middleware<Live2DFactoryContext> = async (context, next) => {
  const settings = context.settings

  if (settings instanceof ModelSettings) {
    const runtime = Live2DFactory.findRuntime(settings)

    if (!runtime) {
      throw new TypeError('Unknown model settings.')
    }

    const modelData = await Live2DLoader.load<ArrayBuffer>({
      settings,
      url: settings.moc,
      type: 'arraybuffer',
      target: context.live2dModel
    })

    if (!runtime.isValidMoc(modelData)) {
      throw new Error('Invalid moc data')
    }

    const coreModel: unknown = runtime.createCoreModel(modelData)

    context.internalModel = runtime.createInternalModel(coreModel, settings, context.options)

    return next()
  }

  throw new TypeError('Missing settings.')
}
