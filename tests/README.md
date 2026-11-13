# Bounds event regression tests

From the repository root, after installing dependencies:

```sh
npm exec --yes --package=vitest -- vitest run --config tests/vitest.config.ts
```

These tests exercise `Live2DModel.updateDrawableBounds` with a minimal internal
model. Cubism runtime imports are mocked, so neither WebGL nor downloaded Cubism
SDK assets are needed. They cover fallback-to-drawable transitions, unchanged
updates, payload snapshots, anchor-update ordering and reading bounds from a
listener without re-entering the calculation.
