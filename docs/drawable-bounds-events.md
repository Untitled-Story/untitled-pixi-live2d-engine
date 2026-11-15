# Observing drawable bounds

`Live2DModel` emits `drawableBoundsUpdated` when its unscaled local bounds change,
or when it switches between canvas fallback bounds and drawable bounds. A loaded
model may still use fallback bounds until its first draw, particularly with Cubism 2.
Loading completion therefore does not guarantee final drawable dimensions.

Register the listener before loading to observe the complete transition:

```ts
const model = new Live2DModel()

model.on('drawableBoundsUpdated', (bounds: Live2DDrawableBounds) => {
  if (!bounds.isFallback) {
    // Notify your application's layout system here. model.bounds, width, height,
    // and any anchor update requested by the engine are available at this point.
    console.log(bounds.x, bounds.y, bounds.width, bounds.height)
  }
})

await Live2DFactory.setupLive2DModel(model, source)
app.stage.addChild(model)
```

Import `Live2DDrawableBounds` from the same engine entry point as `Live2DModel`.
The payload is an independent snapshot; retaining it does not retain a mutable
`Bounds` object. Identical updates do not emit an event. Animated geometry can
produce subsequent events, so listeners should avoid expensive work and recursive
changes to the model. Changes to position or scale alone do not trigger this local
bounds event. Notifications can occur during rendering; layout changes may take
effect on the next frame.

This event leaves the default `anchorMode: 'canvas'`, anchor calculations, loading
events, and rendering order unchanged. Integration-specific alignment APIs remain
the responsibility of the integration.
