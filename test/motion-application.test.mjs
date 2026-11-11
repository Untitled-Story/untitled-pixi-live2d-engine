import assert from 'node:assert/strict'
import { after as afterTests, test as nodeTest } from 'node:test'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const root = fileURLToPath(new URL('..', import.meta.url))
global.__DEV__ = false
global.__VERSION__ = 'test'
const server = await createServer({
  configFile: false,
  root,
  optimizeDeps: { noDiscovery: true, include: [] },
  resolve: { alias: { '@': `${root}/src`, '@cubism': `${root}/cubism/src` } },
  server: { middlewareMode: true },
  appType: 'custom'
})
afterTests(() => server.close())

const { MotionManager } = await server.ssrLoadModule('/src/cubism-common/MotionManager.ts')
const { InternalModel } = await server.ssrLoadModule('/src/cubism-common/InternalModel.ts')
const { Live2DLoader } = await server.ssrLoadModule('/src/factory/Live2DLoader.ts')

class FakeMotionManager extends MotionManager {
  definitions = { Tap: [{ file: 'motion.json' }] }
  groups = { idle: 'Idle' }
  motionDataType = 'json'
  created = []
  applied = []
  createMotion(data) {
    const motion = { data }
    this.created.push(motion)
    return motion
  }
  getMotionFile(definition) {
    return definition.file
  }
  applyMotionAtTime(motion, time) {
    this.applied.push([motion, time])
  }
  isFinished() {
    return false
  }
  _stopAllMotions() {}
}

nodeTest('deduplicates loads and applies a fresh motion after active motions', async () => {
  const calls = []
  const model = new InternalModel()
  model.settings = { name: 'test' }
  const manager = new FakeMotionManager(model)
  model.motionManager = {
    update: () => {
      calls.push('main')
      return true
    }
  }
  model.parallelMotionManager = [
    {
      update: () => {
        calls.push('parallel')
        return false
      }
    }
  ]
  const originalLoad = Live2DLoader.load
  let loads = 0
  Live2DLoader.load = async () => {
    loads++
    return { curves: [1] }
  }
  try {
    const [cached, queued] = await Promise.all([
      manager.loadMotion('Tap', 0),
      manager.applyMotion('Tap', 0, 'end')
    ])
    assert.equal(loads, 1)
    assert.equal(queued, true)
    assert.equal(manager.applied.length, 0)
    assert.equal(model.hasPendingMotionApplications, true)
    assert.equal(model.updateMotions({}, 0), true)
    assert.deepEqual(calls, ['main', 'parallel'])
    assert.equal(manager.applied.length, 1)
    assert.notEqual(manager.applied[0][0], cached)
    assert.equal(manager.applied[0][1], 'end')
    assert.equal(model.hasPendingMotionApplications, false)
    model.updateMotions({}, 1)
    assert.equal(manager.applied.length, 1)
    await assert.rejects(manager.applyMotion('Tap', 0, -1), RangeError)
    await assert.rejects(manager.applyMotion('Tap', 0, NaN), RangeError)
  } finally {
    Live2DLoader.load = originalLoad
  }
})

nodeTest('does not queue a motion if the manager is destroyed while loading', async () => {
  const model = new InternalModel()
  model.settings = { name: 'test' }
  const manager = new FakeMotionManager(model)
  const originalLoad = Live2DLoader.load
  let resolve
  Live2DLoader.load = () =>
    new Promise((done) => {
      resolve = done
    })
  try {
    const pending = manager.applyMotion('Tap', 0, 0)
    manager.destroy()
    resolve({ curves: [] })
    assert.equal(await pending, false)
    assert.equal(model.hasPendingMotionApplications, false)
  } finally {
    Live2DLoader.load = originalLoad
  }
})

nodeTest('modern sampling uses the loop duration and an isolated queue entry', async () => {
  const { CubismMotionManager } = await server.ssrLoadModule('/src/cubism/CubismMotionManager.ts')
  const manager = Object.create(CubismMotionManager.prototype)
  manager.parent = { coreModel: {} }
  let received
  let released = false
  const motion = {
    getLoopDuration: () => 2.5,
    setLoop: (value) => {
      assert.equal(value, false)
    },
    doUpdateParameters: (...args) => {
      received = args
    },
    release: () => {
      released = true
    }
  }
  manager.applyMotionAtTime(motion, 'end')
  assert.equal(received[0], manager.parent.coreModel)
  assert.equal(received[1], 2.5)
  assert.equal(received[2], 1)
  assert.equal(received[3].getStartTime(), 0)
  assert.equal(released, true)
})

nodeTest('legacy sampling converts seconds and uses a separate queue', async () => {
  global.AMotion = class {}
  global.Live2DMotion = class {
    updateParam() {}
  }
  let stopped = false
  global.MotionQueueManager = class {
    motions = [{ _$sr: 1 }]
    startMotion() {
      return 1
    }
    stopAllMotions() {
      stopped = true
    }
  }
  const { CubismLegacyMotionManager } = await server.ssrLoadModule(
    '/src/cubism-legacy/CubismLegacyMotionManager.ts'
  )
  const manager = Object.create(CubismLegacyMotionManager.prototype)
  manager.parent = { coreModel: {} }
  let received
  const motion = {
    getDurationMSec: () => 2500,
    updateParamExe: (...args) => {
      received = args
    }
  }
  manager.applyMotionAtTime(motion, 1.2)
  assert.equal(received[0], manager.parent.coreModel)
  assert.equal(received[1], 1200)
  assert.equal(received[2], 1)
  assert.equal(stopped, true)
})

