import { Application } from 'pixi.js'
import { Live2DModel } from '@/Live2DModel'

const app = new Application()
await app.init({
  resizeTo: window,
  preference: 'webgl',
  autoDensity: true,
  resolution: window.devicePixelRatio
})

document.body.appendChild(app.canvas)

// Configure Cubism Modern work memory (optional, default is 16MB)
// Increase this value when loading multiple or high-complexity models
// configureCubismSDK({
//   memorySizeMB: 32
// })

const model = await Live2DModel.from('http://127.0.0.1:7878/model3.json')
model.anchor.set(0.5)
model.position.set(app.screen.width / 2, app.screen.height / 2)

app.stage.addChild(model)
