import { Bounds, Matrix } from 'pixi.js'
import { describe, expect, it, vi } from 'vitest'

// Exercise bounds calculation without loading either Cubism runtime or WebGL.
vi.mock('../src/cubism-common/SoundManager', () => ({ VOLUME: 1 }))
vi.mock('../src/factory/Live2DFactory', () => ({ Live2DFactory: {} }))
vi.mock('../src/factory/texture-lod', () => ({
  getTextureLODFilter: vi.fn(),
  getTextureLODPlan: vi.fn()
}))
vi.mock('../src/Automator', () => ({ Automator: {} }))
vi.mock('../src/Live2DTransform', () => ({ Live2DTransform: {} }))

import { Live2DModel, type Live2DDrawableBounds } from '../src/Live2DModel'

function createModel() {
  let rectangle: { x: number; y: number; width: number; height: number } | undefined
  const model = Object.assign(
    Object.create(Live2DModel.prototype) as {
      updateDrawableBounds(applyAnchor?: boolean): void
      readonly bounds: Bounds
    },
    {
      _bounds: new Bounds(),
      _boundsDirty: true,
      _boundsRetryAfterDraw: false,
      _didViewChangeTick: 0,
      anchorMode: 'drawable',
      onAnchorChange: vi.fn(),
      emit: vi.fn<(event: string, bounds: Live2DDrawableBounds) => boolean>(() => true),
      internalModel: {
        originalWidth: 100,
        originalHeight: 200,
        localTransform: Matrix.IDENTITY,
        getDrawableIDs: () => (rectangle ? ['body'] : []),
        getDrawableIndex: () => 0,
        getDrawableBounds: () => rectangle
      }
    }
  )
  return {
    model,
    setRectangle(value: NonNullable<typeof rectangle>) {
      rectangle = value
    }
  }
}

describe('drawableBoundsUpdated', () => {
  it('notifies when fallback bounds become drawable bounds and skips unchanged updates', () => {
    const { model, setRectangle } = createModel()
    model.updateDrawableBounds(true)
    expect(model.emit).toHaveBeenLastCalledWith('drawableBoundsUpdated', {
      x: 0,
      y: 0,
      width: 100,
      height: 200,
      isFallback: true
    })
    model.emit.mockClear()
    model.updateDrawableBounds(true)
    expect(model.emit).not.toHaveBeenCalled()

    setRectangle({ x: 10, y: 20, width: 80, height: 150 })
    model.updateDrawableBounds(true)
    expect(model.emit).toHaveBeenLastCalledWith('drawableBoundsUpdated', {
      x: 10,
      y: 20,
      width: 80,
      height: 150,
      isFallback: false
    })
    expect(model.onAnchorChange.mock.invocationCallOrder.at(-1)).toBeLessThan(
      model.emit.mock.invocationCallOrder.at(-1)!
    )
    const snapshot = model.emit.mock.calls[0][1]
    setRectangle({ x: 10, y: 20, width: 80, height: 160 })
    model.updateDrawableBounds(true)
    expect(snapshot.height).toBe(150)
  })

  it('notifies when only the fallback state changes and permits reading bounds in a listener', () => {
    const { model, setRectangle } = createModel()
    model.updateDrawableBounds()
    model.emit.mockClear()
    model.emit.mockImplementation(() => {
      expect(model.bounds.height).toBe(200)
      return true
    })
    setRectangle({ x: 0, y: 0, width: 100, height: 200 })
    model.updateDrawableBounds()
    expect(model.emit).toHaveBeenCalledTimes(1)
    expect(model.emit.mock.calls[0][1].isFallback).toBe(false)
    model.updateDrawableBounds()
    expect(model.emit).toHaveBeenCalledTimes(1)
  })
})
