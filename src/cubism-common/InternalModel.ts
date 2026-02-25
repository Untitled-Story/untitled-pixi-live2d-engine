import { FocusController } from '@/cubism-common/FocusController'
import type { ModelSettings } from '@/cubism-common/ModelSettings'
import type { MotionManager, MotionManagerOptions } from '@/cubism-common/MotionManager'
import type { ParallelMotionManager } from '@/cubism-common/ParallelMotionManager'
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from '@/cubism-common/constants'
import { EventEmitter, Matrix } from 'pixi.js'
import type { Mutable } from '@/types/helpers'
import type { CubismMotion } from '@cubism/motion/cubismmotion'

/**
 * Common layout definition shared between all Cubism versions.
 */
export interface CommonLayout {
  centerX?: number
  centerY?: number
  x?: number
  y?: number
  width?: number
  height?: number
  top?: number
  bottom?: number
  left?: number
  right?: number
}

/**
 * Common hit area definition shared between all Cubism versions.
 */
export interface CommonHitArea {
  id: string
  name: string
  index: number
}

export function normalizeHitAreaDefs(
  raw: unknown,
  resolveIndex: (id: string) => number
): CommonHitArea[] {
  if (!Array.isArray(raw)) {
    return []
  }

  const defs: CommonHitArea[] = []

  for (const hitArea of raw) {
    if (!hitArea || typeof hitArea !== 'object') {
      continue
    }

    const record = hitArea as Record<string, unknown>
    const id =
      typeof record.id === 'string'
        ? record.id
        : typeof record.Id === 'string'
          ? record.Id
          : undefined
    const name =
      typeof record.name === 'string'
        ? record.name
        : typeof record.Name === 'string'
          ? record.Name
          : undefined

    if (!id || !name) {
      continue
    }

    defs.push({
      id,
      name,
      index: resolveIndex(id)
    })
  }

  return defs
}

export interface Bounds {
  x: number
  y: number
  width: number
  height: number
}

export interface InternalModelOptions extends MotionManagerOptions {
  /**
   * Define natural movements depth (0.0-1.0).
   * @default 1.0
   */
  breathDepth?: number

  /**
   * Gain multiplier applied to the analyzed mouth-sync input value.
   * @default 1.5
   */
  lipSyncGain?: number

  /**
   * Blend weight used when adding lip-sync values to mouth parameters.
   * @default 0.4
   */
  lipSyncWeight?: number
}

const tempBounds: Bounds = { x: 0, y: 0, width: 0, height: 0 }

/**
 * A wrapper that manages the states of a Live2D core model, and delegates all operations to it.
 * @emits {@link InternalModelEvents}
 */
export abstract class InternalModel extends EventEmitter {
  /**
   * The managed Live2D core model.
   */
  abstract readonly coreModel: object

  abstract readonly settings: ModelSettings

  abstract readonly options: InternalModelOptions

  focusController = new FocusController()

  abstract motionManager: MotionManager
  abstract parallelMotionManager: ParallelMotionManager<Live2DMotion | CubismMotion>[]

  pose?: unknown
  physics?: unknown

  /**
   * Original canvas width of the model. Note this doesn't represent the model's real size,
   * as the model can overflow from its canvas.
   */
  readonly originalWidth: number = 0

  /**
   * Original canvas height of the model. Note this doesn't represent the model's real size,
   * as the model can overflow from its canvas.
   */
  readonly originalHeight: number = 0

  /**
   * Canvas width of the model, scaled by the `width` of the model's layout.
   */
  readonly width: number = 0

  /**
   * Canvas height of the model, scaled by the `height` of the model's layout.
   */
  readonly height: number = 0

  /**
   * Local transformation, calculated from the model's layout.
   */
  localTransform = new Matrix()

  /**
   * The final matrix to draw the model.
   */
  drawingMatrix = new Matrix()

  // TODO: change structure
  /**
   * The hit area definitions, keyed by their names.
   */
  hitAreas: Record<string, CommonHitArea> = {}

