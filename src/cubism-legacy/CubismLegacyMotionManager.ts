// noinspection DuplicatedCode

import { config } from '@/config'
import type { MotionManagerOptions } from '@/cubism-common/MotionManager'
import { MotionManager } from '@/cubism-common/MotionManager'
import { CubismLegacyExpressionManager } from '@/cubism-legacy/CubismLegacyExpressionManager'
import type { CubismLegacyModelSettings } from '@/cubism-legacy/CubismLegacyModelSettings'
import type { Cubism2Spec } from '@/types/Cubism2Spec'
import type { Mutable } from '@/types/helpers'
import './patch-motion'
import type { CubismLegacyInternalModel } from '@/cubism-legacy/CubismLegacyInternalModel'

export class CubismLegacyMotionManager extends MotionManager<Live2DMotion, Cubism2Spec.Motion> {
  readonly definitions: Partial<Record<string, Cubism2Spec.Motion[]>>

  readonly groups = { idle: 'idle' } as const

  readonly motionDataType = 'arraybuffer'

  readonly queueManager = new MotionQueueManager()

  readonly lipSyncIds: string[]

  declare readonly settings: CubismLegacyModelSettings

  expressionManager?: CubismLegacyExpressionManager

  constructor(parent: CubismLegacyInternalModel) {
    super(parent)

    this.definitions = this.settings.motions

    this.init(parent.options)

    this.lipSyncIds = ['PARAM_MOUTH_OPEN_Y']
  }

  protected init(options?: MotionManagerOptions) {
    super.init(options)

    if (this.settings.expressions) {
      this.expressionManager = new CubismLegacyExpressionManager(this.settings, options)
    }
  }

  isFinished(): boolean {
    return this.queueManager.isFinished()
  }

  createMotion(data: ArrayBuffer, group: string, definition: Cubism2Spec.Motion): Live2DMotion {
    const motion = Live2DMotion.loadMotion(data)

    const defaultFadingDuration =
      group === this.groups.idle ? config.idleMotionFadingDuration : config.motionFadingDuration

    motion.setFadeIn(definition.fade_in! > 0 ? definition.fade_in! : defaultFadingDuration)
    motion.setFadeOut(definition.fade_out! > 0 ? definition.fade_out! : defaultFadingDuration)

    return motion
  }

  getMotionFile(definition: Cubism2Spec.Motion): string {
    return definition.file
  }

  protected getMotionName(definition: Cubism2Spec.Motion): string {
    return definition.file
  }

  protected getSoundFile(definition: Cubism2Spec.Motion): string | undefined {
    return definition.sound
  }

  protected _startMotion(
    motion: Live2DMotion,
    onFinish?: (motion: Live2DMotion) => void,
    ignoreParamIds?: string[],
    _loop?: boolean
  ): number {
    motion.onFinishHandler = onFinish

    if (ignoreParamIds && ignoreParamIds.length > 0) {
      motion.motions = motion.motions.filter((item) => {
        return !ignoreParamIds.includes(item._$4P)
      })
    }

    this.queueManager.stopAllMotions()

    return this.queueManager.startMotion(motion)
  }

  protected applyMotionAtTime(motion: Live2DMotion, time: number | 'end'): void {
    const queue = new MotionQueueManager()
    const handle = queue.startMotion(motion)
    const entry = queue.motions.find((item) => item && item._$sr === handle)
    if (!entry) throw new Error('Unable to create a Cubism 2 motion entry.')
    const duration = motion.getDurationMSec()
    const milliseconds = time === 'end' ? duration : Math.min(time * 1000, duration)
    try {
      motion.updateParamExe(this.parent.coreModel as Live2DModelWebGL, milliseconds, 1, entry)
    } finally {
      queue.stopAllMotions()
    }
  }

  protected _stopAllMotions(): void {
    this.queueManager.stopAllMotions()
  }

  protected updateParameters(model: Live2DModelWebGL, _now: DOMHighResTimeStamp): boolean {
    return this.queueManager.updateParam(model)
  }

  destroy() {
    super.destroy()
    ;(this as Partial<Mutable<this>>).queueManager = undefined
  }
}
