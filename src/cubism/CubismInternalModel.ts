import type { InternalModelOptions } from '@/cubism-common'
import type { CommonHitArea, CommonLayout } from '@/cubism-common/InternalModel'
import { InternalModel, normalizeHitAreaDefs } from '@/cubism-common/InternalModel'
import type { CubismModelSettings } from '@/cubism/CubismModelSettings'
import { CubismMotionManager } from '@/cubism/CubismMotionManager'
import { CubismParallelMotionManager } from '@/cubism/CubismParallelMotionManager'
import { CubismDefaultParameterId } from '@cubism/cubismdefaultparameterid'
import { BreathParameterData, CubismBreath } from '@cubism/effect/cubismbreath'
import { CubismEyeBlink } from '@cubism/effect/cubismeyeblink'
import type { CubismPose } from '@cubism/effect/cubismpose'
import { CubismFramework } from '@cubism/live2dcubismframework'
import { CubismMatrix44 } from '@cubism/math/cubismmatrix44'
import type { CubismModel } from '@cubism/model/cubismmodel'
import type { CubismPhysics } from '@cubism/physics/cubismphysics'
import { CubismRenderer_WebGL } from '@cubism/rendering/cubismrenderer_webgl'
import { CubismShaderManager_WebGL } from '@cubism/rendering/cubismshader_webgl'
import { csmVector } from '@cubism/type/csmvector'
import type { CubismIdManager } from '@cubism/id/cubismidmanager'
import type { CubismIdHandle } from '@cubism/id/cubismid'
import type { ICubismModelSetting } from '@cubism/icubismmodelsetting'
import { Matrix } from 'pixi.js'
import type { Mutable } from '@/types/helpers'
import { clamp } from '@/utils'

const tempMatrix = new CubismMatrix44()

// noinspection JSUnusedGlobalSymbols
export class CubismInternalModel extends InternalModel {
  settings: CubismModelSettings
  options: InternalModelOptions
  coreModel: CubismModel
  motionManager: CubismMotionManager
  parallelMotionManager: CubismParallelMotionManager[]

  lipSync = true

  breath = CubismBreath.create()
  eyeBlink?: CubismEyeBlink

  declare pose?: CubismPose
  declare physics?: CubismPhysics

  renderer = new CubismRenderer_WebGL()

  private readonly idManager: CubismIdManager

  idParamAngleX: CubismIdHandle
  idParamAngleY: CubismIdHandle
  idParamAngleZ: CubismIdHandle
  idParamEyeBallX: CubismIdHandle
  idParamEyeBallY: CubismIdHandle
  idParamBodyAngleX: CubismIdHandle
  idParamBreath: CubismIdHandle
  idParamMouthForm: CubismIdHandle

  /**
   * The model's internal scale, defined in the moc3 file.
   */
  readonly pixelsPerUnit: number = 1

  /**
   * Matrix that scales by {@link pixelsPerUnit}, and moves the origin from top-left to center.
   */
  protected modelTransform = new Matrix()

  constructor(
    coreModel: CubismModel,
    settings: CubismModelSettings,
    options?: InternalModelOptions
  ) {
    super()

    this.coreModel = coreModel
    this.settings = settings
    this.options = Object.assign(
      {},
      { breathDepth: 1, lipSyncGain: 1.5, lipSyncWeight: 0.4 },
      options
    )
    this.idManager = CubismFramework.getIdManager()

    this.idParamAngleX = this.getIdSafe(CubismDefaultParameterId.ParamAngleX)
    this.idParamAngleY = this.getIdSafe(CubismDefaultParameterId.ParamAngleY)
    this.idParamAngleZ = this.getIdSafe(CubismDefaultParameterId.ParamAngleZ)
    this.idParamEyeBallX = this.getIdSafe(CubismDefaultParameterId.ParamEyeBallX)
    this.idParamEyeBallY = this.getIdSafe(CubismDefaultParameterId.ParamEyeBallY)
    this.idParamBodyAngleX = this.getIdSafe(CubismDefaultParameterId.ParamBodyAngleX)
    this.idParamBreath = this.getIdSafe(CubismDefaultParameterId.ParamBreath)
    this.idParamMouthForm = this.getIdSafe(CubismDefaultParameterId.ParamMouthForm)
    this.motionManager = new CubismMotionManager(this)
    this.parallelMotionManager = []

    this.init()
  }