nodeTest('expression requests are deduplicated and owned by the manager', async () => {
  const { ExpressionManager } = await server.ssrLoadModule(
    '/src/cubism-common/ExpressionManager.ts'
  )
  class FakeExpressionManager extends ExpressionManager {
    definitions = [{ file: 'happy.json' }]
    getExpressionFile(definition) {
      return definition.file
    }
    createExpression(data) {
      return { data }
    }
  }
  const manager = new FakeExpressionManager({ name: 'test' })
  const originalLoad = Live2DLoader.load
  let loads = 0
  Live2DLoader.load = async () => {
    loads++
    return { value: 1 }
  }
  try {
    const [one, two] = await Promise.all([manager.loadExpression(0), manager.loadExpression(0)])
    assert.equal(loads, 1)
    assert.equal(one, two)
    assert.equal(await manager.loadExpression(0), one)
  } finally {
    Live2DLoader.load = originalLoad
  }
})

nodeTest('motion accepts single or parallel requests and stopMotions stops both', async () => {
  const { Live2DModel } = await server.ssrLoadModule('/src/Live2DModel.ts')
  const model = Object.create(Live2DModel.prototype)
  const calls = []
  let stops = 0
  const managers = []
  model.internalModel = {
    motionManager: {
      startMotion: async (...args) => {
        calls.push(['single', ...args])
        return true
      },
      stopAllMotions: () => {
        stops++
      }
    },
    parallelMotionManager: managers,
    extendParallelMotionManager: (count) => {
      while (managers.length < count) {
        managers.push({
          startMotion: async (...args) => {
            calls.push(['parallel', ...args])
            return true
          },
          stopAllMotions: () => {
            stops++
          }
        })
      }
    }
  }
  assert.equal(await model.motion('body', 0), true)
  assert.deepEqual(
    await model.motion([
      { group: 'upper', index: 0, loop: true },
      { group: 'lower', index: 1, ignoreParamIds: ['x'] }
    ]),
    [true, true]
  )
  assert.equal(calls[0][0], 'single')
  assert.deepEqual(calls[1], [
    'parallel',
    'upper',
    0,
    undefined,
    { ignoreParamIds: undefined, loop: true }
  ])
  assert.deepEqual(calls[2], [
    'parallel',
    'lower',
    1,
    undefined,
    { ignoreParamIds: ['x'], loop: undefined }
  ])
  model.stopMotions()
  assert.equal(stops, 3)
  assert.equal(model.parallelMotion, undefined)
  assert.equal(model.motionLastFrame, undefined)
  assert.equal(model.parallelLastFrame, undefined)
})

nodeTest('parallel playback instances do not mutate each other or the cached motion', async () => {
  const { ParallelMotionManager } = await server.ssrLoadModule(
    '/src/cubism-common/ParallelMotionManager.ts'
  )
  class FakeParallelManager extends ParallelMotionManager {
    getMotionName() {
      return 'motion'
    }
    _startMotion(motion, _onFinish, ignoreParamIds, loop) {
      motion.ignored = ignoreParamIds
      motion.loop = loop
      this.started = motion
      return 0
    }
  }
  const model = new InternalModel()
  model.settings = { name: 'test' }
  const manager = new FakeMotionManager(model)
  model.motionManager = manager
  const originalLoad = Live2DLoader.load
  Live2DLoader.load = async () => ({ curves: [1] })
  try {
    const a = new FakeParallelManager(model)
    const b = new FakeParallelManager(model)
    assert.deepEqual(
      await Promise.all([
        a.startMotion('Tap', 0, undefined, { loop: true, ignoreParamIds: ['x'] }),
        b.startMotion('Tap', 0, undefined, { loop: false, ignoreParamIds: ['y'] })
      ]),
      [true, true]
    )
    assert.notEqual(a.started, b.started)
    assert.deepEqual(a.started.ignored, ['x'])
    assert.deepEqual(b.started.ignored, ['y'])
    assert.equal(a.started.loop, true)
    assert.equal(b.started.loop, false)
    const cached = await manager.loadMotion('Tap', 0)
    assert.equal(cached.loop, undefined)
    assert.equal(cached.ignored, undefined)
  } finally {
    Live2DLoader.load = originalLoad
  }
})

nodeTest('modern playback releases the independent instance on stop', async () => {
  const { CubismMotionQueueManager } = await server.ssrLoadModule(
    '/cubism/src/motion/cubismmotionqueuemanager.ts'
  )
  const { CubismMotionManager } = await server.ssrLoadModule('/src/cubism/CubismMotionManager.ts')
  const manager = Object.create(CubismMotionManager.prototype)
  manager.queueManager = new CubismMotionQueueManager()
  let released = 0
  const motion = {
    _motionData: { loop: false },
    setFinishedMotionHandler() {},
    setLoop() {},
    release() {
      released++
    }
  }
  manager._startMotion(motion)
  assert.equal(released, 0)
  manager.queueManager.stopAllMotions()
  assert.equal(released, 1)
})
