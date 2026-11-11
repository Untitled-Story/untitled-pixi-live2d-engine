// noinspection DuplicatedCode

import { ParallelMotionManager } from '@/cubism-common/ParallelMotionManager'
import type { Cubism2Spec } from '@/types/Cubism2Spec'
import type { Mutable } from '@/types/helpers'
import './patch-motion'
import type { CubismLegacyInternalModel } from '@/cubism-legacy/CubismLegacyInternalModel'

export class CubismLegacyParallelMotionManager extends ParallelMotionManager<
  Live2DMotion,
  Cubism2Spec.Motion
> {
  readonly queueManager = new MotionQueueManager()

  constructor(parent: CubismLegacyInternalModel) {
    super(parent)
  }

  isFinished(): boolean {
    return this.queueManager.isFinished()
  }

  protected getMotionName(definition: Cubism2Spec.Motion): string {
    return definition.file
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
