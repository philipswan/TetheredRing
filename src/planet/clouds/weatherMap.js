import * as THREE from 'three'
import { LAYER_DRAWS, LAYER_OWN, LAYER_SPREAD, MID_SHEET_BIAS, TYPE_SHIFT, weatherClimatologyTable } from '../../physics/weather.js'
import { eddyScale, windClimatologyTable } from '../../physics/wind.js'
import { DAYS_PER_YEAR, PLANET_RADIUS, weatherDraws, weatherNoiseGlsl } from '../../physics/weatherNoise.js'

// The weather over the whole planet as two textures the clouds are drawn from (an equirectangular
// map: u = longitude / 360 + 0.5 from -180 degrees, v = (latitude + 90) / 180), worked out on the GPU
// from the same climatologies and procedural weather as src/physics/weather.js and wind.js (whose
// formulas the GLSL here repeats), so the clouds sit where the CPU's rain and wind say they are:
//   weather.texture[0]: cover (0..1), rain (mm/h), convective share (0..1), high cloud cover (0..1)
//   weather.texture[1]: low cloud base and top (km), wind east and north (m/s, at the surface)
//   weather.texture[2]: relative humidity near the surface (0..1), high cloud base (km), middle cloud
//                       base (km), the low cloud's cumuliform share (cumulus and cumulonimbus, rather than
//                       stratocumulus and stratus)
//   weather.texture[3]: the middle cloud's cover and its stratiform share (altostratus and nimbostratus,
//                       rather than altocumulus), its top (km); the low cloud's cover
// (The cloud types: see weather.js's LAYER_OWN; this repeats its formulas.)
// It is redrawn when the date changes (setDate).

const WIDTH = 1024
const HEIGHT = 512

// A table's fields as an array texture: layer = month * groups + group, 4 fields per group (RGBA).
function climatologyTexture({ rows, cols, fields, values }) {
  const groups = Math.ceil(fields.length / 4)
  const data = new Float32Array(cols * rows * 12 * groups * 4)
  for (let m = 0; m < 12; m++) {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        for (let f = 0; f < fields.length; f++) {
          const layer = m * groups + (f >> 2)
          data[((layer * rows + r) * cols + c) * 4 + (f & 3)] = values[((m * rows + r) * cols + c) * fields.length + f]
        }
      }
    }
  }
  const texture = new THREE.DataArrayTexture(data, cols, rows, 12 * groups)
  texture.type = THREE.FloatType
  texture.format = THREE.RGBAFormat
  texture.minFilter = texture.magFilter = THREE.LinearFilter
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping
  texture.needsUpdate = true
  return { texture, groups }
}

// GLSL reading field group `g` (4 fields) of a climatology at (lat, lon) degrees, months m0, m1
// (0..11) with weight fm on m1: bilinear (as wind.js's climate), or smoothed by a cubic B-spline (as
// weather.js's weatherClimate).
function climateGlsl(name, table, tex, smooth) {
  const groups = Math.ceil(table.fields.length / 4)
  const g = table.gridDegrees.toFixed(1)
  return smooth ? `
vec4 ${name}(int g, float lat, float lon, int m0, int m1, float fm) {
  float r = (lat + 90.0) / ${g}, c = lon / ${g};
  float r0 = floor(r), c0 = floor(c);
  vec4 wr = bSpline(r - r0), wc = bSpline(c - c0);
  vec4 sum = vec4(0.0);
  for (int i = 0; i < 4; i++) {
    int row = clamp(int(r0) - 1 + i, 0, ${table.rows - 1});
    for (int j = 0; j < 4; j++) {
      int col = int(c0) - 1 + j;
      col = col - ${table.cols} * int(floor(float(col) / ${table.cols.toFixed(1)}));
      float w = wr[i] * wc[j];
      sum += w * mix(texelFetch(${tex}, ivec3(col, row, m0 * ${groups} + g), 0), texelFetch(${tex}, ivec3(col, row, m1 * ${groups} + g), 0), fm);
    }
  }
  return sum;
}
` : `
vec4 ${name}(int g, float lat, float lon, int m0, int m1, float fm) {
  vec2 uv = vec2((lon / ${g} + 0.5) / ${table.cols.toFixed(1)}, ((lat + 90.0) / ${g} + 0.5) / ${table.rows.toFixed(1)});
  return mix(texture(${tex}, vec3(uv, float(m0 * ${groups} + g))), texture(${tex}, vec3(uv, float(m1 * ${groups} + g))), fm);
}
`
}

const vertexShader = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

