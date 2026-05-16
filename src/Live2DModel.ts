import type {
  InternalModel,
  InternalModelOptions,
  ModelSettings,
  MotionPriority
} from '@/cubism-common'
import { VOLUME } from '@/cubism-common/SoundManager'
import type { Live2DFactoryOptions } from '@/factory/Live2DFactory'
import { Live2DFactory } from '@/factory/Live2DFactory'
import type { Live2DTextureSourceOptions } from '@/factory/texture'
import { getTextureLODFilter, getTextureLODPlan } from '@/factory/texture-lod'
import type { GlRenderingContext, InstructionSet, RenderLayer, Renderer, Ticker } from 'pixi.js'
import {
  Bounds,
  CanvasSource,
  Container,
  DOMAdapter,
  ExtensionType,
  Matrix,
  ObservablePoint,
  Point,
  Texture,
  WebGLRenderer
} from 'pixi.js'
import { Automator, type AutomatorOptions } from './Automator'
import { Live2DTransform } from './Live2DTransform'
import type { JSONObject } from './types/helpers'

export interface Live2DModelOptions extends InternalModelOptions, AutomatorOptions {
  /**
   * Texture loading and atlas LOD options for this model.
   *
   * See {@link Live2DTextureLODOptions} for the available `lod` strategies.
   *
   * @default { lod: 'full' }
   */
  textureOptions?: Live2DTextureSourceOptions
}

const tempPoint = new Point()
const tempMatrix = new Matrix()
const tempWorldMatrix = new Matrix()
const tempDrawableBounds = { x: 0, y: 0, width: 0, height: 0 }
const tempModelBounds = new Bounds()

type Live2DTextureLODState = {
  source: Texture
  level: number
  texture: Texture
}

type Live2DTextureLODFailures = {
  source: Texture
  levels: Set<number>
}

export type Live2DConstructor = { new (options?: Live2DModelOptions): Live2DModel }

type RenderPipeRegistry = Record<
  string,
  {
    push?: (...args: unknown[]) => void
    pop?: (...args: unknown[]) => void
    break?: (instructionSet: InstructionSet) => void
  }
>

type Live2DPipeRenderer = Renderer & {
  renderPipes: RenderPipeRegistry & {
    live2d?: Live2DPipe
    batch?: { break?: (instructionSet: InstructionSet) => void }
  }
}

let live2DPluginFallbackWarned = false

/**
 * Internal PixiJS render pipe for Live2D models.
 * @internal
 */
class Live2DPipe {
  static extension = {
    type: [ExtensionType.WebGLPipes],
    name: 'live2d'
  } as const

  constructor(private renderer: Renderer) {}

  addRenderable(model: Live2DModel, instructionSet: InstructionSet): void {
    const renderPipes = (this.renderer as Live2DPipeRenderer).renderPipes

    renderPipes.batch?.break?.(instructionSet)
    instructionSet.add(model)
  }

  execute(model: Live2DModel): void {
    if (!model.visible || model.alpha <= 0) {
      return
    }

    model.renderLive2D(this.renderer)
  }

  updateRenderable(): void {}

  destroyRenderable(): void {}

  validateRenderable(): boolean {
    return false
  }

  destroy(): void {}
}

/**
 * PixiJS extension entry for registering the Live2D WebGL render pipe.
 *
 * Register it before creating a renderer:
 *
 * ```ts
 * import { extensions } from 'pixi.js'
 * import { Live2DPlugin } from 'untitled-pixi-live2d-engine'
 *
 * extensions.add(Live2DPlugin)
 * ```
 */
export const Live2DPlugin = Live2DPipe

/**
 * @deprecated Register {@link Live2DPlugin} with `extensions.add(Live2DPlugin)` before
 * creating the Pixi renderer. This lazy fallback is kept only for backward compatibility.
 */
