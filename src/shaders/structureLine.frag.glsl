// Thin structural lines: a cable of the line's colour at structureBrightness, in the light on it,
// covering vCoverage of its pixel, over what is behind it (premultiplied alpha; see
// structureLine.vert.glsl and src/scene/structureLines.js).
#include <common>
#include <logdepthbuf_pars_fragment>
#include <fog_pars_fragment>

uniform vec3 color;
uniform float structureBrightness;
varying float vCoverage;
varying vec3 vLight;

void main() {
  #include <logdepthbuf_fragment>
  gl_FragColor = vec4(color * structureBrightness * vLight, 1.0);
  #include <colorspace_fragment>
  float coverage = vCoverage;
#ifdef USE_FOG
  // In the water (Ocean's fog) and seen from above it (sea fog, seaDarkening.js), the line fades into
  // what is behind it rather than turning into the fog colour.
  #ifdef FOG_EXP2
    float structureFog = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
  #else
    float structureFog = smoothstep(fogNear, fogFar, vFogDepth);
  #endif
  coverage *= (1.0 - structureFog) * (1.0 - vSeaFog);
#endif
  // Stochastic rounding keeps sub-pixel strands visible on an 8-bit target. Bound the
  // step by contrast against both black and white: using only the cable's brightness
  // makes a dim cable's alpha jump almost to 1, cutting dark streaks into bright haze.
  float noise = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  vec3 lineColor = clamp(gl_FragColor.rgb, 0.0, 1.0);
  float brightest = max(lineColor.r, max(lineColor.g, lineColor.b));
  float darkest = min(lineColor.r, min(lineColor.g, lineColor.b));
  float contrastBound = max(brightest, 1.0 - darkest);
  float quantum = 1.0 / (255.0 * contrastBound);
  coverage = min(1.0, floor(coverage / quantum + noise) * quantum);
  gl_FragColor = vec4(gl_FragColor.rgb * coverage, coverage);
}
