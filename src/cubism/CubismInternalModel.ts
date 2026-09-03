import type { InternalModelOptions } from '@/cubism-common'
import type { CommonHitArea, CommonLayout } from '@/cubism-common/InternalModel'
import { InternalModel, normalizeHitAreaDefs } from '@/cubism-common/InternalModel'
import { setupCubismLayoutMatrix } from '@/cubism-common/layout'
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
import { Matrix } from 'pixi.js'
import type { Mutable } from '@/types/helpers'
import { clamp } from '@/utils'

const tempMatrix = new CubismMatrix44()
const DEFAULT_MASKS_PER_RENDER_TEXTURE = 36
const MASKS_PER_RENDER_TEXTURE = 32
const HIGH_PRECISION_MASK_UNIQUE_MASK_SET_THRESHOLD = 16
const HIGH_PRECISION_MASK_MASKED_DRAWABLE_THRESHOLD = 64
const HIGH_PRECISION_MASK_MAX_MASKS_PER_DRAWABLE_THRESHOLD = 3
const HIGH_PRECISION_MASK_MASKED_VERTEX_THRESHOLD = 4096
const HIGH_PRECISION_MASK_VERTEX_RATIO_THRESHOLD = 0.5
const HIGH_PRECISION_MASK_VERTEX_RATIO_DRAWABLE_THRESHOLD = 24

type MaskProfile = {
  maskedDrawableCount: number
  uniqueMaskSetCount: number
  maxMasksPerDrawable: number
  maskedVertexCount: number
  totalVertexCount: number
}

const layoutKeyMap: Record<string, keyof CommonLayout> = {
  CenterX: 'centerX',
  centerX: 'centerX',
  center_x: 'centerX',
  CenterY: 'centerY',
  centerY: 'centerY',
  center_y: 'centerY',
  X: 'x',
  x: 'x',
  Y: 'y',
  y: 'y',
  Width: 'width',
  width: 'width',
  Height: 'height',
  height: 'height',
  Top: 'top',
  top: 'top',
  Bottom: 'bottom',
  bottom: 'bottom',
  Left: 'left',
  left: 'left',
  Right: 'right',
  right: 'right'
}

function getRequiredMaskRenderTextureCount(model: CubismModel): number {
  if (!model.isUsingMasking()) {
    return 1
  }

  const maskCounts = model.getDrawableMaskCounts()
  const masks = model.getDrawableMasks()
  const uniqueMaskSets = new Set<string>()

  for (let i = 0; i < model.getDrawableCount(); i++) {
    const maskCount = maskCounts[i]

    if (!maskCount || maskCount <= 0) {
      continue
    }

    const maskSet = Array.from(masks[i] ?? [])
      .slice(0, maskCount)
      .sort((a, b) => a - b)
      .join(',')

    uniqueMaskSets.add(maskSet)
  }

  const clippingContextCount = uniqueMaskSets.size

  if (clippingContextCount <= DEFAULT_MASKS_PER_RENDER_TEXTURE) {
    return 1
  }

  return Math.ceil(clippingContextCount / MASKS_PER_RENDER_TEXTURE)
}

function getMaskProfile(model: CubismModel): MaskProfile {
  const maskCounts = model.getDrawableMaskCounts()
  const masks = model.getDrawableMasks()
  const uniqueMaskSets = new Set<string>()
  const drawableCount = model.getDrawableCount()

  let maskedDrawableCount = 0
  let maxMasksPerDrawable = 0
  let maskedVertexCount = 0
  let totalVertexCount = 0

  for (let i = 0; i < drawableCount; i++) {
    const vertexCount = model.getDrawableVertexCount(i)
    const maskCount = maskCounts[i] ?? 0

    totalVertexCount += vertexCount

    if (maskCount <= 0) {
      continue
    }

    maskedDrawableCount++
    maskedVertexCount += vertexCount
    maxMasksPerDrawable = Math.max(maxMasksPerDrawable, maskCount)

    const maskSet = Array.from(masks[i] ?? [])
      .slice(0, maskCount)
      .sort((a, b) => a - b)
      .join(',')

    uniqueMaskSets.add(maskSet)
  }

  return {
    maskedDrawableCount,
    uniqueMaskSetCount: uniqueMaskSets.size,
    maxMasksPerDrawable,
    maskedVertexCount,
    totalVertexCount
  }
}