function ensureLive2DPipe(renderer: Renderer): void {
  const r = renderer as Live2DPipeRenderer

  if (!r.renderPipes.live2d) {
    if (!live2DPluginFallbackWarned) {
      live2DPluginFallbackWarned = true
      console.warn(
        '[untitled-pixi-live2d-engine] Lazy Live2D render pipe registration is deprecated. ' +
          'Register Live2DPlugin explicitly with `extensions.add(Live2DPlugin)` before creating the Pixi renderer.'
      )
    }

    r.renderPipes.live2d = new Live2DPipe(renderer)
  }
}

function getMatrixMaxScale(matrix: Matrix): number {
  return Math.max(Math.hypot(matrix.a, matrix.b), Math.hypot(matrix.c, matrix.d))
}

function isDrawableTextureResource(resource: unknown): resource is CanvasImageSource {
  if (!resource || typeof resource !== 'object') {
    return false
  }

  const { width, height } = resource as { width?: unknown; height?: unknown }

  return typeof width === 'number' && width > 0 && typeof height === 'number' && height > 0
}

function createTextureLODTexture(
  sourceTexture: Texture,
  level: number,
  width: number,
  height: number,
  filter: Live2DTextureSourceOptions['lodFilter']
): Texture | undefined {
  const resource: unknown = sourceTexture.source.resource

  if (!isDrawableTextureResource(resource)) {
    return undefined
  }

  const canvas = DOMAdapter.get().createCanvas(width, height)
  const context = canvas.getContext('2d') as CanvasRenderingContext2D | null

  if (!context) {
    return undefined
  }

  try {
    context.clearRect(0, 0, width, height)
    context.imageSmoothingEnabled = filter !== 'nearest'

    if ('imageSmoothingQuality' in context && filter !== 'nearest') {
      context.imageSmoothingQuality = 'high'
    }

    context.drawImage(
      resource,
      0,
      0,
      sourceTexture.source.pixelWidth,
      sourceTexture.source.pixelHeight,
      0,
      0,
      width,
      height
    )
  } catch {
    return undefined
  }

  const label = `${sourceTexture.label ?? sourceTexture.source.label ?? 'Live2DTexture'} LOD ${level}`

  return new Texture({
    label,
    source: new CanvasSource({
      resource: canvas,
      width,
      height,
      resolution: 1,
      scaleMode: getTextureLODFilter(filter),
      autoGenerateMipmaps: false,
      label
    })
  })
}

// noinspection JSUnusedGlobalSymbols
/**
 * A wrapper that allows the Live2D model to be used as a DisplayObject in PixiJS.
 *
 * ```js
 * const model = await Live2DModel.from('shizuku.model.json');
 * container.add(model);
 * ```
 * @emits {@link Live2DModelEvents}
 */
export class Live2DModel<IM extends InternalModel = InternalModel> extends Container {
  /** @internal */
  renderPipeId = 'live2d'
  /** @internal */
  get isRenderable(): true {
    return true
  }
  /** @internal */
  get canBundle(): false {
    return false
  }

  /**
   * Creates a Live2DModel from given source.
   * @param source - Can be one of: settings file URL, settings JSON object, ModelSettings instance.
   * @param options - Options for the creation.
   * @return Promise that resolves with the Live2DModel.
   */
  static async from<M extends Live2DConstructor = typeof Live2DModel>(
    this: M,
    source: string | JSONObject | ModelSettings,
    options?: Live2DFactoryOptions
  ): Promise<InstanceType<M>> {
    const model = new this(options) as InstanceType<M>

    await Live2DFactory.setupLive2DModel(model, source, options)
    return model
  }

  /**
   * Synchronous version of `Live2DModel.from()`. This method immediately returns a Live2DModel instance,
   * whose resources have not been loaded. Therefore, this model can't be manipulated or rendered
   * until the "load" event has been emitted.
   *
   * ```js
   * // no `await` here as it's not a Promise
   * const model = Live2DModel.fromSync('shizuku.model.json');
   *
   * // these will cause errors!
   * // app.stage.addChild(model);
   * // model.motion('tap_body');
   *
   * model.once('load', () => {
   *     // now it's safe
   *     app.stage.addChild(model);
   *     model.motion('tap_body');
   * });
   * ```
   * @param source - Model source, can be a file path, JSON object, or ModelSettings instance.
   * @param options - Options for the model creation.
   * @returns The created Live2DModel instance.
   */
  static fromSync<M extends Live2DConstructor = typeof Live2DModel>(
    this: M,
    source: string | JSONObject | ModelSettings,
    options?: Live2DFactoryOptions
  ): InstanceType<M> {
    const model = new this(options) as InstanceType<M>

    void Live2DFactory.setupLive2DModel(model, source, options)
      .then(() => options?.onLoad?.())
      .catch((err) => options?.onError?.(err as Error))

    return model
  }

