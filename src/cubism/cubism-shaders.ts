import { CubismShader_WebGL } from '@cubism/rendering/cubismshader_webgl'

const modules = import.meta.glob<string>('../../cubism/Shaders/WebGL/*', {
  query: '?raw',
  import: 'default',
  eager: true
})

const sources = new Map(
  Object.entries(modules).map(([path, source]) => [path.slice(path.lastIndexOf('/') + 1), source])
)

/**
 * Cubism 5-r.5 fetches its WebGL shaders from a URL at runtime. Serve them from the bundle instead,
 * so applications do not have to host the shader files.
 */
;(
  CubismShader_WebGL.prototype as unknown as { loadShader(url: string): Promise<string> }
).loadShader = (url) => {
  const source = sources.get(url.slice(url.lastIndexOf('/') + 1))

  return source === undefined
    ? Promise.reject(new Error(`Cubism shader is not bundled: ${url}`))
    : Promise.resolve(source)
}