export class WeatherMap {
  constructor() {
    const weather = weatherClimatologyTable()
    const wind = windClimatologyTable()
    const w = climatologyTexture(weather), v = climatologyTexture(wind)
    const wf = Object.fromEntries(weather.fields.map((n, i) => [n, i]))
    const vf = Object.fromEntries(wind.fields.map((n, i) => [n, i]))
    this.target = new THREE.WebGLRenderTarget(WIDTH, HEIGHT, {
      count: 4, type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: false,
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, wrapS: THREE.RepeatWrapping,
    })
    this.uniforms = {
      weatherClimate: { value: w.texture },
      windClimate: { value: v.texture },
      months: { value: new THREE.Vector3() },            // m0, m1, fm
      draws: { value: new THREE.Vector3() },             // d0, d1, f
      utcHours: { value: 0 },
    }
    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: this.uniforms,
      vertexShader,
      fragmentShader: `
precision highp float;
precision highp int;
precision highp sampler2DArray;
uniform sampler2DArray weatherClimate;
uniform sampler2DArray windClimate;
uniform vec3 months;
uniform vec3 draws;
uniform float utcHours;
in vec2 vUv;
layout(location = 0) out vec4 outWeather;
layout(location = 1) out vec4 outLayers;
layout(location = 2) out vec4 outAir;
layout(location = 3) out vec4 outTypes;
const float PI = 3.141592653589793;
${weatherNoiseGlsl}
vec4 bSpline(float f) {
  float g = 1.0 - f;
  return vec4(g * g * g, 3.0 * f * f * f - 6.0 * f * f + 4.0, -3.0 * f * f * f + 3.0 * f * f + 3.0 * f + 1.0, f * f * f) / 6.0;
}
${climateGlsl('weatherGroup', weather, 'weatherClimate', true)}
${climateGlsl('windGroup', wind, 'windClimate', false)}

float normalPdf(float x) { return exp(-0.5 * x * x) * 0.3989422804; }
float normalTail(float x) {
  float t = 1.0 / (1.0 + 0.2316419 * abs(x));
  float tail = normalPdf(x) * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0.0 ? tail : 1.0 - tail;
}
float probit(float p) {
  float q = p < 0.5 ? p : 1.0 - p;
  float t = sqrt(-2.0 * log(q));
  float x = t - (2.515517 + 0.802853 * t + 0.010328 * t * t) / (1.0 + 1.432788 * t + 0.189269 * t * t + 0.001308 * t * t * t);
  return p < 0.5 ? -x : x;
}
// weather.js coverFor and rainFor.
float coverFor(float z, float mean, float sd) {
  float p = clamp(mean, 0.005, 0.995);
  float base = probit(p);
  float k = clamp(1.3 * sd / max(normalPdf(base), 0.05), 0.2, 3.0);
  return 1.0 - normalTail(base * sqrt(1.0 + k * k) + k * z);
}
float rainFor(float z, float frequency, float rate) {
  if (frequency <= 1e-4 || rate <= 0.0) return 0.0;
  float threshold = probit(1.0 - min(frequency, 0.9999));
  if (z <= threshold) return 0.0;
  return rate * (z - threshold) / (normalPdf(threshold) / normalTail(threshold) - threshold);
}
// A layer's cover today from its long-run mean amount, at anomaly z.
float layerCover(float z, float mean) {
  float m = clamp(mean, 0.0, 0.98);
  if (m <= 0.002) return 0.0;
  return coverFor(z, m, ${LAYER_SPREAD.toFixed(2)} * sqrt(m * (1.0 - m)));
}
// A share (0..1) moved by shift in log-odds.
float shiftShare(float share, float shift) {
  float s = clamp(share, 0.01, 0.99);
  return 1.0 / (1.0 + exp(-(log(s / (1.0 - s)) + shift)));
}
vec3 unitPoint(float lat, float lon) {
  float phi = radians(lat), lambda = radians(lon);
  return vec3(cos(phi) * sin(lambda), sin(phi), cos(phi) * cos(lambda));
}
// wind.js eddies: the stream function's curl, unscaled.
vec2 eddies(float lat, float lon, int draw) {
  float h = degrees(${(20e3 / PLANET_RADIUS).toExponential(6)});
  float c = max(cos(radians(lat)), 1e-3);
  float dNorth = (weatherStream(unitPoint(lat + h, lon), draw) - weatherStream(unitPoint(lat - h, lon), draw)) / (2.0 * radians(h));
  float dEast = (weatherStream(unitPoint(lat, lon + h / c), draw) - weatherStream(unitPoint(lat, lon - h / c), draw)) / (2.0 * radians(h));
  return vec2(-dNorth, dEast);
}

void main() {
  float lon = vUv.x * 360.0 - 180.0, lat = vUv.y * 180.0 - 90.0;
  int m0 = int(months.x), m1 = int(months.y);
  float fm = months.z;
  int d0 = int(draws.x), d1 = int(draws.y);
  float fd = draws.z;
  float w = 2.0 * PI * utcHours / 24.0;
  vec4 wg[${Math.ceil(weather.fields.length / 4)}], vg[${Math.ceil(wind.fields.length / 4)}];
  for (int g = 0; g < ${Math.ceil(weather.fields.length / 4)}; g++) wg[g] = weatherGroup(g, lat, lon, m0, m1, fm);
  for (int g = 0; g < ${Math.ceil(wind.fields.length / 4)}; g++) vg[g] = windGroup(g, lat, lon, m0, m1, fm);
  #define W(f) wg[(f) / 4][(f) - 4 * ((f) / 4)]
  #define V(f) vg[(f) / 4][(f) - 4 * ((f) / 4)]
  float z = -weatherAnomaly(lat, unitPoint(lat, lon), d0, d1, fd);
  float cover = coverFor(z, W(${wf.cover}) + W(${wf.coverCos}) * cos(w) + W(${wf.coverSin}) * sin(w), W(${wf.coverSd}));
  float rain = rainFor(z, W(${wf.rainFreq}), W(${wf.rainRate}));
  float lowBase = W(${wf.lowBase});
  float lowTop = max(W(${wf.lowTop}), lowBase + 0.3);
  vec2 wind = vec2(V(${vf.u}) + V(${vf.uCos}) * cos(w) + V(${vf.uSin}) * sin(w), V(${vf.v}) + V(${vf.vCos}) * cos(w) + V(${vf.vSin}) * sin(w));
  vec2 e = (1.0 - fd) * eddies(lat, lon, d0) + fd * eddies(lat, lon, d1);
  wind += V(${vf.sigma}) / (${eddyScale().toFixed(6)} * length(vec2(1.0 - fd, fd))) * e;
  outWeather = vec4(cover, rain, clamp(W(${wf.convective}), 0.0, 1.0), 0.0);  // (a: below)
  outLayers = vec4(lowBase, lowTop, wind);
  outAir = vec4(clamp(W(${wf.humidity}) + 1.2 * W(${wf.humiditySd}) * z, 0.0, 1.0), W(${wf.highBase}), W(${wf.midBase}), 0.0);
  // The cloud types (see TYPES). (The layers' own fields: the same weather, other draws.)
  vec3 here = unitPoint(lat, lon);
  float zMid = ${Math.sqrt(1 - LAYER_OWN * LAYER_OWN).toFixed(4)} * z - ${LAYER_OWN.toFixed(4)} * weatherAnomaly(lat, here, d0 + ${LAYER_DRAWS[0]}, d1 + ${LAYER_DRAWS[0]}, fd);
  float zHigh = ${Math.sqrt(1 - LAYER_OWN * LAYER_OWN).toFixed(4)} * z - ${LAYER_OWN.toFixed(4)} * weatherAnomaly(lat, here, d0 + ${LAYER_DRAWS[1]}, d1 + ${LAYER_DRAWS[1]}, fd);
  float lowSum = W(${wf.st}) + W(${wf.sc}) + W(${wf.cu}) + W(${wf.cb});
  float cumuliform = shiftShare((W(${wf.cu}) + W(${wf.cb})) / max(lowSum, 1e-3), -${TYPE_SHIFT.toFixed(2)} * z);  // (z > 0 in a low)
  float midMean = W(${wf.ac}) + W(${wf.as_}) + W(${wf.ns});
  float midStratiform = shiftShare((W(${wf.as_}) + W(${wf.ns})) / max(midMean, 1e-3), ${TYPE_SHIFT.toFixed(2)} * zMid + ${MID_SHEET_BIAS.toFixed(2)});
  outAir.a = cumuliform;
  outTypes = vec4(layerCover(zMid, midMean), midStratiform, max(W(${wf.midTop}), W(${wf.midBase}) + 0.5), layerCover(z, lowSum));
  outWeather.a = layerCover(zHigh, W(${wf.hi}));  // (the high cloud's cover)
}
`,
      depthTest: false,
      depthWrite: false,
    })
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material)
    this.quad.frustumCulled = false
    this.scene = new THREE.Scene().add(this.quad)
    this.camera = new THREE.Camera()
    this.date = null
    this.textures = this.target.textures
  }

  /** Redraws the map for day of year `dayOfYear` (1..366) at `utcHours`, if it has changed. */
  update(renderer, dayOfYear, utcHours) {
    const key = `${dayOfYear}:${utcHours.toFixed(4)}`
    if (key === this.date) return
    this.date = key
    const m = ((dayOfYear - 1 + utcHours / 24) / DAYS_PER_YEAR) * 12 - 0.5
    const m0 = Math.floor(m)
    this.uniforms.months.value.set(((m0 % 12) + 12) % 12, (((m0 + 1) % 12) + 12) % 12, m - m0)
    const { d0, d1, f } = weatherDraws(dayOfYear, utcHours)
    this.uniforms.draws.value.set(d0, d1, f)
    this.uniforms.utcHours.value = utcHours
    const previous = renderer.getRenderTarget()
    renderer.setRenderTarget(this.target)
    renderer.render(this.scene, this.camera)
    renderer.setRenderTarget(previous)
  }

  dispose() {
    this.target.dispose()
    this.material.dispose()
    this.uniforms.weatherClimate.value.dispose()
    this.uniforms.windClimate.value.dispose()
  }
}