  /**
   * Registers the class of `PIXI.Ticker` for auto updating.
   * @deprecated Use {@link Live2DModelOptions.ticker} instead.
   * @param tickerClass - The Ticker class to be registered.
   */
  static registerTicker(tickerClass: typeof Ticker): void {
    Automator['defaultTicker'] = tickerClass.shared
  }

  /**
   * Tag for logging.
   * @type {string}
   */
  tag: string = 'Live2DModel(uninitialized)'

  /**
   * The internal model. Though typed as non-nullable, it'll be undefined until the "ready" event is emitted.
   */
  internalModel!: IM

  /**
   * Pixi textures.
   * @type {Texture[]}
   */
  textures: Texture[] = []

  private readonly textureOptions?: Live2DTextureSourceOptions
  private readonly textureLODStates: (Live2DTextureLODState | undefined)[] = []
  private readonly textureLODFailures: (Live2DTextureLODFailures | undefined)[] = []

  /** @override
   * The Live2DTransform instance for this model.
   */
  transform = new Live2DTransform()

  /**
   * The anchor behaves like the one in `PIXI.Sprite`, where `(0, 0)` means the top left
   * and `(1, 1)` means the bottom right.
   * @type {ObservablePoint}
   */
  anchor!: ObservablePoint
  /** @internal */
  private readonly _bounds = new Bounds()
  /** @internal */
  private _boundsDirty = true
  /** @internal */
  private _boundsRetryAfterDraw = false

  /** @internal */
  get bounds(): Bounds {
    if (!this.internalModel) {
      this._bounds.set(0, 0, 0, 0)
      return this._bounds
    }

    if (this._boundsDirty) {
      this.updateDrawableBounds()
    }

    return this._bounds
  }

  private updateDrawableBounds(): void {
    if (!this.internalModel) {
      this._bounds.set(0, 0, 0, 0)
      this._boundsDirty = false
      return
    }

    const drawableIds = this.internalModel.getDrawableIDs()
    tempModelBounds.clear()

    for (let i = 0; i < drawableIds.length; i++) {
      const drawableId = drawableIds[i]!
      const drawableIndex = this.internalModel.getDrawableIndex(drawableId)

      if (drawableIndex < 0) {
        continue
      }

      const drawableBounds = this.internalModel.getDrawableBounds(drawableIndex, tempDrawableBounds)

      if (
        !Number.isFinite(drawableBounds.x) ||
        !Number.isFinite(drawableBounds.y) ||
        !Number.isFinite(drawableBounds.width) ||
        !Number.isFinite(drawableBounds.height)
      ) {
        continue
      }

      tempModelBounds.addFrame(
        drawableBounds.x,
        drawableBounds.y,
        drawableBounds.x + drawableBounds.width,
        drawableBounds.y + drawableBounds.height,
        Matrix.IDENTITY
      )
    }

    this._bounds.clear()

    if (tempModelBounds.isValid && tempModelBounds.isPositive) {
      this._bounds.addFrame(
        tempModelBounds.minX,
        tempModelBounds.minY,
        tempModelBounds.maxX,
        tempModelBounds.maxY,
        this.internalModel.localTransform
      )
      this._boundsRetryAfterDraw = false
    } else {
      const width = this.internalModel.originalWidth || this.internalModel.width
      const height = this.internalModel.originalHeight || this.internalModel.height

      this._bounds.addFrame(0, 0, width, height, this.internalModel.localTransform)
      this._boundsRetryAfterDraw = true
    }

    this._boundsDirty = false
  }

