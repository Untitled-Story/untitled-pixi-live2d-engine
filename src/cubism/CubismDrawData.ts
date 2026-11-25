import type { DrawableModel } from '@/rendering/webgpu/WebGPULive2DRenderer'
import type { CubismModel } from '@cubism/model/cubismmodel'

/** Exposes a Cubism 3+ model through the drawable interface used by the WebGPU backend. */
export class CubismDrawData implements DrawableModel {
  constructor(private readonly model: CubismModel) {}

  getDrawableCount(): number {
    return this.model.getDrawableCount()
  }
  getDrawableMaskCounts(): Int32Array {
    return this.model.getDrawableMaskCounts()
  }
  getDrawableMasks(): Int32Array[] {
    return this.model.getDrawableMasks()
  }
  getDrawableTextureIndex(index: number): number {
    return this.model.getDrawableTextureIndex(index)
  }
  getDrawableVertices(index: number): Float32Array {
    return this.model.getDrawableVertices(index)
  }
  getDrawableVertexUvs(index: number): Float32Array {
    return this.model.getDrawableVertexUvs(index)
  }
  getDrawableVertexIndices(index: number): Uint16Array {
    return this.model.getDrawableVertexIndices(index)
  }
  getDrawableVertexIndexCount(index: number): number {
    return this.model.getDrawableVertexIndexCount(index)
  }
  getMultiplyColor(index: number): { r: number; g: number; b: number; a: number } {
    return this.model.getOverrideMultiplyAndScreenColor().getDrawableMultiplyColor(index)
  }
  getScreenColor(index: number): { r: number; g: number; b: number; a: number } {
    return this.model.getOverrideMultiplyAndScreenColor().getDrawableScreenColor(index)
  }
  getDrawableOpacity(index: number): number {
    return this.model.getDrawableOpacity(index)
  }
  getDrawableInvertedMaskBit(index: number): boolean {
    return this.model.getDrawableInvertedMaskBit(index)
  }
  getDrawableBlendMode(index: number): number {
    return this.model.getDrawableBlendMode(index)
  }
  getDrawableCulling(index: number): boolean {
    return this.model.getDrawableCulling(index)
  }
  getDrawableRenderOrders(): Int32Array {
    return this.model.getRenderOrders()
  }
  getDrawableDynamicFlagIsVisible(index: number): boolean {
    return this.model.getDrawableDynamicFlagIsVisible(index)
  }
}