  protected init() {
    super.init()

    const eyeBlinkParameters = this.settings.getEyeBlinkParameters()

    if (eyeBlinkParameters.length) {
      if (this.isCubismModelSetting(this.settings)) {
        this.eyeBlink = CubismEyeBlink.create(this.settings)
      } else {
        // fallback when CubismModelSettingJson mixin isn't present
        const parameterIds = new csmVector<CubismIdHandle>()
        for (const parameter of eyeBlinkParameters) {
          parameterIds.pushBack(this.idManager.getId(parameter))
        }

        const eyeBlink = CubismEyeBlink.create()
        eyeBlink.setParameterIds?.(parameterIds)
        this.eyeBlink = eyeBlink
      }
    }
    const breathParams = new csmVector<BreathParameterData>()
    breathParams.pushBack(
      new BreathParameterData(
        this.idParamAngleX,
        0.0,
        15.0 * this.options.breathDepth!,
        6.5345,
        0.5
      )
    )
    breathParams.pushBack(
      new BreathParameterData(this.idParamAngleY, 0.0, 8.0 * this.options.breathDepth!, 3.5345, 0.5)
    )
    breathParams.pushBack(
      new BreathParameterData(
        this.idParamAngleZ,
        0.0,
        10.0 * this.options.breathDepth!,
        5.5345,
        0.5
      )
    )
    breathParams.pushBack(
      new BreathParameterData(
        this.idParamBodyAngleX,
        0.0,
        4.0 * this.options.breathDepth!,
        15.5345,
        0.5
      )
    )
    breathParams.pushBack(new BreathParameterData(this.idParamBreath, 0.0, 0.5, 3.2345, 0.5))

    this.breath.setParameters(breathParams)

    this.renderer.initialize(this.coreModel)
    this.renderer.setIsPremultipliedAlpha(true)
  }

  protected getIdSafe(id: string | undefined): CubismIdHandle {
    return this.idManager.getId(id ?? '')
  }

  protected getSize(): [number, number] {
    return [
      this.coreModel.getModel().canvasinfo.CanvasWidth,
      this.coreModel.getModel().canvasinfo.CanvasHeight
    ]
  }

  protected getLayout(): CommonLayout {
    const layout: CommonLayout = {}

    const settingsLayout = this.settings.layout

    if (settingsLayout) {
      // un-capitalize each key to satisfy the common layout format
      // e.g. CenterX -> centerX
      for (const [key, value] of Object.entries(settingsLayout)) {
        const commonKey = key.charAt(0).toLowerCase() + key.slice(1)

        layout[commonKey as keyof CommonLayout] = value
      }
    }

    return layout
  }

  protected setupLayout() {
    super.setupLayout()
    ;(this as Mutable<this>).pixelsPerUnit = this.coreModel.getModel().canvasinfo.PixelsPerUnit

    // move the origin from top left to center
    this.modelTransform
      .scale(this.pixelsPerUnit, this.pixelsPerUnit)
      .translate(this.originalWidth / 2, this.originalHeight / 2)
  }

  updateWebGLContext(gl: WebGLRenderingContext, glContextID: number): void {
    // reset resources that were bound to previous WebGL context
    this.renderer.firstDraw = true
    this.renderer._bufferData = {
      vertex: null as unknown as WebGLBuffer,
      uv: null as unknown as WebGLBuffer,
      index: null as unknown as WebGLBuffer
    }
    this.renderer.startUp(gl)
    // null when the model not using mask
    if (this.renderer._clippingManager) {
      this.renderer._clippingManager._currentFrameNo = glContextID
    }
    CubismShaderManager_WebGL.getInstance().setGlContext(gl)
  }

  bindTexture(index: number, texture: WebGLTexture): void {
    this.renderer.bindTexture(index, texture)
  }

  protected getHitAreaDefs(): CommonHitArea[] {
    const json = this.settings.json as unknown as Record<string, unknown>
    const hitAreas =
      (this.settings.hitAreas as { Id?: string; Name?: string }[] | undefined) ??
      json.HitAreas ??
      json.hitAreas ??
      json.hit_areas

    return normalizeHitAreaDefs(hitAreas, (id) =>
      this.coreModel.getDrawableIndex(this.idManager.getId(id))
    )
  }

  getDrawableIDs(): string[] {
    const count = this.coreModel.getDrawableCount()
    const ids: string[] = []

    for (let i = 0; i < count; i++) {
      ids.push(this.coreModel.getDrawableId(i).getString().s)
    }

    return ids
  }

  getDrawableIndex(id: string): number {
    return this.coreModel.getDrawableIndex(this.idManager.getId(id))
  }