  /**
   * An ID of Gl context that syncs with `renderer.CONTEXT_UID`. Used to check if the GL context has changed.
   * @protected
   * @type {number}
   */

  protected gl: GlRenderingContext | null = null

  /**
   * Elapsed time in milliseconds since created.
   * @type {DOMHighResTimeStamp}
   */
  elapsedTime: DOMHighResTimeStamp = 0

  /**
   * Elapsed time in milliseconds from last frame to this frame.
   * @type {DOMHighResTimeStamp}
   */
  deltaTime: DOMHighResTimeStamp = 0

  /**
   * The Automator instance that controls model automation.
   * @type {Automator}
   */
  automator: Automator

  currentGlId: number = 0
  private generateUID(): number {
    return ++this.currentGlId
  }

  /**
   * Creates a new Live2DModel instance.
   * @param options - Options for Live2DModel and Automator.
   */
  constructor(options?: Live2DModelOptions) {
    super()

    this.textureOptions = options?.textureOptions

    this.anchor = new ObservablePoint(
      {
        _onUpdate: () => this.onAnchorChange()
      },
      0,
      0
    )

    this.automator = new Automator(this, options)
    this.once('modelLoaded', () => this.initializeOnModelLoad(options))
  }

  /**
   * Insert this model into Pixi's instruction set so zIndex ordering works with other objects.
   */
  collectRenderables(
    instructionSet: InstructionSet,
    renderer: Renderer,
    currentLayer: RenderLayer
  ): void {
    if (this.parentRenderLayer && this.parentRenderLayer !== currentLayer) {
      return
    }

    if (this.globalDisplayStatus < 0b111) {
      return
    }

    if (!this.includeInBuild) {
      return
    }

    if (this.sortableChildren) {
      this.sortChildren()
    }

    ensureLive2DPipe(renderer)

    const renderPipes = (renderer as Live2DPipeRenderer).renderPipes

    const addRenderable = () => {
      renderPipes.live2d!.addRenderable(this, instructionSet)
    }

    const collectChildren = () => {
      const children = this.children
      const length = children.length

      for (let i = 0; i < length; i++) {
        children[i]!.collectRenderables(instructionSet, renderer, currentLayer)
      }
    }

    const effects = this.effects

    if (effects) {
      for (let i = 0; i < effects.length; i++) {
        const effect = effects[i]!

        // Inherit renderer resolution so filtered Live2D stays crisp.
        const filters = (effect as { filters?: { resolution?: unknown }[] | undefined }).filters

        if (filters) {
          for (const f of filters) {
            if (f && typeof f.resolution === 'number' && f.resolution === 1) {
              f.resolution = 'inherit' as const
            }
          }
        }

        renderPipes[effect.pipe]?.push?.(effect, this, instructionSet)
      }

      addRenderable()
      collectChildren()

      for (let i = effects.length - 1; i >= 0; i--) {
        const effect = effects[i]!
        renderPipes[effect.pipe]?.pop?.(effect, this, instructionSet)
      }
    } else {
      addRenderable()
      collectChildren()
    }
  }

  /**
   * A handler of the "modelLoaded" event, invoked when the internal model has been loaded.
   * @protected
   * @param _options - The options used for initialization.
   */
  protected initializeOnModelLoad(_options?: Live2DModelOptions) {
    this.tag = `Live2DModel(${this.internalModel.settings.name})`

    // apply anchor to pivot now that the internal model dimensions are available
    this.onAnchorChange()
    this.updateDrawableBounds()
  }

  /**
   * A callback that observes {@link anchor}, invoked when the anchor's values have been changed.
   * @protected
   */
  protected onAnchorChange(): void {
    if (!this.internalModel || !this.pivot) {
      return
    }

    this.pivot.set(
      this.anchor.x * this.internalModel.width,
      this.anchor.y * this.internalModel.height
    )
  }

