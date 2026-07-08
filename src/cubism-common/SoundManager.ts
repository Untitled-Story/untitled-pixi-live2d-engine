import { logger, remove } from '@/utils'
import { config } from '@/config'
import type { Sound, SoundLibrary } from '@pixi/sound'

const TAG = 'SoundManager'
export const VOLUME = 0.5

const SOUND_ALIAS_PREFIX = 'live2d-sound-'

let soundId = 0
let pixiSoundPromise: Promise<SoundLibrary | null> | undefined
const configuredLibraries = new WeakSet<SoundLibrary>()

function configureSoundLibrary(library: SoundLibrary): SoundLibrary {
  if (!configuredLibraries.has(library)) {
    try {
      library.disableAutoPause = true
    } catch (e) {
      logger.warn(TAG, 'Failed to disable @pixi/sound auto pause.', e)
    }

    configuredLibraries.add(library)
  }

  return library
}

function getGlobalSoundLibrary(): SoundLibrary | undefined {
  return typeof PIXI !== 'undefined' ? PIXI?.sound : undefined
}

async function resolveSoundLibrary(): Promise<SoundLibrary | null> {
  const globalLibrary = getGlobalSoundLibrary()

  if (globalLibrary) {
    return configureSoundLibrary(globalLibrary)
  }

  pixiSoundPromise ??= import('@pixi/sound')
    .then(({ sound }) => configureSoundLibrary(sound))
    .catch((e: unknown) => {
      logger.warn(
        TAG,
        '@pixi/sound is not available. Load pixi-sound.js before using motion sounds, speak(), or lip sync.',
        e
      )

      return null
    })

  return pixiSoundPromise
}

function removeSound(library: SoundLibrary, alias: string): void {
  try {
    library.remove(alias)
  } catch (e) {
    logger.warn(TAG, `Failed to remove sound "${alias}".`, e)
  }
}

function destroySound(audio: Sound): void {
  try {
    audio.destroy()
  } catch (e) {
    logger.warn(TAG, 'Failed to destroy audio.', e)
  }
}

function getAudioBuffer(audio: Sound): AudioBuffer | undefined {
  const media = audio.media as { buffer?: unknown }
  const buffer = media.buffer

  if (!buffer || typeof buffer !== 'object') {
    return undefined
  }

  const candidate = buffer as Partial<AudioBuffer>

  return typeof candidate.getChannelData === 'function' ? (buffer as AudioBuffer) : undefined
}

/**
 * Manages all the sounds.
 */
export class SoundManager {
  /**
   * Audio elements playing or pending to play. Finished audios will be removed automatically.
   */
  static audios: Sound[] = []
  static analysers: AnalyserNode[] = []
  static contexts: AudioContext[] = []
  protected static aliases = new WeakMap<Sound, { alias: string; library: SoundLibrary }>()

  protected static _volume = VOLUME

  /**
   * Global volume that applies to all the sounds.
   */
  static get volume(): number {
    return this._volume
  }

  static set volume(value: number) {
    this._volume = (value > 1 ? 1 : value < 0 ? 0 : value) || 0
    this.audios.forEach((audio) => (audio.volume = this._volume))
  }

  // TODO: return an ID?
  /**
   * Creates an audio element and adds it to the {@link audios}.
   * @param file - URL of the sound file.
   * @param onError - Callback invoked when error occurs.
   * @return Created audio element.
   */
  static async add(file: string, onError?: (e: Error) => void): Promise<Sound | null> {
    let library: SoundLibrary | null = null
    let alias: string | undefined

    try {
      library = await resolveSoundLibrary()

      if (!library) {
        throw new Error('@pixi/sound is not available')
      }

      alias = `${SOUND_ALIAS_PREFIX}${soundId++}`
      const soundLibrary = library
      const soundAlias = alias

      const task = new Promise<Sound>((resolve, reject) => {
        const audio = soundLibrary.add(soundAlias, {
          url: file,
          volume: this._volume,
          preload: true,
          loaded: (error, loadedAudio) => {
            if (error) {
              reject(error)
              return
            }

            const sound = loadedAudio ?? audio

            if (!sound) {
              reject(new Error(`Error: ${file} failed to load`))
              return
            }

            if (!getAudioBuffer(sound)) {
              reject(new Error(`Error: ${file} is not WebAudioMedia`))
              return
            }

            resolve(sound)
          }
        })
      })

      const audio = await task

      this.aliases.set(audio, { alias: soundAlias, library: soundLibrary })
      this.audios.push(audio)

      return audio
    } catch (e) {
      if (library && alias) {
        removeSound(library, alias)
      }

      logger.warn(TAG, `Error occurred on "${file}"`, e)
      onError?.(e as Error)
      return null
    }
  }

  /**
   * Plays the sound.
   * @param audio - An audio element.
   * @param onFinish - Callback invoked when the playback has finished.
   */
  static play(audio: Sound, onFinish?: () => void): void {
    void audio.play({
      singleInstance: true,
      complete: () => {
        onFinish?.()
        this.dispose(audio)
      }
    })
  }

  static addAnalyzer(audio: Sound, context: AudioContext): AnalyserNode | undefined {
    const buffer = getAudioBuffer(audio)

    if (!buffer) {
      logger.warn(TAG, 'Cannot create audio analyzer because WebAudio media is unavailable.')
      return undefined
    }

    /* Create an AnalyserNode */
    const source = context.createBufferSource()

    source.buffer = buffer

    const analyser = context.createAnalyser()

    analyser.fftSize = config.fftSize
    analyser.minDecibels = -90
    analyser.maxDecibels = -10
    analyser.smoothingTimeConstant = 0.85

    source.connect(analyser)
    source.start(0)

    this.analysers.push(analyser)
    return analyser
  }

  /**
   * Get volume for lip sync
   * @param analyser - An analyzer element.
   * @return Returns value to feed into lip sync
   */
  static analyze(analyser?: AnalyserNode): number {
    if (!analyser) return parseFloat(Math.random().toFixed(1))

    const buffer = new Float32Array(analyser.fftSize)
    analyser.getFloatTimeDomainData(buffer)

    let sumSquares = 0
    for (let i = 0; i < buffer.length; i++) {
      sumSquares += buffer[i]! ** 2
    }
    const rms = Math.sqrt(sumSquares / buffer.length)

    const minDecibel = -100
    const db = 20 * Math.log10(rms || 10 ** (minDecibel / 20))

    const scaledDb = Math.min(
      Math.max((db - analyser.minDecibels) / (analyser.maxDecibels - analyser.minDecibels), 0),
      1
    )

    return parseFloat(scaledDb.toFixed(1))
  }

  /**
   * Disposes an audio element and removes it from {@link audios}.
   * @param audio - An audio element.
   */
  static dispose(audio: Sound): void {
    try {
      audio.pause()
    } catch (e) {
      logger.warn(TAG, 'Failed to pause audio.', e)
    }

    const managedSound = this.aliases.get(audio)

    if (managedSound) {
      removeSound(managedSound.library, managedSound.alias)
      this.aliases.delete(audio)
    } else {
      destroySound(audio)
    }

    remove(this.audios, audio)
  }

  /**
   * Destroys all managed audios.
   */
  static destroy(): void {
    // dispose() removes given audio from the array, so the loop must be backward
    for (let i = this.contexts.length - 1; i >= 0; i--) {
      const context = this.contexts[i]
      void context?.close().catch((e: unknown) => {
        logger.warn(TAG, 'Failed to close AudioContext.', e)
      })
    }

    for (let i = this.audios.length - 1; i >= 0; i--) {
      this.dispose(this.audios[i]!)
    }
  }
}
