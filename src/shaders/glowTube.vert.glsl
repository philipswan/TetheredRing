// Glow tubes (src/scene/GlowTube.js): a volume of light with a Gaussian cross-section about a curved
// axis, drawn on the inside of a tube that bounds it. Each vertex carries the point of the axis at its
// ring, the axis's direction, the radius sigma and the emissivity at the centre; the fragment shader
// integrates the light along the line of sight. Everything is passed in view space (relative to the
// camera), so it stays precise however far the tube is from the planet's centre.
//
// A tube narrower than a pixel would flicker in and out between the pixels' centres. It is widened to
// at least GLOW_MIN_PIXELS pixels, dimmed to keep its light per unit length (what a camera would record
// of a line too thin to resolve).
#include <common>
#include <logdepthbuf_pars_vertex>

#define GLOW_MIN_PIXELS 0.75

uniform float glowPixelAngle;   // radians per drawing-buffer pixel

attribute vec3 axisPoint;
attribute vec3 axisDir;
attribute float sigma;
attribute vec3 emission;
attribute vec2 axial;           // length along the axis back to the tube's start and on to its end

varying vec2 vAxial;

varying vec3 vViewPosition;
varying vec3 vAxisPoint;
varying vec3 vAxisDir;
varying float vSigma;
varying vec3 vEmission;

void main() {
  vec4 axisView = modelViewMatrix * vec4(axisPoint, 1.0);
  float minSigma = length(axisView.xyz) * glowPixelAngle * GLOW_MIN_PIXELS;
  float s = max(sigma, minSigma);
  float widen = s / max(sigma, 1e-6);
  vec4 mvPosition = modelViewMatrix * vec4(axisPoint + (position - axisPoint) * widen, 1.0);
  vViewPosition = mvPosition.xyz;
  vAxisPoint = axisView.xyz;
  vAxisDir = mat3(modelViewMatrix) * axisDir;
  vSigma = s;
  vEmission = emission / (widen * widen);
  vAxial = axial;
  gl_Position = projectionMatrix * mvPosition;
  #include <logdepthbuf_vertex>
}