  /**
   * Shorthand to start a motion.
   * @param group - The motion group.
   * @param [index] - Index in the motion group.
   * @param [priority=2] - The priority to be applied. (0: No priority, 1: IDLE, 2:NORMAL, 3:FORCE)
   * @param {Object} options - Additional options for motion.
   * @param [options.sound] - The audio url to file or base64 content.
   * @param [options.volume=0.5] - Volume of the sound (0-1).
   * @param [options.expression] - In case you want to mix up an expression while playing sound (bind with Model.expression()).
   * @param [options.resetExpression=true] - Reset the expression to default after the motion is finished.
   * @param [options.onFinish] - Callback function when speaking completes.
   * @param [options.onError] - Callback function when an error occurs.
   * @return Promise that resolves with true if the motion is successfully started, with false otherwise.
   */
  async motion(
    group: string,
    index?: number,
    priority?: MotionPriority,
    {
      sound = undefined,
      volume = VOLUME,
      expression = undefined,
      resetExpression = true,
      onFinish,
      onError
    }: {
      sound?: string
      volume?: number
      expression?: number | string
      resetExpression?: boolean
      onFinish?: () => void
      onError?: (e: Error) => void
    } = {}
  ): Promise<boolean> {
    if (index === undefined) {
      return this.internalModel.motionManager.startRandomMotion(group, priority, {
        sound: sound,
        volume: volume,
        expression: expression,
        resetExpression: resetExpression,
        onFinish: onFinish,
        onError: onError
      })
    } else {
      return this.internalModel.motionManager.startMotion(group, index, priority, {
        sound: sound,
        volume: volume,
        expression: expression,
        resetExpression: resetExpression,
        onFinish: onFinish,
        onError: onError
      })
    }
  }

  async motionLastFrame(
    group: string,
    id: number,
    {
      expression = undefined
    }: {
      expression?: number | string
    } = {}
  ): Promise<boolean> {
    return this.internalModel.motionManager.motionLastFrame(group, id, { expression: expression })
  }

  /**
   * Shorthand to start multiple motions in parallel.
   * @param motionList - The motion list, each item includes:
   *  group: The motion group,
   *  index: Index in the motion group,
   *  priority: The priority to be applied. (0: No priority, 1: IDLE, 2:NORMAL, 3:FORCE) (default: 2)
   * @return Promise that resolves with a list, indicates the motion is successfully started, with false otherwise.
   */
  async parallelMotion(
    motionList: {
      group: string
      index: number
      priority?: MotionPriority
    }[]
  ): Promise<boolean[]> {
    this.internalModel.extendParallelMotionManager(motionList.length)
    const result = motionList.map((m, idx) =>
      this.internalModel.parallelMotionManager[idx]!.startMotion(m.group, m.index, m.priority)
    )
    const flags: boolean[] = []
    for (const r of result) {
      flags.push(await r)
    }
    return flags
  }

  /**
   * Shorthand to play the last frame of multiple motions in parallel and await their completion.
   *
   * This method initiates the final frame of each specified motion concurrently,
   * leveraging the internal parallel motion manager. Each motion's completion is awaited
   * sequentially, and the results are returned as an array of success flags.
   *
   * @async
   * @param {{group: string, index: number, priority?: MotionPriority}[]} motionList - Array of motions to execute.
   * @param {string} motionList.group - Motion group identifier (e.g., "idle", "walk").
   * @param {number} motionList.index - Index within the motion group.
   * @param {MotionPriority} [motionList.priority=2] - Motion priority (0: None, 1: IDLE, 2: NORMAL, 3: FORCE).
   * @returns {Promise<boolean[]>} Resolves with an array where each boolean indicates
   *                               whether the corresponding motion completed successfully.
   */
  async parallelLastFrame(
    motionList: {
      group: string
      index: number
    }[]
  ): Promise<boolean[]> {
    this.internalModel.extendParallelMotionManager(motionList.length)
    const result = motionList.map((m, idx) =>
      this.internalModel.parallelMotionManager[idx]!.playMotionLastFrame(m.group, m.index)
    )
    const flags: boolean[] = []
    for (const r of result) {
      flags.push(await r)
    }
    return flags
  }

  /**
   * Stops all playing motions as well as the sound.
   */
  stopMotions(): void {
    return this.internalModel.motionManager.stopAllMotions()
  }

