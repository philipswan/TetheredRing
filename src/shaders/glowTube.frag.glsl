// Glow tubes (see glowTube.vert.glsl and src/scene/GlowTube.js). Only the far side of the bounding tube
// is drawn, so each pixel is shaded once, from outside the tube or inside it.
//
// The emissivity about the axis (taken as straight here) is E (exp(-d^2 / sigma^2) - exp(-B^2)) out to
// d = B sigma, where the bounding tube is, and zero beyond, so the light fades to nothing at the tube's
// edge instead of stopping there, and only between the tube's ends (its caps). Along the line of sight, at angle alpha to the axis and passing it at
// distance d0 at ray distance tc, inside the bound from ta to tb, it adds up to
//   E exp(-d0^2 / sigma^2) sigma sqrt(pi) / (2 sin alpha) [erf(sin alpha (tb - tc) / sigma) - erf(sin alpha (ta - tc) / sigma)]
//   - E exp(-B^2) (tb - ta).
// The light is optically thin (it adds) and is shown as 1 - exp(-light), which saturates to white-hot
// rather than clipping.
#include <common>
#include <logdepthbuf_pars_fragment>

#define BOUND_SIGMAS 2.4   // as GlowTube.js

varying vec3 vViewPosition;
varying vec3 vAxisPoint;
varying vec3 vAxisDir;
varying float vSigma;
varying vec3 vEmission;
varying vec2 vAxial;

// erf, after Winitzki (relative error below 1e-3 everywhere), with its series near zero where
// 1 - exp(-x^2) loses its precision.
float glowErf(float x) {
  float x2 = x * x;
  if (x2 < 0.0025) return 1.1283792 * x * (1.0 - x2 / 3.0);
  const float a = 0.147;
  return sign(x) * sqrt(1.0 - exp(-x2 * (1.2732395 + a * x2) / (1.0 + a * x2)));
}

void main() {
  #include <logdepthbuf_fragment>
  float t1 = length(vViewPosition);
  vec3 ray = vViewPosition / t1;
  vec3 axis = normalize(vAxisDir);
  vec3 fromAxis = -vAxisPoint;                       // camera relative to the axis point
  vec3 w = ray - dot(ray, axis) * axis;              // the ray's direction across the axis
  float sinAlpha2 = dot(w, w);
  float sinAlpha = sqrt(sinAlpha2);
  vec3 w0 = fromAxis - dot(fromAxis, axis) * axis;   // the camera's offset across the axis
  float d02;
  float tc;
  if (sinAlpha > 1e-3) {
    // Closest distance from the common normal, which keeps its precision with the camera far away.
    vec3 n = cross(ray, axis) / sinAlpha;
    float d0 = dot(fromAxis, n);
    d02 = d0 * d0;
    tc = -dot(w0, w) / sinAlpha2;
  } else {
    d02 = dot(w0, w0);
    tc = 0.0;
  }
  float s = max(vSigma, 1e-3);
  float bound2 = BOUND_SIGMAS * BOUND_SIGMAS;
  float inside = bound2 * s * s - d02;
  if (inside <= 0.0) discard;
  // Where the line of sight is within the bound: from the camera (or where it enters) to the far wall.
  float halfChord = sqrt(inside) / max(sinAlpha, 1e-6);
  float ta = max(0.0, tc - halfChord);
  float tb = min(t1, tc + halfChord);
  // ...and between the tube's ends: the point at ray distance t is t (ray . axis) - (axisPoint . axis)
  // along the axis from this fragment's axis point, which must be from -vAxial.x to vAxial.y.
  float rayAlong = dot(ray, axis);
  float pointAlong = dot(vAxisPoint, axis);
  if (abs(rayAlong) > 1e-6) {
    float tStart = (pointAlong - vAxial.x) / rayAlong;
    float tEnd = (pointAlong + vAxial.y) / rayAlong;
    ta = max(ta, min(tStart, tEnd));
    tb = min(tb, max(tStart, tEnd));
  } else if (-pointAlong < -vAxial.x || -pointAlong > vAxial.y) {
    discard;
  }
  if (tb <= ta) discard;
  float k = max(sinAlpha, 1e-4) / s;
  float gauss = exp(-d02 / (s * s)) * 0.88622693 / k * (glowErf(k * (tb - tc)) - glowErf(k * (ta - tc)));
  float column = max(gauss - exp(-bound2) * (tb - ta), 0.0);
  vec3 light = vEmission * column;
  gl_FragColor = vec4(1.0 - exp(-light), 1.0);
  #include <colorspace_fragment>
}