  /**
   * Flags whether `gl.UNPACK_FLIP_Y_WEBGL` should be enabled when binding the textures.
   */
  textureFlipY = false

  /**
   * WebGL viewport when drawing the model. The format is `[x, y, width, height]`.
   */
  viewport: [number, number, number, number] = [0, 0, 0, 0]

  /**
   * Flags this instance has been destroyed.
   */
  destroyed = false

  /**
   * Should be called in the constructor of derived class.
   */
  protected init() {
    this.setupLayout()
    this.setupHitAreas()
  }

  /**
   * Sets up the model's size and local transform by the model's layout.
   */
  protected setupLayout() {
    // cast `this` to be mutable
    const self = this as Mutable<this>

    const size = this.getSize()

    self.originalWidth = size[0]
    self.originalHeight = size[1]

    const layout = Object.assign(
      {
        width: LOGICAL_WIDTH,
        height: LOGICAL_HEIGHT
      },
      this.getLayout()
    )

    this.localTransform.scale(layout.width / LOGICAL_WIDTH, layout.height / LOGICAL_HEIGHT)

    self.width = this.originalWidth * this.localTransform.a
    self.height = this.originalHeight * this.localTransform.d

    // this calculation differs from Live2D SDK...
    const offsetX =
      (layout.x !== undefined && layout.x - layout.width / 2) ||
      (layout.centerX !== undefined && layout.centerX) ||
      (layout.left !== undefined && layout.left - layout.width / 2) ||
      (layout.right !== undefined && layout.right + layout.width / 2) ||
      0

    const offsetY =
      (layout.y !== undefined && layout.y - layout.height / 2) ||
      (layout.centerY !== undefined && layout.centerY) ||
      (layout.top !== undefined && layout.top - layout.height / 2) ||
      (layout.bottom !== undefined && layout.bottom + layout.height / 2) ||
      0

    this.localTransform.translate(this.width * offsetX, -this.height * offsetY)
  }

  /**
   * Sets up the hit areas by their definitions in settings.
   */
  protected setupHitAreas() {
    const definitions = this.getHitAreaDefs()

    this.hitAreas = {}

    for (const def of definitions) {
      if (!def.name) {
        continue
      }

      this.hitAreas[def.name] = def
    }
  }

  /**
   * Hit-test on the model.
   * @param x - Position in model canvas.
   * @param y - Position in model canvas.
   * @return The names of the *hit* hit areas. Can be empty if none is hit.
   */
  hitTest(x: number, y: number): string[] {
    return Object.keys(this.hitAreas).filter((hitAreaName) => this.isHit(hitAreaName, x, y))
  }

  /**
   * Hit-test for a single hit area.
   * @param hitAreaName - The hit area's name.
   * @param x - Position in model canvas.
   * @param y - Position in model canvas.
   * @return True if hit.
   */
  isHit(hitAreaName: string, x: number, y: number): boolean {
    const hitArea = this.hitAreas[hitAreaName]
    if (!hitArea) {
      return false
    }

    let drawIndex = hitArea.index

    if (drawIndex < 0) {
      if (!hitArea.id) {
        return false
      }

      drawIndex = this.getDrawableIndex(hitArea.id)

      if (drawIndex < 0) {
        return false
      }

      hitArea.index = drawIndex
    }

    const bounds = this.getDrawableBounds(drawIndex, tempBounds)

    return (
      bounds.x <= x &&
      x <= bounds.x + bounds.width &&
      bounds.y <= y &&
      y <= bounds.y + bounds.height
    )
  }

  /**
   * Gets a drawable's bounds.
   * @param index - Index of the drawable.
   * @param bounds - Object to store the output values.
   * @return The bounds in model canvas space.
   */
  getDrawableBounds(index: number, bounds?: Bounds): Bounds {
    const vertices = this.getDrawableVertices(index)

    let left = vertices[0]!
    let right = vertices[0]!
    let top = vertices[1]!
    let bottom = vertices[1]!

    for (let i = 0; i < vertices.length; i += 2) {
      const vx = vertices[i]!
      const vy = vertices[i + 1]!

      left = Math.min(vx, left)
      right = Math.max(vx, right)
      top = Math.min(vy, top)
      bottom = Math.max(vy, bottom)
    }

    bounds ??= {} as Bounds

    bounds.x = left
    bounds.y = top
    bounds.width = right - left
    bounds.height = bottom - top

    return bounds
  }

