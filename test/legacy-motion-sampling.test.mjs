import assert from 'node:assert/strict'
import { after as afterTests, test as nodeTest } from 'node:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { runInThisContext } from 'node:vm'
import { createServer } from 'vite'

const root = fileURLToPath(new URL('..', import.meta.url))
global.__DEV__ = false
global.__VERSION__ = 'test'
global.window = global
Object.defineProperty(global, 'navigator', { value: { userAgent: 'node' }, configurable: true })
runInThisContext(readFileSync(new URL('../Core/live2d.min.js', import.meta.url), 'utf8'))

const server = await createServer({
  configFile: false,
  root,
  optimizeDeps: { noDiscovery: true, include: [] },
  resolve: { alias: { '@': `${root}/src`, '@cubism': `${root}/cubism/src` } },
  server: { middlewareMode: true, ws: false },
  appType: 'custom'
})
afterTests(() => server.close())

nodeTest('Cubism 2 samples actual motion frames at the requested time', async () => {
  const { CubismLegacyMotionManager } = await server.ssrLoadModule(
    '/src/cubism-legacy/CubismLegacyMotionManager.ts'
  )
  const manager = Object.create(CubismLegacyMotionManager.prototype)
  const values = {}
  const context = { getParamMax: () => 10, getParamMin: () => -10, getParamFloat: () => 0 }
  manager.parent = {
    coreModel: {
      setParamFloat(id, value) {
        values[id] = value
      },
      getParamIndex(id) {
        return id
      },
      getModelContext() {
        return context
      }
    }
  }
  const data = new TextEncoder().encode(
    '# Live2D Animator Motion Data\r\n$fps=30\r\n\r\n$fadein=1000\r\n\r\n$fadeout=1000\r\n\r\nPARAM_ANGLE_X=0,1,2,3\r\n'
  )
  const motion = global.Live2DMotion.loadMotion(data.buffer)
  manager.applyMotionAtTime(motion, 0)
  assert.equal(values.PARAM_ANGLE_X, 0)
  manager.applyMotionAtTime(motion, 1 / 30)
  assert.ok(Math.abs(values.PARAM_ANGLE_X - 1) < 1e-6)
})