  /**
   * Shorthand to start speaking a sound with an expression.
   * @param sound - The audio url to file or base64 content.
   * @param {Object} options - Additional options for speaking.
   * @param [options.volume] - Volume of the sound (0-1).
   * @param [options.expression] - In case you want to mix up an expression while playing sound (bind with Model.expression()).
   * @param [options.resetExpression=true] - Reset the expression to default after the motion is finished.
   * @param [options.onFinish] - Callback function when speaking completes.
   * @param [options.onError] - Callback function when an error occurs.
   * @returns Promise that resolves with true if the sound is playing, false if it's not.
   */
  speak(
    sound: string,
    {
      volume = VOLUME,
      expression,
      resetExpression = true,
      onFinish,
      onError
    }: {
      volume?: number
      expression?: number | string
      resetExpression?: boolean
      onFinish?: () => void
      onError?: (e: Error) => void
    } = {}
  ): Promise<boolean> {
    return this.internalModel.motionManager.speak(sound, {
      volume: volume,
      expression: expression,
      resetExpression: resetExpression,
      onFinish: onFinish,
      onError: onError
    })
  }

  /**
   * Stop current audio playback and lipsync.
   */
  stopSpeaking(): void {
    return this.internalModel.motionManager.stopSpeaking()
  }

  /**
   * Shorthand to set an expression.
   * @param id - Either the index, or the name of the expression. If not presented, a random expression will be set.
   * @return Promise that resolves with true if succeeded, with false otherwise.
   */
  expression(id?: number | string): Promise<boolean> {
    if (this.internalModel.motionManager.expressionManager) {
      return id === undefined
        ? this.internalModel.motionManager.expressionManager.setRandomExpression()
        : this.internalModel.motionManager.expressionManager.setExpression(id)
    }
    return Promise.resolve(false)
  }

  /**
   * Updates the focus position. This will not cause the model to immediately look at the position,
   * instead the movement will be interpolated.
   * @param x - Position in world space.
   * @param y - Position in world space.
   * @param instant - Should the focus position be instantly applied.
   */
  focus(x: number, y: number, instant: boolean = false): void {
    tempPoint.x = x
    tempPoint.y = y

    // we can pass `true` as the third argument to skip the update transform
    // because focus won't take effect until the model is rendered,
    // and a model being rendered will always get transform updated
    this.toModelPosition(tempPoint, tempPoint, true)

    const tx = (tempPoint.x / this.internalModel.originalWidth) * 2 - 1
    const ty = (tempPoint.y / this.internalModel.originalHeight) * 2 - 1
    const radian = Math.atan2(ty, tx)
    this.internalModel.focusController.focus(Math.cos(radian), -Math.sin(radian), instant)
  }

  /**
   * Tap on the model. This will perform a hit-testing, and emit a "hit" event
   * if at least one of the hit areas is hit.
   * @param x - Position in world space.
   * @param y - Position in world space.
   * @emits {@link Live2DModelEvents.hit}
   */
  tap(x: number, y: number): void {
    const hitAreaNames = this.hitTest(x, y)

    if (hitAreaNames.length) {
      this.emit('hit', hitAreaNames)
    }
  }

  /**
   * Hit-test on the model.
   * @param x - Position in world space.
   * @param y - Position in world space.
   * @return The names of the *hit* hit areas. Can be empty if none is hit.
   */
  hitTest(x: number, y: number): string[] {
    tempPoint.x = x
    tempPoint.y = y
    this.toModelPosition(tempPoint, tempPoint)

    return this.internalModel.hitTest(tempPoint.x, tempPoint.y)
  }

  /**
   * Calculates the position in the canvas of original, unscaled Live2D model.
   * @param position - A Point in world space.
   * @param result - A Point to store the new value. Defaults to a new Point.
   * @param skipUpdate - True to skip the update transform.
   * @return The Point in model canvas space.
   */
  toModelPosition(position: Point, result: Point = position.clone(), skipUpdate?: boolean): Point {
    if (!skipUpdate) {
      this.updateLocalTransform()
    }

    this.toLocal(position, undefined, result, skipUpdate)
    this.internalModel.localTransform.applyInverse(result, result)
    return result
  }