  /**
   * Updates the model's transform.
   * @param transform - The world transform.
   */
  updateTransform(transform: Matrix) {
    this.drawingMatrix.copyFrom(transform).append(this.localTransform)
  }

  /**
   * Updates the model's parameters.
   * @param dt - Elapsed time in milliseconds from last frame.
   * @param _now - Current time in milliseconds.
   */
  update(dt: DOMHighResTimeStamp, _now: DOMHighResTimeStamp): void {
    this.focusController.update(dt)
  }

  /**
   * Destroys the model and all related resources.
   * @emits {@link `InternalModelEvents.destroy` | destroy}
   */
  destroy(): void {
    this.destroyed = true
    this.emit('destroy')

    this.motionManager.destroy()
    ;(this as Partial<this>).motionManager = undefined
    this.parallelMotionManager.forEach((m) => m.destroy())
    this.parallelMotionManager = []
  }

  // noinspection JSValidateJSDoc
  /**
   * Updates all active motions for the model and emits lifecycle events.
   *
   * This method coordinates the update cycle for both primary and parallel motion managers,
   * ensuring all animations are synchronized with the current timestamp. It emits events
   * before and after the update process, allowing external listeners to hook into the motion
   * lifecycle. The return value indicates whether any motion was actively updated during this cycle.
   *
   * @param {object} model - The model instance to apply motion updates to.
   * @param {number} now - The current timestamp (in milliseconds) used to calculate motion progress.
   * @returns {boolean} Returns `true` if any motion (primary or parallel) was updated; `false` otherwise.
   *
   * @emits beforeMotionUpdate - Triggered before any motion updates are processed.
   * @emits afterMotionUpdate - Triggered after all motion updates are completed.
   *
   */
  protected updateMotions(model: object, now: number): boolean {
    this.emit('beforeMotionUpdate')

    const motionUpdated0 = this.motionManager.update(model, now)
    const parallelMotionUpdated = this.parallelMotionManager.map((m) => m.update(model, now))
    const motionUpdated =
      motionUpdated0 || parallelMotionUpdated.reduce((prev, curr) => prev || curr, false)

    this.emit('afterMotionUpdate')

    return motionUpdated
  }

  /**
   * Gets all the hit area definitions.
   * @return Normalized definitions.
   */
  protected abstract getHitAreaDefs(): CommonHitArea[]

  /**
   * Gets the model's original canvas size.
   * @return `[width, height]`
   */
  protected abstract getSize(): [number, number]

  /**
   * Gets the layout definition.
   * @return Normalized definition.
   */
  protected abstract getLayout(): CommonLayout

  /**
   * Gets all the drawables' IDs.
   * @return IDs.
   */
  abstract getDrawableIDs(): string[]

  /**
   * Finds the index of a drawable by its ID.
   * @return The index.
   */
  abstract getDrawableIndex(id: string): number

  /**
   * Gets a drawable's vertices.
   * @param index - Either the index or the ID of the drawable.
   * @throws Error when the drawable cannot be found.
   */
  abstract getDrawableVertices(index: number | string): Float32Array

  /**
   * Updates WebGL context bound to this model.
   * @param gl - WebGL context.
   * @param glContextID - Unique ID for given WebGL context.
   */
  abstract updateWebGLContext(gl: WebGLRenderingContext, glContextID: number): void

  /**
   * Binds a texture to the model. The index must be the same as that of this texture
   * in the {@link ModelSettings.textures} array.
   */
  abstract bindTexture(index: number, texture: WebGLTexture): void

  /**
   * Draws the model.
   */
  abstract draw(gl: WebGLRenderingContext): void

  /**
   * Add parallel motion manager.
   * @param managerCount - Count of parallel motion managers.
   */
  abstract extendParallelMotionManager(managerCount: number): void
}
