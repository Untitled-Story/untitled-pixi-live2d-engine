import type { DrawableModel } from '@/rendering/webgpu/WebGPULive2DRenderer'

interface LegacyDrawContext {
  _$IS: boolean[]
  clipBufPre_clipContext: { clippingMaskDrawIndexList: number[] } | null
}
interface LegacyDrawable {
  culling: boolean
  getTextureNo(): number
  getIndexArray(): Int16Array
  _$ZL(): Float32Array
}
interface LegacyContext {
  _$aS: LegacyDrawable[]
  update(): void
  preDraw(param: Live2DObfuscated.DrawParamWebGL): void
  draw(sink: object): void
  _$C2(index: number): LegacyDrawContext
}

export function legacyContext(model: Live2DModelWebGL): LegacyContext {
  const context = model.getModelContext() as unknown as LegacyContext
  if (
    !Array.isArray(context._$aS) ||
    typeof context.draw !== 'function' ||
    typeof context._$C2 !== 'function'
  ) {
    throw new Error('Unsupported Cubism 2 Core: drawable access is unavailable.')
  }
  return context
}

/** Collect the SDK's CPU draw order and final opacity without calling WebGL. */
export class Cubism2DrawData implements DrawableModel {
  private readonly context: LegacyContext
  private readonly vertices: Float32Array[]
  private readonly uvs: Float32Array[]
  private readonly indices: Uint16Array[]
  private readonly textures: number[]
  private readonly masks: Int32Array[]
  private readonly maskCounts: Int32Array
  private readonly orders: Int32Array
  private readonly opacities: Float32Array
  private readonly blends: Uint8Array
  private readonly cullings: boolean[]
  private readonly visible: boolean[]
  private readonly contexts = new Map<LegacyDrawContext, number>()
  private readonly white = { r: 1, g: 1, b: 1, a: 1 }
  private readonly black = { r: 0, g: 0, b: 0, a: 0 }
  private currentCulling = false
  private drawOrder = 0
  private disableCulling = false
  private readonly sink = {
    _$ZT: (): void => {},
    setClipBufPre_clipContextForDraw: (): void => {},
    _$WP: (culling: boolean): void => {
      this.currentCulling = culling
    },
    _$Uo: (
      _texture: number,
      _count: number,
      _indices: Int16Array,
      _vertices: Float32Array,
      _uvs: Float32Array,
      opacity: number,
      blend: number,
      context: LegacyDrawContext
    ): void => {
      const index = this.contexts.get(context)
      if (index === undefined) throw new Error('Unknown Cubism 2 draw context.')
      this.orders[index] = this.drawOrder++
      this.opacities[index] = opacity
      this.blends[index] = blend
      this.cullings[index] = this.currentCulling && !this.disableCulling
      this.visible[index] = opacity >= 0.01
    }
  }

  constructor(private readonly model: Live2DModelWebGL) {
    this.context = legacyContext(model)
    const drawables = this.context._$aS
    this.vertices = drawables.map((_, i) => new Float32Array(model.getTransformedPoints(i).length))
    this.uvs = drawables.map((drawable) => drawable._$ZL())
    this.indices = drawables.map((drawable) => Uint16Array.from(drawable.getIndexArray()))
    this.textures = drawables.map((drawable) =>
      drawable.getTextureNo() < 0 ? 1 : drawable.getTextureNo()
    )
    this.masks = drawables.map(
      (_, i) =>
        new Int32Array(this.context._$C2(i).clipBufPre_clipContext?.clippingMaskDrawIndexList ?? [])
    )
    this.maskCounts = new Int32Array(this.masks.map((mask) => mask.length))
    this.orders = new Int32Array(drawables.length)
    this.opacities = new Float32Array(drawables.length)
    this.blends = new Uint8Array(drawables.length)
    this.cullings = drawables.map((drawable) => drawable.culling)
    this.visible = drawables.map(() => false)
    drawables.forEach((_, i) => this.contexts.set(this.context._$C2(i), i))
  }

  refresh(disableCulling = false): void {
    this.disableCulling = disableCulling
    this.drawOrder = 0
    this.visible.fill(false)
    this.opacities.fill(0)
    for (let i = 0; i < this.vertices.length; i++) {
      this.cullings[i] = this.context._$aS[i]!.culling && !disableCulling
      const vertices = this.vertices[i]!
      if (this.context._$C2(i)._$IS[0]) vertices.fill(0)
      else vertices.set(this.model.getTransformedPoints(i))
    }
    this.context.draw(this.sink)
  }
  getDrawableCount(): number {
    return this.vertices.length
  }
  getDrawableMaskCounts(): Int32Array {
    return this.maskCounts
  }
  getDrawableMasks(): Int32Array[] {
    return this.masks
  }
  getDrawableTextureIndex(i: number): number {
    return this.textures[i]!
  }
  getDrawableVertices(i: number): Float32Array {
    return this.vertices[i]!
  }
  getDrawableVertexUvs(i: number): Float32Array {
    return this.uvs[i]!
  }
  getDrawableVertexIndices(i: number): Uint16Array {
    return this.indices[i]!
  }
  getDrawableVertexIndexCount(i: number): number {
    return this.indices[i]!.length
  }
  getDrawableRenderOrders(): Int32Array {
    return this.orders
  }
  getDrawableOpacity(i: number): number {
    return this.opacities[i]!
  }
  getDrawableCulling(i: number): boolean {
    return this.cullings[i]!
  }
  getDrawableBlendMode(i: number): number {
    return this.blends[i]!
  }
  getDrawableDynamicFlagIsVisible(i: number): boolean {
    return this.visible[i]!
  }
  getDrawableInvertedMaskBit(): boolean {
    return false
  }
  getMultiplyColor(): { r: number; g: number; b: number; a: number } {
    return this.white
  }
  getScreenColor(): { r: number; g: number; b: number; a: number } {
    return this.black
  }
}