  /**
   * A method required by `PIXI.InteractionManager` to perform hit-testing.
   * @param point - A Point in local space.
   * @return True if the point is inside this model.
   */
  containsPoint(point: Point): boolean {
    return this.bounds.containsPoint(point.x, point.y)
  }

  /** @override
   * Calculates the bounds of the Live2DModel for rendering and interaction purposes.
   */
  protected _calculateBounds(): void {
    if (!this.internalModel) {
      this.getBounds().set(0, 0, 0, 0)
      return
    }

    const width = this.internalModel.width
    const height = this.internalModel.height

    this.getBounds().addFrame(0, 0, width, height, this.transform.matrix)
  }

  /**
   * Updates the model. Note this method just updates the timer,
   * and the actual update will be done right before rendering the model.
   * @param dt - The elapsed time in milliseconds since last frame.
   */
  update(dt: DOMHighResTimeStamp): void {
    this.deltaTime += dt
    this.elapsedTime += dt

    // don't call `this.internalModel.update()` here, because it requires WebGL context
  }

  private resolveTextureForRender(
    index: number,
    texture: Texture,
    effectiveScale: number
  ): Texture {
    const plan = getTextureLODPlan({
      ...this.textureOptions,
      effectiveScale,
      textureWidth: texture.source.pixelWidth,
      textureHeight: texture.source.pixelHeight
    })

    if (!plan) {
      return texture
    }

    const failure = this.textureLODFailures[index]

    if (failure?.source === texture && failure.levels.has(plan.level)) {
      return texture
    }

    const existing = this.textureLODStates[index]

    if (
      existing?.source === texture &&
      existing.level === plan.level &&
      !existing.texture.destroyed
    ) {
      return existing.texture
    }

    this.destroyTextureLODState(index)

    const lodTexture = createTextureLODTexture(
      texture,
      plan.level,
      plan.width,
      plan.height,
      this.textureOptions?.lodFilter
    )

    if (!lodTexture) {
      this.markTextureLODFailure(index, texture, plan.level)
      return texture
    }

    this.textureLODStates[index] = {
      source: texture,
      level: plan.level,
      texture: lodTexture
    }

    return lodTexture
  }

  private markTextureLODFailure(index: number, texture: Texture, level: number): void {
    let failure = this.textureLODFailures[index]

    if (failure?.source !== texture) {
      failure = { source: texture, levels: new Set<number>() }
      this.textureLODFailures[index] = failure
    }

    failure.levels.add(level)
  }

  private destroyTextureLODState(index: number): void {
    const state = this.textureLODStates[index]

    if (!state) {
      return
    }

    state.texture.destroy(true)
    this.textureLODStates[index] = undefined
  }

  private destroyTextureLODStates(): void {
    for (let i = 0; i < this.textureLODStates.length; i++) {
      this.destroyTextureLODState(i)
    }

    this.textureLODFailures.length = 0
  }

  private uploadTextureForRender(
    renderer: WebGLRenderer,
    texture: Texture,
    shouldUpdateTexture: boolean
  ): void {
    // getGlSource() cannot be used here, as it will trigger PixiJS's material upload
    // before Cubism's expected UNPACK_FLIP_Y state is applied.
    const hasGlSource = Boolean(texture.source._gpuData[renderer.uid])

    if (shouldUpdateTexture || !hasGlSource) {
      renderer.gl.pixelStorei(
        WebGLRenderingContext.UNPACK_FLIP_Y_WEBGL,
        this.internalModel.textureFlipY
      )

      renderer.texture.bind(texture, 0)
    }
  }

