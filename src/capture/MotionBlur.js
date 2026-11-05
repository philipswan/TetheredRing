import * as THREE from 'three'
import { renderToCorner } from './Supersampler.js'

// Motion blur for recordings, by temporal supersampling: each video frame is the average of several
// sub-frames rendered at moments spread over the shutter interval. This removes temporal aliasing
// (strobing, and the "wagon wheel" effect when repeated geometry such as tethers, brackets or screw
// threads passes the camera at a speed that beats with the frame rate) at the cost of rendering every
// frame several times.
//
// Each sub-frame is rendered to the canvas as usual and then copied from it, so nothing else in the
// renderer needs to know about the blur. The copies are converted from sRGB to linear light and added
// into a float buffer; the average is converted back to sRGB and drawn to the canvas, where the video
// recorder picks it up. Averaging in linear light keeps bright streaks bright, as a real shutter does.
//
//   const blur = new MotionBlur(renderer)
//   blur.begin(width, height)          // once per recording, at the output size
//   (with supersampling the canvas is larger: each sub-frame is first filtered into its bottom-left
//   output-sized corner, which is what is averaged and where the average is drawn; see Supersampler.js)
//   for each sub-frame s of n: render to the canvas, then blur.add(s === 0, 1 / n)
//   (n can differ from frame to frame: see adaptiveSubFrames)
//   blur.present()                     // the averaged frame is now on the canvas
//   blur.dispose()

// How many sub-frames a frame needs, from the camera poses across the frame's shutter interval
// (`poses`: [{ position, target }] in world metres, in order, from the shutter opening to its closing;
// see shutterTimes).
//
// Between sub-frames the camera may move `maxStep` metres, so repeated structures passing close by
// (mass-driver brackets about 5 m apart, tube joints, screw threads) move less than their own spacing
// and blur instead of strobing. Far from everything that is needlessly fine (5 m brackets 1,000 km away
// are far below a pixel), so the step may be longer: up to the distance that moves the nearest scenery
// by `maxPixels` on screen. The nearest scenery is taken to be the closer of the camera's target and the
// ground (altitude above `planetRadius`). Turning moves the whole view: at most `maxPixels` per sub-frame.
// Clamped to [minSamples, maxSamples].
export function adaptiveSubFrames(poses, { maxStep, maxPixels, pixelsPerRadian, planetRadius = 0, minSamples = 1, maxSamples = 1024 }) {
  let needed = 0
  let angle = 0
  for (let k = 1; k < poses.length; k++) {
    const a = poses[k - 1]
    const b = poses[k]
    const distance = Math.hypot(b.position[0] - a.position[0], b.position[1] - a.position[1], b.position[2] - a.position[2])
    const toTarget = Math.hypot(a.target[0] - a.position[0], a.target[1] - a.position[1], a.target[2] - a.position[2])
    const altitude = planetRadius > 0 ? Math.hypot(...a.position) - planetRadius : Infinity
    const scenery = Math.max(1, Math.min(toTarget, Math.max(1, altitude)))
    const step = Math.max(maxStep, scenery * maxPixels / pixelsPerRadian)
    needed += distance / step
    const da = a.target.map((x, i) => x - a.position[i])
    const db = b.target.map((x, i) => x - b.position[i])
    const cos = (da[0] * db[0] + da[1] * db[1] + da[2] * db[2]) / (Math.hypot(...da) * Math.hypot(...db))
    angle += Math.acos(Math.min(1, Math.max(-1, cos))) || 0
  }
  needed = Math.max(needed, maxPixels > 0 ? angle * pixelsPerRadian / maxPixels : 0)
  return Math.min(maxSamples, Math.max(minSamples, Math.ceil(needed - 1e-9)))
}

// Sub-frame moments for frame i at `fps` with `samples` sub-frames and a shutter of `shutterAngle`
// degrees (360 = the whole frame interval), centred on the frame's own moment i / fps.
export function subFrameTimes(i, fps, samples, shutterAngle) {
  const open = Math.min(360, Math.max(0, shutterAngle)) / 360
  const times = []
  for (let s = 0; s < samples; s++) times.push((i + open * ((s + 0.5) / samples - 0.5)) / fps)
  return times
}

