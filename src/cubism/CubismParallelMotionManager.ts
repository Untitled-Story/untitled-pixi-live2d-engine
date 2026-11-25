// noinspection DuplicatedCode

import { ParallelMotionManager } from '@/cubism-common/ParallelMotionManager'
import type { CubismModelSettings } from '@/cubism/CubismModelSettings'
import type * as CubismSpec from '@cubism/CubismSpec'
import type { CubismModel } from '@cubism/model/cubismmodel'
import type { ACubismMotion } from '@cubism/motion/acubismmotion'
import type { CubismMotion } from '@cubism/motion/cubismmotion'
import { CubismMotionQueueManager } from '@cubism/motion/cubismmotionqueuemanager'
import type { Mutable } from '@/types/helpers'
import { MotionPriority } from '@/cubism-common'
import type { CubismInternalModel } from '@/cubism/CubismInternalModel'
import { motionSkipToLastFrame } from '@/cubism/MotionSkipLastFrameHelper'
import { logger } from '@/utils'

export class CubismParallelMotionManager extends ParallelMotionManager<
  CubismMotion,
  CubismSpec.Motion
> {
  readonly queueManager = new CubismMotionQueueManager()

  declare readonly settings: CubismModelSettings

  constructor(parent: CubismInternalModel) {
    super(parent)

    this.init()
  }

  protected init() {
    this.queueManager.setEventCallback((_caller: unknown, eventValue: MotionEventValue) => {
      const value =
        typeof eventValue === 'string'
          ? eventValue
          : typeof eventValue === 'number'
            ? String(eventValue)
            : eventValue && typeof eventValue === 'object'
              ? eventValue.s
              : 'undefined'
      this.emit('motion:' + value)
    })
  }

  isFinished(): boolean {
    return this.queueManager.isFinished()
  }

  protected _startMotion(
    motion: CubismMotion,
    onFinish?: (motion: CubismMotion) => void,
    ignoreParamIds?: string[],
    loop?: boolean
  ): number {
    motion.setFinishedMotionHandler(onFinish as (motion: ACubismMotion) => void)
    motion.setLoop(loop ?? motion._motionData.loop)

    if (ignoreParamIds && ignoreParamIds.length > 0) {
      const filtered = motion._motionData.curves.filter(
        (curve) => !ignoreParamIds.includes(curve.id.getString())
      )

      motion._motionData.curves = filtered
      motion._motionData.curveCount = filtered.length
    }

    this.queueManager.stopAllMotions()
    return this.queueManager.startMotion(motion, false) as number
  }

  protected _stopAllMotions(): void {
    this.queueManager.stopAllMotions()
  }

  protected updateParameters(model: CubismModel, now: DOMHighResTimeStamp): boolean {
    return this.queueManager.doUpdateMotion(model, now)
  }

  protected getMotionName(definition: CubismSpec.Motion): string {
    return definition.File
  }

  destroy() {
    super.destroy()

    this.queueManager.release()
    ;(this as Partial<Mutable<this>>).queueManager = undefined
  }

  async playMotionLastFrame(group: string, index: number): Promise<boolean> {
    if (!this.state.reserve(group, index, MotionPriority.FORCE)) {
      return false
    }

    const definition = this.manager.definitions[group]?.[index]
    if (!definition) {
      return false
    }

    const motion = (await this.manager.loadMotion(group, index)) as CubismMotion
    if (!this.state.start(motion, group, index, MotionPriority.FORCE)) {
      return false
    }

    logger.log(this.tag, 'Start motion:', this.getMotionName(definition as CubismSpec.Motion))

    this.emit('motionStart', group, index, undefined)

    this.playing = true

    this.queueManager.stopAllMotions()

    if (!motionSkipToLastFrame(this.queueManager, this.parent as CubismInternalModel, motion)) {
      this.playing = false
      return false
    }
    this.playing = false

    return true
  }
}

type MotionEventValue = { s: string } | string | number | undefined
