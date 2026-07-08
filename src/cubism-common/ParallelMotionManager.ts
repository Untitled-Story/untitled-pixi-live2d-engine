// noinspection JSCommentMatchesSignature,JSUnusedGlobalSymbols

import type { MotionManager } from '@/cubism-common/MotionManager'
import type { ModelSettings } from '@/cubism-common/ModelSettings'
import { MotionPriority, MotionState } from '@/cubism-common/MotionState'
import { logger } from '@/utils'
import { EventEmitter } from 'pixi.js'
import type { InternalModel } from '@/cubism-common/InternalModel'

export interface ParallelMotionStartOptions {
  ignoreParamIds?: string[]
  /**
   * Whether the motion should loop. Overrides Cubism 3/4/5 motion JSON loop metadata when specified.
   */
  loop?: boolean
}

export type ParallelMotionStartRandomOptions = Omit<ParallelMotionStartOptions, 'ignoreParamIds'>

/**
 * Handles the motion playback.
 * @emits {@link MotionManagerEvents}
 */
export abstract class ParallelMotionManager<
  Motion = never,
  MotionSpec = never
> extends EventEmitter {
  /**
   * Tag for logging.
   */
  tag: string

  manager: MotionManager

  /**
   * The ModelSettings reference.
   */
  readonly settings: ModelSettings

  /**
   * Maintains the state of this MotionManager.
   */
  state = new MotionState()

  /**
   * Flags there's a motion playing.
   */
  playing = false

  /**
   * Flags the instances has been destroyed.
   */
  destroyed = false

  readonly parent: InternalModel

  protected constructor(parent: InternalModel) {
    super()
    this.settings = parent.settings
    this.tag = `ParallelMotionManager(${this.settings.name})`
    this.state.tag = this.tag
    this.manager = parent.motionManager
    this.parent = parent
  }

  /**
   * Starts a motion as given priority.
   * @param group - The motion group.
   * @param index - Index in the motion group.
   * @param priority - The priority to be applied. default: 2 (NORMAL)
   * @param ignoreParamIds - The ids to be ignored.
   * @param loop - Whether the motion should loop. Overrides Cubism 3/4/5 motion JSON loop metadata when specified.
   * @return Promise that resolves with true if the motion is successfully started, with false otherwise.
   */
  async startMotion(
    group: string,
    index: number,
    priority: MotionPriority = MotionPriority.NORMAL,
    options: ParallelMotionStartOptions | string[] = {}
  ): Promise<boolean> {
    const { ignoreParamIds = [], loop } = Array.isArray(options)
      ? { ignoreParamIds: options, loop: undefined }
      : options

    if (!this.state.reserve(group, index, priority)) {
      return false
    }

    const definition = this.manager.definitions[group]?.[index]
    if (!definition) {
      return false
    }

    const motion = await this.manager.loadMotion(group, index)

    if (!this.state.start(motion, group, index, priority)) {
      return false
    }
    logger.log(this.tag, 'Start motion:', this.getMotionName(definition as MotionSpec))

    this.emit('motionStart', group, index, undefined)

    this.playing = true

    this._startMotion(motion! as Motion, undefined, ignoreParamIds, loop)

    return true
  }

  /**
   * Starts a random Motion as given priority.
   * @param group - The motion group.
   * @param priority - The priority to be applied. (default: 1 `IDLE`)
   * @param loop - Whether the motion should loop. Overrides Cubism 3/4/5 motion JSON loop metadata when specified.
   * @return Promise that resolves with true if the motion is successfully started, with false otherwise.
   */
  async startRandomMotion(
    group: string,
    priority?: MotionPriority,
    { loop = undefined }: ParallelMotionStartRandomOptions = {}
  ): Promise<boolean> {
    const groupDefs = this.manager.definitions[group]

    if (groupDefs?.length) {
      const availableIndices: number[] = []
      const groupMotions = this.manager.motionGroups[group] ?? []

      for (let i = 0; i < groupDefs.length; i++) {
        if (groupMotions[i] !== null && !this.state.isActive(group, i)) {
          availableIndices.push(i)
        }
      }

      if (availableIndices.length) {
        const index = availableIndices[Math.floor(Math.random() * availableIndices.length)]!

        return this.startMotion(group, index, priority, { loop: loop })
      }
    }

    return false
  }

  /**
   * Stops all playing motions as well as the sound.
   */
  stopAllMotions(): void {
    this._stopAllMotions()

    this.state.reset()
  }

  /**
   * Updates parameters of the core model.
   * @param model - The core model.
   * @param now - Current time in milliseconds.
   * @return True if the parameters have been actually updated.
   */
  update(model: object, now: DOMHighResTimeStamp): boolean {
    if (this.isFinished()) {
      if (this.playing) {
        this.playing = false
        this.emit('motionFinish')
      }

      this.state.complete()
    }
    return this.updateParameters(model, now)
  }

  /**
   * Destroys the instance.
   * @emits {@link MotionManagerEvents.destroy}
   */
  destroy() {
    this.destroyed = true
    this.emit('destroy')

    this.stopAllMotions()
  }

  /**
   * Checks if the motion playback has finished.
   */
  abstract isFinished(): boolean

  /**
   * Retrieves the motion's name by its definition.
   * @return The motion's name.
   */
  protected abstract getMotionName(definition: MotionSpec): string

  /**
   * Starts the Motion.
   */
  protected abstract _startMotion(
    motion: Motion,
    onFinish?: (motion: Motion) => void,
    ignoreParamIds?: string[],
    loop?: boolean
  ): number

  /**
   * Stops all playing motions.
   */
  protected abstract _stopAllMotions(): void

  /**
   * Updates parameters of the core model.
   * @param model - The core model.
   * @param now - Current time in milliseconds.
   * @return True if the parameters have been actually updated.
   */
  protected abstract updateParameters(model: object, now: DOMHighResTimeStamp): boolean

  abstract playMotionLastFrame(group: string, index: number): Promise<boolean>
}