function shouldUseHighPrecisionMask(model: CubismModel): boolean {
  if (!model.isUsingMasking()) {
    return false
  }

  const profile = getMaskProfile(model)
  const maskedVertexRatio =
    profile.totalVertexCount > 0 ? profile.maskedVertexCount / profile.totalVertexCount : 0

  return (
    profile.uniqueMaskSetCount > HIGH_PRECISION_MASK_UNIQUE_MASK_SET_THRESHOLD ||
    profile.maskedDrawableCount > HIGH_PRECISION_MASK_MASKED_DRAWABLE_THRESHOLD ||
    profile.maxMasksPerDrawable >= HIGH_PRECISION_MASK_MAX_MASKS_PER_DRAWABLE_THRESHOLD ||
    profile.maskedVertexCount > HIGH_PRECISION_MASK_MASKED_VERTEX_THRESHOLD ||
    (maskedVertexRatio >= HIGH_PRECISION_MASK_VERTEX_RATIO_THRESHOLD &&
      profile.maskedDrawableCount > HIGH_PRECISION_MASK_VERTEX_RATIO_DRAWABLE_THRESHOLD)
  )
}

function resolveHighPrecisionMaskOption(
  model: CubismModel,
  option: InternalModelOptions['useHighPrecisionMask']
): boolean {
  if (typeof option === 'boolean') {
    return option
  }

  return shouldUseHighPrecisionMask(model)
}

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

    if (this.options.eyeBlink !== false && eyeBlinkParameters.length) {
      const parameterIds = new csmVector<CubismIdHandle>()
      for (const parameter of eyeBlinkParameters) {
        parameterIds.pushBack(this.idManager.getId(parameter))
      }

      const eyeBlink = CubismEyeBlink.create()
      eyeBlink.setParameterIds?.(parameterIds)
      this.eyeBlink = eyeBlink
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

    this.renderer.initialize(this.coreModel, getRequiredMaskRenderTextureCount(this.coreModel))
    this.renderer.useHighPrecisionMask(
      resolveHighPrecisionMaskOption(this.coreModel, this.options.useHighPrecisionMask)
    )
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
      for (const [key, value] of Object.entries(settingsLayout)) {
        const commonKey = layoutKeyMap[key]

        if (commonKey && typeof value === 'number') {
          layout[commonKey] = value
        }
      }
    }

    return layout
  }

  protected setupLayout() {
    const self = this as Mutable<this>
    const size = this.getSize()

    self.originalWidth = size[0]
    self.originalHeight = size[1]
    self.pixelsPerUnit = this.coreModel.getModel().canvasinfo.PixelsPerUnit

    const bounds = setupCubismLayoutMatrix(
      this.localTransform,
      this.originalWidth,
      this.originalHeight,
      this.getLayout()
    )

    self.width = bounds.width
    self.height = bounds.height

    // move the origin from top left to center
    this.modelTransform
      .identity()
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
    const previousCullFaceMode = gl.getParameter(gl.CULL_FACE_MODE) as GLenum
    const determinant = array[0] * array[5] - array[1] * array[4]

    // Cubism always treats CCW triangles as front-facing. Keep the visible face consistent
    // when Pixi flips the projection for render textures, filters, or mirrored transforms.
    gl.cullFace(determinant < 0 ? gl.FRONT : gl.BACK)
    this.renderer.setRenderState(framebuffer, this.viewport)

    try {
      this.renderer.drawModel()
    } finally {
      gl.cullFace(previousCullFaceMode)
    }
  }

  extendParallelMotionManager(managerCount: number) {
    while (this.parallelMotionManager.length < managerCount) {
      this.parallelMotionManager.push(new CubismParallelMotionManager(this))
    }
  }

  destroy() {
    super.destroy()

    this.renderer.release()
    ;(this as Partial<this>).renderer = undefined
    ;(this as Partial<this>).coreModel = undefined
  }
}