  /**
   * Renders the Live2DModel to the renderer.
   * @param renderer - The PixiJS Renderer instance.
   */
  renderLive2D = (renderer: Renderer) => {
    if (!(renderer instanceof WebGLRenderer)) {
      throw new Error(`Renderer is not supported`)
    }
    renderer.geometry.resetState()
    renderer.shader.resetState()
    renderer.texture.resetState()

    let shouldUpdateTexture = false

    if (this.gl !== renderer.gl) {
      this.gl = renderer.gl

      this.internalModel.updateWebGLContext(renderer.gl, this.generateUID())

      shouldUpdateTexture = true
    }

    const { projectionMatrix, offset, worldTransformMatrix } =
      renderer.globalUniforms.globalUniformData
    const adjustedWorld = tempWorldMatrix.copyFrom(worldTransformMatrix).append(this.groupTransform)
    const effectiveScale = getMatrixMaxScale(adjustedWorld) * renderer.resolution

    for (let i = 0; i < this.textures.length; i++) {
      const originalTexture = this.textures[i]!
      let texture = this.resolveTextureForRender(i, originalTexture, effectiveScale)

      try {
        this.uploadTextureForRender(renderer, texture, shouldUpdateTexture)
      } catch {
        if (texture === originalTexture) {
          throw new Error('Failed to upload Live2D texture.')
        }

        const state = this.textureLODStates[i]

        if (state?.texture === texture) {
          this.markTextureLODFailure(i, originalTexture, state.level)
          this.destroyTextureLODState(i)
        }

        texture = originalTexture
        this.uploadTextureForRender(renderer, texture, shouldUpdateTexture)
      }

      this.internalModel.bindTexture(i, renderer.texture.getGlSource(texture.source).texture)
    }

    const viewport = renderer.renderTarget.viewport
    const renderTarget = renderer.renderTarget.renderTarget
    let viewportY = viewport.y

    if (renderTarget?.isRoot) {
      const pixelHeight = renderTarget.colorTexture.source.pixelHeight
      viewportY = pixelHeight - viewport.height - viewport.y
    }

    this.internalModel.viewport = [viewport.x, viewportY, viewport.width, viewport.height]

    const frameDelta = this.deltaTime
    this.deltaTime = 0

    if (frameDelta) {
      this.internalModel.update(frameDelta, this.elapsedTime)
    }

    adjustedWorld.tx -= offset?.x ?? 0
    adjustedWorld.ty -= offset?.y ?? 0

    const internalTransform = tempMatrix.copyFrom(projectionMatrix).append(adjustedWorld)

    this.internalModel.updateTransform(internalTransform)
    this.internalModel.draw(renderer.gl)

    if (this._boundsRetryAfterDraw) {
      this.updateDrawableBounds()
    }

    renderer.state.resetState()
    renderer.texture.resetState()

    // Restore Pixi's cached clear color so subsequent clears use the expected background.
    const clearColor = renderer.renderTarget?.defaultClearColor
    const clearColorCache = (
      renderer.renderTarget as unknown as { adaptor?: { _clearColorCache?: number[] } }
    )?.adaptor?._clearColorCache
    if (clearColor) {
      renderer.gl.clearColor(clearColor[0], clearColor[1], clearColor[2], clearColor[3])
      if (clearColorCache) {
        clearColorCache[0] = clearColor[0]
        clearColorCache[1] = clearColor[1]
        clearColorCache[2] = clearColor[2]
        clearColorCache[3] = clearColor[3]
      }
    }
  }

  /**
   * Destroys the model and all related resources. This takes the same options and also
   * behaves the same as `PIXI.Container#destroy`.
   * @param options - Options parameter. A boolean will act as if all options
   *  have been set to that value
   * @param [options.children=false] - if set to true, all the children will have their destroy
   *  method called as well. `options` will be passed on to those calls.
   * @param [options.texture=false] - Only used for child Sprites if `options.children` is set to true
   *  Should it destroy the texture of the child sprite
   * @param [options.baseTexture=false] - Only used for child Sprites if `options.children` is set to true
   *  Should it destroy the base texture of the child sprite
   */
  destroy(options?: { children?: boolean; texture?: boolean; baseTexture?: boolean }): void {
    this.emit('destroy')

    this.destroyTextureLODStates()

    if (options?.texture) {
      this.textures.forEach((texture) => texture.destroy(options.baseTexture))
    }

    this.automator.destroy()
    this.internalModel.destroy()

    super.destroy(options)
  }
}
