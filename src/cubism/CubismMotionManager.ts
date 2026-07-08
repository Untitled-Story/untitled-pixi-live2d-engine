// noinspection DuplicatedCode

import { config } from '@/config'
import type { MotionManagerOptions } from '@/cubism-common/MotionManager'
import { MotionManager } from '@/cubism-common/MotionManager'
import { CubismExpressionManager } from '@/cubism/CubismExpressionManager'
import type { CubismModelSettings } from '@/cubism/CubismModelSettings'
import type * as CubismSpec from '@cubism/CubismSpec'
import type { CubismModel } from '@cubism/model/cubismmodel'
import type { ACubismMotion } from '@cubism/motion/acubismmotion'
import { CubismMotion } from '@cubism/motion/cubismmotion'
import { CubismMotionJson } from '@cubism/motion/cubismmotionjson'
import { CubismMotionQueueManager } from '@cubism/motion/cubismmotionqueuemanager'
import type { Mutable } from '@/types/helpers'
import { motionSkipToLastFrame } from '@/cubism/MotionSkipLastFrameHelper'
import type { CubismInternalModel } from '@/cubism/CubismInternalModel'
import { csmVector } from '@cubism/type/csmvector'
import { CubismFramework } from '@cubism/live2dcubismframework'
import type { CubismIdHandle } from '@cubism/id/cubismid'

export class CubismMotionManager extends MotionManager<CubismMotion, CubismSpec.Motion> {
  readonly definitions: Partial<Record<string, CubismSpec.Motion[]>>

  readonly groups = { idle: 'Idle' } as const

  readonly motionDataType = 'arraybuffer'

  readonly queueManager = new CubismMotionQueueManager()

  declare readonly settings: CubismModelSettings

  expressionManager?: CubismExpressionManager

  eyeBlinkIds: string[]
  lipSyncIds = ['ParamMouthOpenY']

  constructor(parent: CubismInternalModel) {
    super(parent)

    this.definitions = parent.settings.motions ?? {}
    this.eyeBlinkIds = parent.settings.getEyeBlinkParameters() || []

    const lipSyncIds = parent.settings.getLipSyncParameters()

    if (lipSyncIds?.length) {
      this.lipSyncIds = lipSyncIds
    }
    this.init(parent.options)
  }

  protected init(options?: MotionManagerOptions) {
    super.init(options)

    if (this.settings.expressions) {
      this.expressionManager = new CubismExpressionManager(this.settings, options)
    }

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

  createMotion(data: ArrayBuffer, group: string, definition: CubismSpec.Motion): CubismMotion {
    const shouldCheckMotionConsistency = !!this.parent.options.checkMotionConsistency
    const motion = CubismMotion.create(
      data,
      data.byteLength,
      undefined,
      undefined,
      shouldCheckMotionConsistency
    )
    const json = new CubismMotionJson(data, data.byteLength)

    motion.setLoop(json.isMotionLoop())

    const defaultFadingDuration =
      (group === this.groups.idle ? config.idleMotionFadingDuration : config.motionFadingDuration) /
      1000

    // fading duration priorities: model.json > motion.json > config (default)

    // overwrite the fading duration only when it's not defined in the motion JSON
    if (json.getMotionFadeInTime() === undefined) {
      motion.setFadeInTime(
        definition.FadeInTime! > 0 ? definition.FadeInTime! : defaultFadingDuration
      )
    }

    if (json.getMotionFadeOutTime() === undefined) {
      motion.setFadeOutTime(
        definition.FadeOutTime! > 0 ? definition.FadeOutTime! : defaultFadingDuration
      )
    }

    motion.setEffectIds(this.createIdVector(this.eyeBlinkIds), this.createIdVector(this.lipSyncIds))

    return motion
  }

  getMotionFile(definition: CubismSpec.Motion): string {
    return definition.File
  }

  protected getMotionName(definition: CubismSpec.Motion): string {
    return definition.File
  }

  protected getSoundFile(definition: CubismSpec.Motion): string | undefined {
    return definition.Sound
  }

  protected updateParameters(model: CubismModel, now: DOMHighResTimeStamp): boolean {
    return this.queueManager.doUpdateMotion(model, now)
  }

  destroy() {
    super.destroy()

    this.queueManager.release()
    ;(this as Partial<Mutable<this>>).queueManager = undefined
  }

  async motionLastFrame(
    group: string,
    index: number,
    {
      expression = undefined
    }: {
      expression?: number | string
    } = {}
  ): Promise<boolean> {
    const motion = await this.getMotionAndApplyExpression(group, index, expression)

    if (!motion) {
      return false
    }

    this.playing = true

    motionSkipToLastFrame(
      this.queueManager,
      this.parent as CubismInternalModel,
      motion as CubismMotion
    )

    this.playing = false
    return true
  }

  private createIdVector(ids: string[]): csmVector<CubismIdHandle> {
    const vector = new csmVector<CubismIdHandle>()
    const idManager = CubismFramework.getIdManager()

    for (const id of ids) {
      vector.pushBack(idManager.getId(id))
    }

    return vector
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
