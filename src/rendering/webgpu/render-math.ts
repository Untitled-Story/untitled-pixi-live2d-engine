export type BlendMode = 'normal' | 'add' | 'multiply' | 'mask'

export function blendState(mode: BlendMode): GPUBlendState {
  switch (mode) {
    case 'add':
      return {
        color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
        alpha: { srcFactor: 'zero', dstFactor: 'one', operation: 'add' }
      }
    case 'multiply':
      return {
        color: { srcFactor: 'dst', dstFactor: 'one-minus-src-alpha', operation: 'add' },
        alpha: { srcFactor: 'zero', dstFactor: 'one', operation: 'add' }
      }
    case 'mask':
      return {
        color: { srcFactor: 'zero', dstFactor: 'one-minus-src', operation: 'add' },
        alpha: { srcFactor: 'zero', dstFactor: 'one-minus-src-alpha', operation: 'add' }
      }
    default:
      return {
        color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
        alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' }
      }
  }
}

export function alignedSize(bytes: number, alignment: number): number {
  return Math.max(alignment, Math.ceil(bytes / alignment) * alignment)
}

export function paddedIndices(indices: Uint16Array): Uint16Array {
  const padded = new Uint16Array(alignedSize(indices.byteLength, 4) / 2)
  padded.set(indices)
  return padded
}

export function maskKey(indices: Int32Array, count: number): string {
  return Array.from(indices.subarray(0, count))
    .sort((a, b) => a - b)
    .join(',')
}