  getDrawableVertices(drawIndex: number | string): Float32Array {
    if (typeof drawIndex === 'string') {
      const id = drawIndex
      drawIndex = this.getDrawableIndex(id)

      if (drawIndex === -1) throw new TypeError('Unable to find drawable ID: ' + id)
    }

    const arr = this.coreModel.getDrawableVertices(drawIndex).slice()

    for (let i = 0; i < arr.length; i += 2) {
      arr[i] = arr[i]! * this.pixelsPerUnit + this.originalWidth / 2
      arr[i + 1] = -arr[i + 1]! * this.pixelsPerUnit + this.originalHeight / 2
    }

    return arr
  }

  updateTransform(transform: Matrix) {
    this.drawingMatrix.copyFrom(this.modelTransform).prepend(this.localTransform).prepend(transform)
  }

  public update(dt: DOMHighResTimeStamp, now: DOMHighResTimeStamp): void {
    super.update(dt, now)

    // Cubism motion timelines use seconds
    dt /= 1000
    now /= 1000

    const model = this.coreModel

    const motionUpdated = this.updateMotions(model, now)

    model.saveParameters()

    this.motionManager.expressionManager?.update(model, now)

    if (!motionUpdated) {
      this.eyeBlink?.updateParameters?.(model, dt)
    }

    this.updateFocus()

    // revert the timestamps to be milliseconds
    this.updateNaturalMovements(dt * 1000, now * 1000)

    if (this.lipSync && this.motionManager.currentAudio) {
      let value = this.motionManager.mouthSync() * this.options.lipSyncGain!
      value = Math.pow(value, 1.15)
      const min_ = value > 0 ? 0.1 : 0
      const max_ = 1
      value = clamp(value, min_, max_)
      this.motionManager.lipSyncIds.forEach((lipSyncId) => {
        model.addParameterValueById(this.getIdSafe(lipSyncId), value, this.options.lipSyncWeight)
      })
    }

    this.physics?.evaluate(model, dt)
    this.pose?.updateParameters(model, dt)

    this.emit('beforeModelUpdate')

    model.update()
    model.loadParameters()
  }

  updateFocus() {
    this.coreModel.addParameterValueById(this.idParamEyeBallX, this.focusController.x) // -1 ~ 1
    this.coreModel.addParameterValueById(this.idParamEyeBallY, this.focusController.y)
    this.coreModel.addParameterValueById(this.idParamAngleX, this.focusController.x * 30) // -30 ~ 30
    this.coreModel.addParameterValueById(this.idParamAngleY, this.focusController.y * 30)
    this.coreModel.addParameterValueById(
      this.idParamAngleZ,
      this.focusController.x * this.focusController.y * -30
    )
    this.coreModel.addParameterValueById(this.idParamBodyAngleX, this.focusController.x * 10) // -10 ~ 10
  }

  updateFacialEmotion(mouthForm: number) {
    this.coreModel.addParameterValueById(this.idParamMouthForm, mouthForm) // -1 ~ 1
  }

  updateNaturalMovements(dt: DOMHighResTimeStamp, _now: DOMHighResTimeStamp) {
    this.breath?.updateParameters(this.coreModel, dt / 1000)
  }

  draw(gl: WebGLRenderingContext): void {
    const matrix = this.drawingMatrix
    const array = tempMatrix.getArray()

    // set given 3x3 matrix into a 4x4 matrix, with Y inverted
    array[0] = matrix.a
    array[1] = matrix.b
    array[4] = -matrix.c
    array[5] = -matrix.d
    array[12] = matrix.tx
    array[13] = matrix.ty

    this.renderer.setMvpMatrix(tempMatrix)
    const framebuffer = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer
    this.renderer.setRenderState(framebuffer, this.viewport)
    this.renderer.drawModel()
  }

  extendParallelMotionManager(managerCount: number) {
    while (this.parallelMotionManager.length < managerCount) {
      this.parallelMotionManager.push(new CubismParallelMotionManager(this))
    }
  }

  destroy() {
    super.destroy()

    this.renderer.release()
    this.coreModel.release()
    ;(this as Partial<this>).renderer = undefined
    ;(this as Partial<this>).coreModel = undefined
  }

  private isCubismModelSetting(
    settings: CubismModelSettings
  ): settings is CubismModelSettings & ICubismModelSetting {
    return (
      typeof (settings as unknown as ICubismModelSetting).getEyeBlinkParameterCount ===
        'function' &&
      typeof (settings as unknown as ICubismModelSetting).getEyeBlinkParameterId === 'function'
    )
  }
}
