import type { Matrix, Texture, WebGPURenderer } from 'pixi.js'
import { alignedSize, blendState, maskKey, paddedIndices, type BlendMode } from './render-math'
import { modelShader } from './shaders'

type DrawableColor = { r: number; g: number; b: number; a: number }

/** Geometry and per-frame values consumed by the shared Cubism GPU backend. */
export interface DrawableModel {
  getDrawableCount(): number
  getDrawableMaskCounts(): Int32Array
  getDrawableMasks(): Int32Array[]
  getDrawableTextureIndex(index: number): number
  getDrawableVertices(index: number): Float32Array
  getDrawableVertexUvs(index: number): Float32Array
  getDrawableVertexIndices(index: number): Uint16Array
  getDrawableVertexIndexCount(index: number): number
  getMultiplyColor(index: number): DrawableColor
  getScreenColor(index: number): DrawableColor
  getDrawableOpacity(index: number): number
  getDrawableInvertedMaskBit(index: number): boolean
  getDrawableBlendMode(index: number): number
  getDrawableCulling(index: number): boolean
  getDrawableRenderOrders(): Int32Array
  getDrawableDynamicFlagIsVisible(index: number): boolean
}

type Mesh = {
  positions: GPUBuffer
  uvs: GPUBuffer
  indices: GPUBuffer
  indexCount: number
  mainBinding?: GPUBindGroup
  maskBinding?: GPUBindGroup
}

type MaskGroup = {
  sources: number[]
  texture: GPUTexture
  view: GPUTextureView
}

/** Native Cubism drawing on Pixi's device and command encoder. Owns no SDK files. */
export class WebGPULive2DRenderer {
  readonly device: GPUDevice
  private readonly model: DrawableModel
  private readonly layout: GPUBindGroupLayout
  private readonly pipelineLayout: GPUPipelineLayout
  private readonly shader: GPUShaderModule
  private readonly uniform: GPUBuffer
  private readonly uniformData: Float32Array
  private readonly uniformStride: number
  private readonly maskSampler: GPUSampler
  private readonly meshes: Mesh[] = []
  private readonly masks = new Map<string, MaskGroup>()
  private readonly drawableMasks: (MaskGroup | undefined)[] = []
  private atlases: GPUTexture[] = []
  private atlasSamplers: GPUSampler[] = []
  private readonly pipelines = new Map<string, GPURenderPipeline>()
  private readonly white: GPUTexture
  private readonly whiteView: GPUTextureView
  private _destroyed = false

  get destroyed(): boolean {
    return this._destroyed
  }

