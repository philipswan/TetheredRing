import * as THREE from 'three'
import { FrameCapture } from './FrameCapture.js'

// Supersampling for recordings: every frame is rendered at `factor` times the output resolution in
// each direction (on top of the canvas's own MSAA) and filtered down to the output size, which
// smooths edges, thin structures (tethers, cables) and fine texture far better than MSAA alone.
//
// The canvas itself is enlarged (App.setRenderSize with pixelRatio = factor), so everything that sizes
// itself from the drawing buffer (the clouds' targets, pixel-based level of detail, structure-line
// coverage) works at the higher resolution without knowing about it. After each render the canvas is
// copied into a texture and filtered into its bottom-left output-sized corner; motion blur then
// averages that corner (MotionBlur.add copies the output-sized region from the canvas origin), and
// finally the corner is copied into a separate 2D canvas of the output size, which the video encoder
// reads. Restore the full scene after consuming the corner so this work area is not displayed.
//
//   const ss = new Supersampler(renderer)
//   ss.begin(width, height)               // after the canvas has been enlarged; once per recording
//   for each render: render to the canvas, then ss.resolve()
//   (motion blur: blur.add() after each resolve, blur.present() at the end of the frame)
//   ss.publish()                          // the output frame is now in ss.canvas
//   ss.restoreDisplay()                   // hide the processing corner after reading it
//   ss.dispose()
//
// The filter is Mitchell-Netravali (B = C = 1/3) over a radius of two output pixels, applied in
// linear light: smooth, with little ringing or aliasing, and slightly sharper than a box or tent.
//
// Memory at 3840 x 2160 with factor 2: the 7680 x 4320 canvas with 4x MSAA (about 1.1 GB of colour
// and depth), its resolve buffer and the copy texture (133 MB each), plus the clouds' half-resolution
// targets. Factors are limited so the enlarged canvas fits the GPU's largest render size.

export const SUPERSAMPLE_FACTORS = [1, 1.5, 2, 3, 4]

// The Mitchell-Netravali filter (B = C = 1/3), support [-2, 2]; its weights over unit-spaced samples
// sum to 1.
export function mitchell(x) {
  const a = Math.abs(x)
  if (a < 1) return (7 * a * a * a - 12 * a * a + 16 / 3) / 6
  if (a < 2) return (-7 / 3 * a * a * a + 12 * a * a - 20 * a + 32 / 3) / 6
  return 0
}

// The supersampling factor actually used for `factor` at output size width x height, when the GPU
// renders at most `maxSize` pixels in either direction: the largest of SUPERSAMPLE_FACTORS (or the
// requested factor itself) that fits, at least 1.
export function clampSupersample(factor, width, height, maxSize) {
  const f = Math.max(1, Number(factor) || 1)
  const fits = (s) => Math.round(width * s) <= maxSize && Math.round(height * s) <= maxSize
  if (fits(f)) return f
  const smaller = SUPERSAMPLE_FACTORS.filter(s => s < f && fits(s))
  return smaller.length ? smaller[smaller.length - 1] : 1
}

// The largest render size this renderer supports in either direction.
export function maxRenderSize(renderer) {
  const gl = renderer.getContext()
  const viewport = gl.getParameter(gl.MAX_VIEWPORT_DIMS)
  return Math.min(gl.getParameter(gl.MAX_RENDERBUFFER_SIZE), renderer.capabilities.maxTextureSize, viewport[0], viewport[1])
}

// Draws `scene` into the bottom-left width x height drawing-buffer pixels of the canvas.
export function renderToCorner(renderer, scene, camera, width, height) {
  const previousTarget = renderer.getRenderTarget()
  const viewport = renderer.getViewport(new THREE.Vector4())
  const ratio = renderer.getPixelRatio()
  renderer.setRenderTarget(null)
  // (setViewport rounds viewport x pixel ratio, so these land on whole pixels.)
  renderer.setViewport(0, 0, width / ratio, height / ratio)
  renderer.render(scene, camera)
  renderer.setViewport(viewport)
  renderer.setRenderTarget(previousTarget)
}

// Makes the canvas opaque as it is seen on the page (over the page's black background), keeping its
// colours. The canvas has an alpha channel (enableBackgroundAlpha), and where the sky is drawn over a
// clear background its alpha is near 0; a video frame taken from it would un-premultiply those pixels
// into white. Only the alpha channel is written (to 1).
export class OpaqueCanvas {
  constructor(renderer) {
    this.renderer = renderer
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    this.material = new THREE.ShaderMaterial({
      vertexShader: 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: 'void main() { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); }',
      depthTest: false,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.ZeroFactor,
      blendDst: THREE.OneFactor,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.ZeroFactor,
    })
    this.scene = new THREE.Scene()
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material)
    mesh.frustumCulled = false
    this.scene.add(mesh)
  }

  // Makes the bottom-left width x height drawing-buffer pixels opaque.
  apply(width, height) {
    renderToCorner(this.renderer, this.scene, this.camera, width, height)
  }

  dispose() {
    this.scene.children[0].geometry.dispose()
    this.material.dispose()
  }
}

