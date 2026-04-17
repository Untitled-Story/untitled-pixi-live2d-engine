import './factory'
import { logger, MBToByte } from '@/utils'
import type { Option } from '@cubism/live2dcubismframework'
import { CubismFramework, LogLevel } from '@cubism/live2dcubismframework'

let startupPromise: Promise<void>
let startupRetries = 20

let cubismMemory = 16

interface CubismConfig {
  /**
   * Memory size in megabytes for Cubism's internal heap.
   */
  memorySizeMB?: number
}

/**
 * Configures global Cubism startup settings.
 */
export function configureCubismSDK(config: CubismConfig = {}): void {
  if (config.memorySizeMB != null) {
    cubismMemory = config.memorySizeMB
  }
}

/**
 * Promises that the Cubism framework is ready to work.
 * @return Promise that resolves if the startup has succeeded, rejects if failed.
 */
export function cubismReady(): Promise<void> {
  if (CubismFramework.isStarted()) {
    return Promise.resolve()
  }

  startupPromise ??= new Promise<void>((resolve, reject) => {
    function startUpWithRetry() {
      try {
        startUpCubism()
        resolve()
      } catch (e) {
        startupRetries--

        if (startupRetries < 0) {
          reject(new Error('Failed to start up Cubism framework.', { cause: e }))
          return
        }

        logger.log('Cubism', 'Startup failed, retrying 10ms later...')

        setTimeout(startUpWithRetry, 10)
      }
    }

    startUpWithRetry()
  })

  return startupPromise
}

/**
 * Starts up the Cubism framework.
 */
export function startUpCubism(options?: Option, memorySizeMB?: number) {
  const startupOptions: Option = {
    logFunction: console.log,
    loggingLevel: LogLevel.LogLevel_Verbose,
    ...options
  }

  const memory = memorySizeMB ?? cubismMemory

  CubismFramework.startUp(startupOptions)
  CubismFramework.initialize(MBToByte(memory))
}

/**
 * Reconfigures Cubism settings and restarts the framework so they take effect.
 */
export function reconfigureCubismSDK(config: CubismConfig = {}): void {
  configureCubismSDK(config)

  if (CubismFramework.isInitialized()) {
    CubismFramework.dispose()
  }

  if (CubismFramework.isStarted()) {
    CubismFramework.cleanUp()
  }

  startUpCubism(undefined, config.memorySizeMB)
}
