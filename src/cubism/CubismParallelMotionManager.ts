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
import { csmVector } from '@cubism/type/csmvector'

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
      const curves = motion._motionData.curves
      const filtered = createCurveContainer(curves)
      const total = getCurveCount(curves)

      for (let i = 0; i < total; i++) {
        const curve = getCurveAt(curves, i)
        if (!curve) {
          continue
        }
        const id = getCurveId(curve)

        if (!id || !ignoreParamIds.includes(id)) {
          addCurve(filtered, curve)
        }
      }

      motion._motionData.curves = filtered
      motion._motionData.curveCount = getCurveCount(filtered)
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
type CurveContainer<T> = csmVector<T> | T[]

function isVector<T>(curves: CurveContainer<T>): curves is csmVector<T> {
  return typeof (curves as csmVector<T>).pushBack === 'function'
}

function getCurveCount<T>(curves: CurveContainer<T>): number {
  return isVector(curves) ? curves.getSize() : curves.length
}

function getCurveAt<T>(curves: CurveContainer<T>, index: number): T | undefined {
  return isVector(curves) ? curves.at(index) : curves[index]
}

function getCurveId(curve: unknown): string | undefined {
  if (!curve || typeof curve !== 'object') {
    return undefined
  }

  const id = (curve as { id?: unknown }).id

  if (typeof id === 'string') {
    return id
  }

  if (id && typeof (id as { getString?: () => { s: string } }).getString === 'function') {
    return (id as { getString: () => { s: string } }).getString().s
  }

  return undefined
}

function createCurveContainer<T>(curves: csmVector<T>): csmVector<T>
function createCurveContainer<T>(curves: CurveContainer<T>): CurveContainer<T> {
  if (isVector(curves)) {
    return new csmVector<T>()
  }

  return []
}

function addCurve<T>(container: CurveContainer<T>, curve: T): void {
  if (isVector(container)) {
    container.pushBack(curve)
  } else {
    container.push(curve)
  }
}