  constructor(
    private readonly renderer: WebGPURenderer,
    model: DrawableModel,
    private readonly meshFrontFace?: GPUFrontFace
  ) {
    const device = renderer.gpu.device
    this.device = device
    this.model = model
    const maskSize = 512
    this.uniformStride = alignedSize(128, device.limits.minUniformBufferOffsetAlignment)
    const count = model.getDrawableCount()
    this.uniformData = new Float32Array((count * this.uniformStride) / 4)
    this.uniform = device.createBuffer({
      label: 'Live2D per-draw uniform slots',
      size: Math.max(this.uniformStride, this.uniformData.byteLength),
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    })
    this.layout = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform', hasDynamicOffset: true, minBindingSize: 128 }
        },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 4, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } }
      ]
    })
    this.pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [this.layout] })
    this.shader = device.createShaderModule({ label: 'Live2D WGSL', code: modelShader })
    this.maskSampler = device.createSampler({
      minFilter: 'linear',
      magFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge'
    })
    this.white = this.texture(1, 1, 'Fallback unmasked texture')
    device.queue.writeTexture(
      { texture: this.white },
      new Uint8Array([255, 255, 255, 255]),
      {},
      [1, 1]
    )
    const counts = model.getDrawableMaskCounts()
    const masks = model.getDrawableMasks()
    for (let i = 0; i < count; i++) {
      if (!counts[i]) continue
      const key = maskKey(masks[i]!, counts[i]!)
      let group = this.masks.get(key)
      if (!group) {
        const texture = this.texture(maskSize, maskSize, `Mask ${key}`)
        group = { sources: key.split(',').map(Number), texture, view: texture.createView() }
        this.masks.set(key, group)
      }
      this.drawableMasks[i] = group
    }
    this.whiteView = this.white.createView()
    for (let i = 0; i < count; i++) {
      this.meshes.push({
        positions: this.buffer(
          model.getDrawableVertices(i),
          GPUBufferUsage.VERTEX,
          'Dynamic positions'
        ),
        uvs: this.buffer(model.getDrawableVertexUvs(i), GPUBufferUsage.VERTEX, 'Static UVs'),
        indices: this.buffer(
          paddedIndices(model.getDrawableVertexIndices(i)),
          GPUBufferUsage.INDEX,
          'Static indices'
        ),
        indexCount: model.getDrawableVertexIndexCount(i)
      })
    }
  }

  private texture(width: number, height: number, label: string): GPUTexture {
    return this.device.createTexture({
      label,
      size: [width, height],
      format: 'rgba8unorm',
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.RENDER_ATTACHMENT |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.COPY_SRC
    })
  }

  private buffer(
    data: Float32Array | Uint16Array,
    usage: GPUBufferUsageFlags,
    label: string
  ): GPUBuffer {
    const buffer = this.device.createBuffer({
      label,
      size: alignedSize(data.byteLength, 4),
      usage: usage | GPUBufferUsage.COPY_DST
    })
    if (data.byteLength)
      this.device.queue.writeBuffer(buffer, 0, data.buffer, data.byteOffset, data.byteLength)
    return buffer
  }

  private bind(atlas: GPUTextureView, mask: GPUTextureView, sampler: GPUSampler): GPUBindGroup {
    return this.device.createBindGroup({
      layout: this.layout,
      entries: [
        { binding: 0, resource: { buffer: this.uniform, size: 128 } },
        { binding: 1, resource: sampler },
        { binding: 2, resource: atlas },
        { binding: 3, resource: mask },
        { binding: 4, resource: this.maskSampler }
      ]
    })
  }

  private pipeline(
    mode: BlendMode,
    cull: boolean,
    mirrored: boolean,
    format: GPUTextureFormat = 'rgba8unorm',
    samples = 1,
    depthStencil?: GPUDepthStencilState,
    writeMask = GPUColorWrite.ALL
  ): GPURenderPipeline {
    const key = JSON.stringify([mode, cull, mirrored, format, samples, depthStencil, writeMask])
    let pipeline = this.pipelines.get(key)
    if (!pipeline) {
      pipeline = this.device.createRenderPipeline({
        label: `Live2D ${key}`,
        layout: this.pipelineLayout,
        vertex: {
          module: this.shader,
          entryPoint: 'vertexMain',
          buffers: [
            { arrayStride: 8, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }] },
            { arrayStride: 8, attributes: [{ shaderLocation: 1, offset: 0, format: 'float32x2' }] }
          ]
        },
        fragment: {
          module: this.shader,
          entryPoint: mode === 'mask' ? 'fragmentMask' : 'fragmentMain',
          targets: [{ format, blend: blendState(mode), writeMask }]
        },
        depthStencil,
        multisample: { count: samples },
        primitive: {
          topology: 'triangle-list',
          cullMode: cull ? 'back' : 'none',
          frontFace: mirrored ? 'cw' : 'ccw'
        }
      })
      this.pipelines.set(key, pipeline)
    }
    return pipeline
  }

  render(
    transform: Matrix,
    textures: Texture[],
    opacity: number,
    color = { r: 1, g: 1, b: 1, a: 1 }
  ): void {
    if (this.destroyed) throw new Error('Live2D WebGPU renderer has been destroyed.')
    const { renderer } = this
    const matrix = new Float32Array([
      transform.a,
      transform.b,
      0,
      0,
      transform.c,
      transform.d,
      0,
      0,
      0,
      0,
      1,
      0,
      transform.tx,
      transform.ty,
      0,
      1
    ])
    const atlases = textures.map((texture) => renderer.texture.getGpuSource(texture.source))
    const samplers = textures.map((texture) => renderer.texture.getGpuSampler(texture.source.style))
    if (
      atlases.some((atlas, i) => atlas !== this.atlases[i]) ||
      samplers.some((sampler, i) => sampler !== this.atlasSamplers[i])
    ) {
      this.atlases = atlases
      this.atlasSamplers = samplers
      const views = atlases.map((atlas) => atlas.createView())
      for (let i = 0; i < this.meshes.length; i++) {
        const textureIndex = this.model.getDrawableTextureIndex(i)
        const atlas = views[textureIndex]
        const sampler = samplers[textureIndex]!
        if (!atlas) throw new Error(`Drawable ${i} references a missing texture.`)
        this.meshes[i]!.mainBinding = this.bind(
          atlas,
          this.drawableMasks[i]?.view ?? this.whiteView,
          sampler
        )
        this.meshes[i]!.maskBinding = this.bind(atlas, this.whiteView, sampler)
      }
    }
    const target = renderer.renderTarget.renderTarget
    const gpuTarget = renderer.renderTarget.getGpuRenderTarget(target)
    if (target.colorTextures.length !== 1)
      throw new Error('Live2D WebGPU requires one color attachment.')
    const format = gpuTarget.contexts[0]
      ? gpuTarget.contexts[0].getCurrentTexture().format
      : renderer.texture.getGpuSource(target.colorTexture).format
    // Pixi 8 has no public getter for the active stencil descriptor / color write mask.
    // Keep this dependency local; never modify Pixi's pipeline or blend caches.
    const state = renderer.pipeline as unknown as {
      _stencilState?: Omit<GPUDepthStencilState, 'format'>
      _colorMask: number
    }
    const depthStencil: GPUDepthStencilState | undefined = target.depthStencilTexture
      ? {
          ...state._stencilState,
          format: 'depth24plus-stencil8',
          depthWriteEnabled: false,
          depthCompare: 'always'
        }
      : undefined
    const resume = (): void => {
      renderer.renderTarget.adaptor.startRenderPass(
        target,
        false,
        undefined,
        renderer.renderTarget.viewport
      )
      // Reapply the current stencil reference after beginning a new pass.
      renderer.renderTarget.onRenderTargetChange.emit(target)
    }
    renderer.encoder.endRenderPass()
    const encoder = renderer.encoder.commandEncoder
    const { model } = this
    for (let i = 0; i < this.meshes.length; i++) {
      const offset = (i * this.uniformStride) / 4
      this.uniformData.set(matrix, offset)
      this.uniformData.set([color.r, color.g, color.b, 1], offset + 28)
      const multiply = model.getMultiplyColor(i)
      const screen = model.getScreenColor(i)
      this.uniformData.set([multiply.r, multiply.g, multiply.b, multiply.a], offset + 16)
      this.uniformData.set([screen.r, screen.g, screen.b, screen.a], offset + 20)
      this.uniformData.set(
        [
          model.getDrawableOpacity(i) * opacity * color.a,
          this.drawableMasks[i] ? (model.getDrawableInvertedMaskBit(i) ? 2 : 1) : 0,
          0,
          0
        ],
        offset + 24
      )
    }
    this.upload(encoder)
    const mirrored = matrix[0]! * matrix[5]! - matrix[1]! * matrix[4]! < 0
    const draw = (pass: GPURenderPassEncoder, index: number, mask: boolean): void => {
      const mesh = this.meshes[index]!
      if (!mesh.indexCount) return
      const mode = mask
        ? 'mask'
        : ((['normal', 'add', 'multiply'] as const)[model.getDrawableBlendMode(index)] ?? 'normal')
      pass.setPipeline(
        this.pipeline(
          mode,
          model.getDrawableCulling(index),
          mask || !this.meshFrontFace ? mirrored : this.meshFrontFace === 'cw',
          mask ? 'rgba8unorm' : format,
          mask ? 1 : gpuTarget.msaaSamples,
          mask ? undefined : depthStencil,
          mask ? GPUColorWrite.ALL : state._colorMask
        )
      )
      pass.setBindGroup(0, mask ? mesh.maskBinding! : mesh.mainBinding!, [
        index * this.uniformStride
      ])
      pass.setVertexBuffer(0, mesh.positions)
      pass.setVertexBuffer(1, mesh.uvs)
      pass.setIndexBuffer(mesh.indices, 'uint16')
      pass.drawIndexed(mesh.indexCount)
    }
    try {
      for (const group of this.masks.values()) {
        const pass = encoder.beginRenderPass({
          label: 'Live2D mask',
          colorAttachments: [
            {
              view: group.view,
              clearValue: { r: 1, g: 1, b: 1, a: 1 },
              loadOp: 'clear',
              storeOp: 'store'
            }
          ]
        })
        // Deliberately regenerate all mask sources; do not trust reset dynamic flags.
        for (const index of group.sources) draw(pass, index, true)
        pass.end()
      }
      resume()
      const pass = renderer.encoder.renderPassEncoder
      const orders = model.getDrawableRenderOrders()
      const indices = this.meshes.map((_, index) => index).sort((a, b) => orders[a]! - orders[b]!)
      for (const index of indices) {
        if (model.getDrawableDynamicFlagIsVisible(index) && model.getDrawableOpacity(index) > 0)
          draw(pass, index, false)
      }
    } finally {
      // A fresh managed pass clears Pixi's cached pipeline, buffers and bind groups.
      resume()
    }
  }

  private upload(encoder: GPUCommandEncoder): void {
    const chunks = [
      { buffer: this.uniform, data: this.uniformData },
      ...this.meshes.map((mesh, i) => ({
        buffer: mesh.positions,
        data: this.model.getDrawableVertices(i)
      }))
    ].filter(({ data }) => data.byteLength > 0)
    const size = chunks.reduce((sum, { data }) => sum + data.byteLength, 0)
    if (!size) return
    // One staging buffer per model draw. Copies preserve upload order when the same
    // model is drawn twice in one command buffer; queue.writeBuffer cannot do that.
    const staging = this.device.createBuffer({
      size,
      usage: GPUBufferUsage.COPY_SRC,
      mappedAtCreation: true
    })
    const mapped = new Uint8Array(staging.getMappedRange())
    let offset = 0
    for (const { data } of chunks) {
      mapped.set(new Uint8Array(data.buffer, data.byteOffset, data.byteLength), offset)
      offset += data.byteLength
    }
    staging.unmap()
    offset = 0
    for (const { buffer, data } of chunks) {
      encoder.copyBufferToBuffer(staging, offset, buffer, 0, data.byteLength)
      offset += data.byteLength
    }
    void this.renderer.encoder.commandFinished.then(() => staging.destroy())
  }

  destroy(): void {
    if (this.destroyed) return
    this._destroyed = true
    for (const mesh of this.meshes) {
      mesh.positions.destroy()
      mesh.uvs.destroy()
      mesh.indices.destroy()
    }
    for (const group of this.masks.values()) group.texture.destroy()
    this.uniform.destroy()
    this.white.destroy()
    this.pipelines.clear()
  }
}
