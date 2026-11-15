// Cubism color/mask equations follow the vendored SDK's premultiplied-alpha path.
// Reference: cubism/src/rendering/cubismshader_webgl.ts (Live2D Open Software license).
export const modelShader = /* wgsl */ `
struct Params {
  matrix: mat4x4<f32>,
  multiply: vec4<f32>,
  screen: vec4<f32>,
  options: vec4<f32>,
  tint: vec4<f32>,
}
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var atlasSampler: sampler;
@group(0) @binding(2) var atlas: texture_2d<f32>;
@group(0) @binding(3) var maskTexture: texture_2d<f32>;
@group(0) @binding(4) var maskSampler: sampler;

struct VertexOut {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) maskUv: vec2<f32>,
}
@vertex fn vertexMain(@location(0) position: vec2<f32>, @location(1) uv: vec2<f32>) -> VertexOut {
  var out: VertexOut;
  let clip = params.matrix * vec4<f32>(position, 0.0, 1.0);
  out.position = clip;
  out.uv = vec2<f32>(uv.x, 1.0 - uv.y);
  out.maskUv = vec2<f32>(clip.x * 0.5 + 0.5, 0.5 - clip.y * 0.5);
  return out;
}
@fragment fn fragmentMain(in: VertexOut) -> @location(0) vec4<f32> {
  let tex = textureSample(atlas, atlasSampler, in.uv);
  let multiplied = tex.rgb * params.multiply.rgb;
  let screened = multiplied + params.screen.rgb * tex.a - multiplied * params.screen.rgb;
  var color = vec4<f32>(screened, tex.a) * params.tint * params.options.x;
  // Sample unconditionally: derivatives must remain in uniform control flow.
  let inverseCoverage = textureSample(maskTexture, maskSampler, in.maskUv).r;
  if (params.options.y > 1.5) {
    color *= inverseCoverage;
  } else if (params.options.y > 0.5) {
    color *= 1.0 - inverseCoverage;
  }
  return color;
}
@fragment fn fragmentMask(in: VertexOut) -> @location(0) vec4<f32> {
  let alpha = textureSample(atlas, atlasSampler, in.uv).a;
  return vec4<f32>(alpha);
}
`