// `count` (>= 2) moments evenly spaced from the opening of frame i's shutter to its closing, both
// included: where to measure the camera's motion over the frame (see adaptiveSubFrames).
export function shutterTimes(i, fps, count, shutterAngle) {
  const open = Math.min(360, Math.max(0, shutterAngle)) / 360
  const times = []
  for (let k = 0; k < count; k++) times.push((i + open * (k / (count - 1) - 0.5)) / fps)
  return times
}

const VERTEX = /* glsl */`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

const ACCUMULATE = /* glsl */`
uniform sampler2D map;
uniform float weight;
varying vec2 vUv;
vec3 srgbToLinear(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
}
void main() {
  vec4 t = texture2D(map, vUv);
  gl_FragColor = vec4(srgbToLinear(t.rgb), t.a) * weight;
}
`

const PRESENT = /* glsl */`
uniform sampler2D map;
varying vec2 vUv;
vec3 linearToSrgb(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
void main() {
  vec4 t = texture2D(map, vUv);
  gl_FragColor = vec4(linearToSrgb(clamp(t.rgb, 0.0, 1.0)), t.a);
}
`

export class MotionBlur {
  constructor(renderer) {
    this.renderer = renderer
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    const quad = (material) => {
      const scene = new THREE.Scene()
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material)
      mesh.frustumCulled = false
      scene.add(mesh)
      return scene
    }
    this.accumulateMaterial = new THREE.ShaderMaterial({
      uniforms: { map: { value: null }, weight: { value: 1 } },
      vertexShader: VERTEX,
      fragmentShader: ACCUMULATE,
      depthTest: false,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
    })
    this.presentMaterial = new THREE.ShaderMaterial({
      uniforms: { map: { value: null } },
      vertexShader: VERTEX,
      fragmentShader: PRESENT,
      depthTest: false,
      depthWrite: false,
      blending: THREE.NoBlending,
    })
    this.accumulateScene = quad(this.accumulateMaterial)
    this.presentScene = quad(this.presentMaterial)
    this.frame = null
    this.sum = null
  }

  // Allocates the buffers for output size width x height.
  begin(width, height) {
    this.width = width
    this.height = height
    this.disposeBuffers()
    // Float sums need float blending; otherwise half floats (enough for a few dozen sub-frames).
    const type = this.renderer.extensions.has('EXT_float_blend') ? THREE.FloatType : THREE.HalfFloatType
    this.sum = new THREE.WebGLRenderTarget(width, height, { type, format: THREE.RGBAFormat, depthBuffer: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter })
    this.frame = new THREE.FramebufferTexture(width, height)
    this.accumulateMaterial.uniforms.map.value = this.frame
    this.presentMaterial.uniforms.map.value = this.sum.texture
  }

  // Adds what is in the canvas's output-sized corner now, with `weight` (1 / sub-frames). `first` starts a new frame.
  add(first, weight) {
    const r = this.renderer
    r.copyFramebufferToTexture(this.frame)
    const previousTarget = r.getRenderTarget()
    r.setRenderTarget(this.sum)
    if (first) {
      const color = r.getClearColor(new THREE.Color())
      const alpha = r.getClearAlpha()
      r.setClearColor(0x000000, 0)
      r.clear(true, false, false)
      r.setClearColor(color, alpha)
    }
    this.accumulateMaterial.uniforms.weight.value = weight
    r.render(this.accumulateScene, this.camera)
    r.setRenderTarget(previousTarget)
  }

  // Draws the averaged frame to the canvas's output-sized corner.
  present() {
    renderToCorner(this.renderer, this.presentScene, this.camera, this.width, this.height)
  }

  disposeBuffers() {
    this.sum?.dispose()
    this.frame?.dispose()
    this.sum = null
    this.frame = null
  }

  dispose() {
    this.disposeBuffers()
    for (const scene of [this.accumulateScene, this.presentScene]) scene.children[0].geometry.dispose()
    this.accumulateMaterial.dispose()
    this.presentMaterial.dispose()
  }
}
