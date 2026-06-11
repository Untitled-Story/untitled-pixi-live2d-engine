import type { Matrix } from 'pixi.js'
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from '@/cubism-common/constants'

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

export interface LayoutBounds {
  width: number
  height: number
}

type LayoutKey = keyof CommonLayout
type LayoutEntry = [LayoutKey, number]

function setScale(matrix: Matrix, scale: number): void {
  matrix.a = scale
  matrix.b = 0
  matrix.c = 0
  matrix.d = scale
}

function getLayoutEntries(rawLayout: CommonLayout): LayoutEntry[] {
  const entries: LayoutEntry[] = []

  for (const [key, value] of Object.entries(rawLayout)) {
    if (typeof value !== 'number') {
      continue
    }

    entries.push([key as LayoutKey, value])
  }

  return entries
}

/**
 * Applies the historical common layout transform used by this project.
 */
export function setupLayoutMatrix(
  matrix: Matrix,
  originalWidth: number,
  originalHeight: number,
  rawLayout: CommonLayout
): LayoutBounds {
  const layout = {
    width: LOGICAL_WIDTH,
    height: LOGICAL_HEIGHT,
    ...rawLayout
  }
  const layoutWidth = layout.width ?? LOGICAL_WIDTH
  const layoutHeight = layout.height ?? LOGICAL_HEIGHT

  matrix.identity()
  matrix.scale(layoutWidth / LOGICAL_WIDTH, layoutHeight / LOGICAL_HEIGHT)

  const width = originalWidth * matrix.a
  const height = originalHeight * matrix.d

  const offsetX =
    (layout.x !== undefined && layout.x - layoutWidth / 2) ||
    (layout.centerX !== undefined && layout.centerX) ||
    (layout.left !== undefined && layout.left - layoutWidth / 2) ||
    (layout.right !== undefined && layout.right + layoutWidth / 2) ||
    0

  const offsetY =
    (layout.y !== undefined && layout.y - layoutHeight / 2) ||
    (layout.centerY !== undefined && layout.centerY) ||
    (layout.top !== undefined && layout.top - layoutHeight / 2) ||
    (layout.bottom !== undefined && layout.bottom + layoutHeight / 2) ||
    0

  matrix.translate(width * offsetX, -height * offsetY)

  return {
    width,
    height
  }
}

interface CubismLayoutState {
  scale: number
  x: number
  y: number
}

function getCubismLayoutWidth(state: CubismLayoutState, aspect: number): number {
  return LOGICAL_HEIGHT * aspect * state.scale
}

function getCubismLayoutHeight(state: CubismLayoutState): number {
  return LOGICAL_HEIGHT * state.scale
}

function setCubismWidth(state: CubismLayoutState, aspect: number, width: number): void {
  state.scale = width / (LOGICAL_HEIGHT * aspect)
}

function setCubismHeight(state: CubismLayoutState, height: number): void {
  state.scale = height / LOGICAL_HEIGHT
}

function setCubismX(state: CubismLayoutState, x: number): void {
  state.x = x
}

function setCubismY(state: CubismLayoutState, y: number): void {
  state.y = y
}

function centerCubismX(state: CubismLayoutState, aspect: number, x: number): void {
  setCubismX(state, x - getCubismLayoutWidth(state, aspect) / 2)
}

function centerCubismY(state: CubismLayoutState, y: number): void {
  setCubismY(state, y - getCubismLayoutHeight(state) / 2)
}

function rightCubism(state: CubismLayoutState, aspect: number, x: number): void {
  setCubismX(state, x - getCubismLayoutWidth(state, aspect))
}

function bottomCubism(state: CubismLayoutState, y: number): void {
  setCubismY(state, y - getCubismLayoutHeight(state))
}

/**
 * Applies model3.json layout with the same two-pass semantics as
 * CubismModelMatrix.setupFromLayout(), then converts the SDK logical matrix back
 * to this renderer's top-left pixel local coordinates.
 */
export function setupCubismLayoutMatrix(
  matrix: Matrix,
  originalWidth: number,
  originalHeight: number,
  rawLayout: CommonLayout
): LayoutBounds {
  if (originalWidth <= 0 || originalHeight <= 0) {
    matrix.identity()
    return { width: 0, height: 0 }
  }

  const entries = getLayoutEntries(rawLayout)
  const aspect = originalWidth / originalHeight
  const state: CubismLayoutState = { scale: 1, x: 0, y: 0 }

  for (const [key, value] of entries) {
    if (key === 'width') {
      setCubismWidth(state, aspect, value)
    } else if (key === 'height') {
      setCubismHeight(state, value)
    }
  }

  for (const [key, value] of entries) {
    if (key === 'x') {
      setCubismX(state, value)
    } else if (key === 'y') {
      setCubismY(state, value)
    } else if (key === 'centerX') {
      centerCubismX(state, aspect, value)
    } else if (key === 'centerY') {
      centerCubismY(state, value)
    } else if (key === 'top') {
      setCubismY(state, value)
    } else if (key === 'bottom') {
      bottomCubism(state, value)
    } else if (key === 'left') {
      setCubismX(state, value)
    } else if (key === 'right') {
      rightCubism(state, aspect, value)
    }
  }

  const pixelsPerLogicalUnit = originalHeight / LOGICAL_HEIGHT
  const defaultLogicalHalfWidth = (LOGICAL_HEIGHT * aspect) / 2
  const defaultLogicalHalfHeight = LOGICAL_HEIGHT / 2

  matrix.identity()
  setScale(matrix, state.scale)
  matrix.tx =
    pixelsPerLogicalUnit * (state.x + defaultLogicalHalfWidth) - (originalWidth * state.scale) / 2
  matrix.ty =
    pixelsPerLogicalUnit * (defaultLogicalHalfHeight - state.y) - (originalHeight * state.scale) / 2

  return {
    width: originalWidth * state.scale,
    height: originalHeight * state.scale
  }
}
