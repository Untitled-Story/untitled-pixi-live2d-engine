import type { InternalModelOptions } from '@/cubism-common'
import type { CommonHitArea, CommonLayout } from '@/cubism-common/InternalModel'
import { InternalModel, normalizeHitAreaDefs } from '@/cubism-common/InternalModel'
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from '@/cubism-common/constants'
import { clamp, logger } from '@/utils'
import type { CubismLegacyModelSettings } from './CubismLegacyModelSettings'
import { CubismLegacyMotionManager } from './CubismLegacyMotionManager'
import { CubismLegacyParallelMotionManager } from './CubismLegacyParallelMotionManager'
import { Live2DEyeBlink } from './Live2DEyeBlink'
import type { Live2DPhysics } from './Live2DPhysics'
import type { Live2DPose } from './Live2DPose'

// prettier-ignore
const tempMatrixArray = new Float32Array([
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1
])

type CustomHitAreaBounds = {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

export class CubismLegacyInternalModel extends InternalModel {
  settings: CubismLegacyModelSettings
  options: InternalModelOptions

  coreModel: Live2DModelWebGL
  motionManager: CubismLegacyMotionManager
  parallelMotionManager: CubismLegacyParallelMotionManager[]

  eyeBlink?: Live2DEyeBlink

  declare physics?: Live2DPhysics
  declare pose?: Live2DPose

  // parameter indices, cached for better performance
  eyeballXParamIndex: number
  eyeballYParamIndex: number
  angleXParamIndex: number
  angleYParamIndex: number
  angleZParamIndex: number
  bodyAngleXParamIndex: number
  breathParamIndex: number
  // mouthFormIndex: number;

  textureFlipY = true

  lipSync = true

  /**
   * Number of the drawables in this model.
   */
  drawDataCount = 0

  /**
   * If true, the face culling will always be disabled when drawing the model,
   * regardless of the model's internal flags.
   */
  disableCulling = false
  private hasDrawn = false
  private customHitAreas?: Record<string, CustomHitAreaBounds> | null

  constructor(
    coreModel: Live2DModelWebGL,
    settings: CubismLegacyModelSettings,
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
    this.motionManager = new CubismLegacyMotionManager(this)
    this.parallelMotionManager = []
    this.eyeBlink = new Live2DEyeBlink(coreModel)

    this.eyeballXParamIndex = coreModel.getParamIndex('PARAM_EYE_BALL_X')
    this.eyeballYParamIndex = coreModel.getParamIndex('PARAM_EYE_BALL_Y')
    this.angleXParamIndex = coreModel.getParamIndex('PARAM_ANGLE_X')
    this.angleYParamIndex = coreModel.getParamIndex('PARAM_ANGLE_Y')
    this.angleZParamIndex = coreModel.getParamIndex('PARAM_ANGLE_Z')
    this.bodyAngleXParamIndex = coreModel.getParamIndex('PARAM_BODY_ANGLE_X')
    this.breathParamIndex = coreModel.getParamIndex('PARAM_BREATH')
    // this.mouthFormIndex = coreModel.getParamIndex("PARAM_MOUTH_FORM");

    this.init()
  }

  protected init() {
    super.init()

    if (this.settings.initParams) {
      this.settings.initParams.forEach(({ id, value }) => this.coreModel.setParamFloat(id, value))
    }
    if (this.settings.initOpacities) {
      this.settings.initOpacities.forEach(({ id, value }) =>
        this.coreModel.setPartsOpacity(id, value)
      )
    }

    this.coreModel.saveParam()

    const arr = this.coreModel.getModelContext()._$aS

    if ((arr as unknown[])?.length) {
      this.drawDataCount = (arr as unknown[]).length
    }

    let culling = this.coreModel.drawParamWebGL.culling

    Object.defineProperty(this.coreModel.drawParamWebGL, 'culling', {
      set: (v: boolean) => (culling = v),

      // always return false when disabled
      get: () => (this.disableCulling ? false : culling)
    })

    const clipManager = this.coreModel.getModelContext().clipManager as unknown as {
      setupClip: (
        modelContext: unknown,
        drawParam: { gl: WebGLRenderingContext; [key: string]: unknown }
      ) => void
      curFrameNo: number
      getMaskRenderTexture: () => void
    }
    const originalSetupClip = clipManager.setupClip.bind(clipManager)

    // after setupClip(), the GL viewport will be set to [0, 0, canvas.width, canvas.height],
    // so we have to set it back
    clipManager.setupClip = (modelContext, drawParam) => {
      originalSetupClip.call(clipManager, modelContext, drawParam)

      drawParam.gl.viewport(...this.viewport)
    }
  }

  protected getSize(): [number, number] {
    return [this.coreModel.getCanvasWidth(), this.coreModel.getCanvasHeight()]
  }

  protected getLayout(): CommonLayout {
    const layout: CommonLayout = {}

    if (this.settings.layout) {
      for (const [key, value] of Object.entries(this.settings.layout)) {
        let commonKey = key

        if (key === 'center_x') {
          commonKey = 'centerX'
        } else if (key === 'center_y') {
          commonKey = 'centerY'
        }

        if (typeof value === 'number') {
          layout[commonKey as keyof CommonLayout] = value
        }
      }
    }

    return layout
  }

  updateWebGLContext(gl: WebGLRenderingContext, glContextID: number): void {
    const drawParamWebGL = this.coreModel.drawParamWebGL

    drawParamWebGL.firstDraw = true
    drawParamWebGL.setGL(gl)
    drawParamWebGL.glno = glContextID

    // Reset buffers
    drawParamWebGL._$NT = null
    drawParamWebGL._$no = null
    drawParamWebGL._$vS = null

    const clipManager = this.coreModel.getModelContext().clipManager
    clipManager.curFrameNo = glContextID

    const framebuffer = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer

    // force Live2D to re-create the framebuffer
    clipManager.getMaskRenderTexture()

    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
  }

  bindTexture(index: number, texture: WebGLTexture): void {
    this.coreModel.setTexture(index, texture)
  }

  protected getHitAreaDefs(): CommonHitArea[] {
    const json = this.settings.json as unknown as Record<string, unknown>
    const rawHitAreas = this.settings.hitAreas ?? json.hit_areas ?? json.HitAreas ?? json.hitAreas

    return normalizeHitAreaDefs(rawHitAreas, (id) => this.coreModel.getDrawDataIndex(id))
  }

  getDrawableIDs(): string[] {
    const modelContext = this.coreModel.getModelContext()
    const ids = []

    for (let i = 0; i < this.drawDataCount; i++) {
      const drawData = modelContext.getDrawData(i)

      if (drawData) {
        ids.push(drawData.getDrawDataID().id)
      }
    }

    return ids
  }

  getDrawableIndex(id: string): number {
    return this.coreModel.getDrawDataIndex(id)
  }

  getDrawableVertices(drawIndex: number | string): Float32Array {
    if (typeof drawIndex === 'string') {
      drawIndex = this.coreModel.getDrawDataIndex(drawIndex)

      if (drawIndex === -1) throw new TypeError('Unable to find drawable ID: ' + drawIndex)
    }

    return this.coreModel.getTransformedPoints(drawIndex).slice()
  }

  override hitTest(x: number, y: number): string[] {
    if (!this.hasDrawn) {
      logger.warn(
        'Trying to hit-test a Cubism 2 model that has not been rendered yet. Drawable hit areas may be empty until the first draw.'
      )
    }

    const drawableHits = super.hitTest(x, y)
    const customHits = this.hitTestCustom(x, y)

    if (!customHits.length) {
      return drawableHits
    }

    if (!drawableHits.length) {
      return customHits
    }

    return [...new Set([...drawableHits, ...customHits])]
  }

  update(dt: DOMHighResTimeStamp, now: DOMHighResTimeStamp): void {
    super.update(dt, now)

    const model = this.coreModel

    const motionUpdated = this.updateMotions(model, now)

    model.saveParam()

    this.motionManager.expressionManager?.update(model, now)

    if (!motionUpdated) {
      this.eyeBlink?.update(dt)
    }

    this.updateFocus()
    this.updateNaturalMovements(dt, now)

    if (this.lipSync && this.motionManager.currentAudio) {
      let value = this.motionManager.mouthSync() * this.options.lipSyncGain!
      const max_ = 1
      const min_ = value > 0 ? 0.1 : 0
      value = Math.pow(value, 1.15)
      value = clamp(value, min_, max_)

      for (let i = 0; i < this.motionManager.lipSyncIds.length; ++i) {
        this.coreModel.addToParamFloat(
          this.coreModel.getParamIndex(this.motionManager.lipSyncIds[i]!),
          value,
          this.options.lipSyncWeight
        )
      }
    }

    this.physics?.update(now)
    this.pose?.update(dt)

    this.emit('beforeModelUpdate')

    model.update()
    model.loadParam()
  }

  updateFocus() {
    this.coreModel.addToParamFloat(this.eyeballXParamIndex, this.focusController.x)
    this.coreModel.addToParamFloat(this.eyeballYParamIndex, this.focusController.y)
    this.coreModel.addToParamFloat(this.angleXParamIndex, this.focusController.x * 30)
    this.coreModel.addToParamFloat(this.angleYParamIndex, this.focusController.y * 30)
    this.coreModel.addToParamFloat(
      this.angleZParamIndex,
      this.focusController.x * this.focusController.y * -30
    )
    this.coreModel.addToParamFloat(this.bodyAngleXParamIndex, this.focusController.x * 10)
  }

  updateNaturalMovements(_dt: DOMHighResTimeStamp, now: DOMHighResTimeStamp) {
    const t = (now / 1000) * 2 * Math.PI

    this.coreModel.addToParamFloat(
      this.angleXParamIndex,
      15 * this.options.breathDepth! * Math.sin(t / 6.5345) * 0.5
    )
    this.coreModel.addToParamFloat(
      this.angleYParamIndex,
      8 * this.options.breathDepth! * Math.sin(t / 3.5345) * 0.5
    )
    this.coreModel.addToParamFloat(
      this.angleZParamIndex,
      10 * this.options.breathDepth! * Math.sin(t / 5.5345) * 0.5
    )
    this.coreModel.addToParamFloat(
      this.bodyAngleXParamIndex,
      4 * this.options.breathDepth! * Math.sin(t / 15.5345) * 0.5
    )

    this.coreModel.setParamFloat(this.breathParamIndex, 0.5 + 0.5 * Math.sin(t / 3.2345))
  }

  draw(gl: WebGLRenderingContext): void {
    const disableCulling = this.disableCulling

    // culling must be disabled to get this cubism2 model drawn properly on a framebuffer
    if (gl.getParameter(gl.FRAMEBUFFER_BINDING)) {
      this.disableCulling = true
    }

    const matrix = this.drawingMatrix

    // set given 3x3 matrix into a 4x4 matrix
    tempMatrixArray[0] = matrix.a
    tempMatrixArray[1] = matrix.b
    tempMatrixArray[4] = matrix.c
    tempMatrixArray[5] = matrix.d
    tempMatrixArray[12] = matrix.tx
    tempMatrixArray[13] = matrix.ty

    this.coreModel.setMatrix(tempMatrixArray)
    this.coreModel.draw()
    this.hasDrawn = true
    this.disableCulling = disableCulling
  }

  extendParallelMotionManager(managerCount: number) {
    while (this.parallelMotionManager.length < managerCount) {
      this.parallelMotionManager.push(new CubismLegacyParallelMotionManager(this))
    }
  }

  destroy() {
    super.destroy()

    // cubism2 core has a super dumb memory management so there's basically nothing much to do to release the model
    ;(this as Partial<this>).coreModel = undefined
  }

  private hitTestCustom(x: number, y: number): string[] {
    const areas = this.getCustomHitAreas()

    if (!areas) {
      return []
    }

    const width = this.originalWidth || this.width
    const height = this.originalHeight || this.height

    if (!width || !height) {
      return []
    }

    // Convert to logical coordinates used by hit_areas_custom.
    const logicalX = (x / width) * LOGICAL_WIDTH - LOGICAL_WIDTH / 2
    const logicalY = LOGICAL_HEIGHT / 2 - (y / height) * LOGICAL_HEIGHT

    const hits: string[] = []

    for (const [name, area] of Object.entries(areas)) {
      if (
        logicalX >= area.minX &&
        logicalX <= area.maxX &&
        logicalY >= area.minY &&
        logicalY <= area.maxY
      ) {
        hits.push(name)
      }
    }

    return hits
  }

  private getCustomHitAreas(): Record<string, CustomHitAreaBounds> | null {
    if (this.customHitAreas !== undefined) {
      return this.customHitAreas
    }

    const json = this.settings.json as unknown as Record<string, unknown>
    const raw =
      json.hit_areas_custom ?? json.hitAreasCustom ?? json.HitAreasCustom ?? json.HitAreas_Custom

    if (!raw || typeof raw !== 'object') {
      this.customHitAreas = null
      return null
    }

    const rawRecord = raw as Record<string, unknown>
    const areas: Record<string, CustomHitAreaBounds> = {}

    const addArea = (name: string, xRange: unknown, yRange: unknown) => {
      if (!name || !Array.isArray(xRange) || !Array.isArray(yRange)) {
        return
      }

      if (xRange.length < 2 || yRange.length < 2) {
        return
      }

      const x0 = Number(xRange[0])
      const x1 = Number(xRange[1])
      const y0 = Number(yRange[0])
      const y1 = Number(yRange[1])

      if (
        !Number.isFinite(x0) ||
        !Number.isFinite(x1) ||
        !Number.isFinite(y0) ||
        !Number.isFinite(y1)
      ) {
        return
      }

      areas[name] = {
        minX: Math.min(x0, x1),
        maxX: Math.max(x0, x1),
        minY: Math.min(y0, y1),
        maxY: Math.max(y0, y1)
      }
    }

    for (const [key, value] of Object.entries(rawRecord)) {
      if (key.endsWith('_x')) {
        const name = key.slice(0, -2)
        addArea(name, value, rawRecord[`${name}_y`])
        continue
      }

      if (key.endsWith('_y')) {
        continue
      }

      if (value && typeof value === 'object') {
        const record = value as Record<string, unknown>
        const xRange = record.x ?? record.X
        const yRange = record.y ?? record.Y
        addArea(key, xRange, yRange)
      }
    }

    this.customHitAreas = Object.keys(areas).length ? areas : null

    return this.customHitAreas
  }
}