const VERTEX = /* glsl */`
void main() {
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

// Each output pixel: the Mitchell-weighted sum of the source texels within two output pixels of its
// centre, in linear light. (Weights are normalised by their sum, so the edges and non-integer factors
// come out right.)
const DOWNSAMPLE = /* glsl */`
#define MAX_TAPS 18
uniform sampler2D map;
uniform vec2 sourceSize;
uniform vec2 factor;
uniform bool displayOnly;
vec3 srgbToLinear(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
}
vec3 linearToSrgb(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
float mitchell(float x) {
  float a = abs(x);
  if (a < 1.0) return (7.0 * a * a * a - 12.0 * a * a + 16.0 / 3.0) / 6.0;
  if (a < 2.0) return (-7.0 / 3.0 * a * a * a + 12.0 * a * a - 20.0 * a + 32.0 / 3.0) / 6.0;
  return 0.0;
}
void main() {
  if (displayOnly) {
    gl_FragColor = texture2D(map, gl_FragCoord.xy / sourceSize);
    return;
  }
  // This output pixel's centre, in source texels.
  // (The viewport is the output-sized corner, so gl_FragCoord is the output pixel's centre.)
  vec2 centre = gl_FragCoord.xy * factor;
  vec2 first = floor(centre - 2.0 * factor + 0.5);
  float wx[MAX_TAPS];
  float wy[MAX_TAPS];
  ivec2 n = ivec2(min(vec2(float(MAX_TAPS)), ceil(4.0 * factor)));
  for (int i = 0; i < MAX_TAPS; i++) {
    if (i >= n.x && i >= n.y) break;
    wx[i] = i < n.x ? mitchell((first.x + float(i) + 0.5 - centre.x) / factor.x) : 0.0;
    wy[i] = i < n.y ? mitchell((first.y + float(i) + 0.5 - centre.y) / factor.y) : 0.0;
  }
  vec3 sum = vec3(0.0);
  float total = 0.0;
  for (int j = 0; j < MAX_TAPS; j++) {
    if (j >= n.y) break;
    float y = first.y + float(j);
    if (y < 0.0 || y >= sourceSize.y) continue;
    for (int i = 0; i < MAX_TAPS; i++) {
      if (i >= n.x) break;
      float x = first.x + float(i);
      if (x < 0.0 || x >= sourceSize.x) continue;
      float w = wx[i] * wy[j];
      sum += w * srgbToLinear(texture2D(map, (vec2(x, y) + 0.5) / sourceSize).rgb);
      total += w;
    }
  }
  gl_FragColor = vec4(linearToSrgb(clamp(sum / total, 0.0, 1.0)), 1.0);
}
`

export class Supersampler {
  // `canvas`: the output canvas to copy finished frames to (a new one if not given).
  constructor(renderer, canvas = document.createElement('canvas')) {
    this.renderer = renderer
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        map: { value: null },
        sourceSize: { value: new THREE.Vector2() },
        factor: { value: new THREE.Vector2(1, 1) },
        displayOnly: { value: false },
      },
      vertexShader: VERTEX,
      fragmentShader: DOWNSAMPLE,
      depthTest: false,
      depthWrite: false,
      blending: THREE.NoBlending,
    })
    this.scene = new THREE.Scene()
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material)
    mesh.frustumCulled = false
    this.scene.add(mesh)
    this.source = null
    this.canvas = canvas
    this.capture = null
    this.width = 0
    this.height = 0
  }

  // Output size width x height; the canvas must already be at its enlarged size.
  begin(width, height) {
    this.disposeBuffers()
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2())
    this.width = width
    this.height = height
    this.source = new THREE.FramebufferTexture(size.x, size.y)
    this.source.minFilter = this.source.magFilter = THREE.NearestFilter
    const u = this.material.uniforms
    u.map.value = this.source
    u.sourceSize.value.copy(size)
    u.factor.value.set(size.x / width, size.y / height)
    this.capture = new FrameCapture(this.renderer, this.canvas, width, height, size.x, size.y)
  }

  // Filters what is on the (enlarged) canvas into its bottom-left output-sized corner.
  resolve() {
    this.renderer.copyFramebufferToTexture(this.source)
    renderToCorner(this.renderer, this.scene, this.camera, this.width, this.height)
  }

  // Restore the original full-size scene only after capture or motion-blur accumulation has read the corner.
  restoreDisplay() {
    const u = this.material.uniforms
    u.displayOnly.value = true
    try {
      renderToCorner(this.renderer, this.scene, this.camera, u.sourceSize.value.x, u.sourceSize.value.y)
    }
    finally { u.displayOnly.value = false }
  }

  // Copies the output-sized corner into this.canvas (the encoder's source). Call it right after the
  // frame is finished, in the same task: the WebGL canvas is only readable until it is composited.
  publish() {
    this.capture.capture()
  }

  disposeBuffers() {
    this.source?.dispose()
    this.source = null
  }

  dispose() {
    this.disposeBuffers()
    this.scene.children[0].geometry.dispose()
    this.material.dispose()
  }
}
