// The sky: the light the air scatters towards the camera along each line of sight through it (between
// the top of the shell and the ground), by the model in atmosphereCommon.glsl. The output is the
// scattered light, and the background (stars, the sun's disc in the sky pass) is dimmed by the air's
// transmittance. Lines of sight that reach the ground are left to the ground's own haze
// (aerialPerspective.js), except near the horizon (see GRAZING_BAND).
//
// Geometry: solved against the ellipsoid by stretching space along the polar axis (atmoPole.w =
// a/b - 1), which turns it into a sphere of radius a; relative to the camera, with |C'|^2 - r^2 (small
// differences of huge numbers) computed in float64 on the CPU (Planet.updateAtmosphere), and with
// numerically stable roots. The output is premultiplied: colour + background * (1 - alpha).
#include <common>
#include <logdepthbuf_pars_fragment>
#include <atmosphere_common>

uniform vec4 atmoCamera;   // xyz: stretched camera position relative to the planet centre (world axes); w: |C'|^2 - top^2
uniform vec4 atmoPole;     // xyz: polar axis (world); w: a/b - 1
uniform vec4 atmoParams;   // x: |C'|^2 - a^2 (ground); y: exposure; z: a (m); w: top radius (m)
uniform vec3 atmoSun;      // direction to the sun (world)
#ifdef SEA_REFLECTION
uniform float seaSlopeVariance; // the sea's mean square slope (src/planet/seaWaves.js)
#endif
#ifdef SKY_LUT
// The sky from the camera, worked out once a frame (src/planet/skyLut.js): read rather than marched here.
uniform sampler2D skyLight;          // rgb: the scattered light; a: the transmittance's luminance
uniform sampler2D skyTransmittance;  // rgb: the transmittance
uniform vec2 skyLutSize;
SKY_LUT_GLSL
#endif
varying vec3 vWorldPosition;

const float sunCosRadius = 0.999989;           // cos(0.27 degrees)
const int VIEW_SAMPLES = 16;
// Lines of sight that reach the sea-level ellipsoid within this far (m) of grazing it. The planet's
// mesh is drawn over the sky, but towards the horizon its tiles are coarse and their edges are chords
// that sag below the ellipsoid between vertices (by up to a few kilometres): some lines of sight just
// below the horizon reach the ellipsoid but pass over the mesh. For these the sky draws the ground
// itself, as the haze in front of dark sea, so the gaps do not show the black behind the sky.
const float GRAZING_BAND = 20000.0;
const vec3 GROUND_COLOR = vec3(0.012, 0.03, 0.05);   // the sea, as seaDarkening.js's dark water

void main() {
  #include <logdepthbuf_fragment>
  vec3 d = normalize(vWorldPosition - cameraPosition);
  vec3 ds = d + atmoPole.w * dot(d, atmoPole.xyz) * atmoPole.xyz;
  float A = dot(ds, ds);
  float B = dot(atmoCamera.xyz, ds);
  float t0, t1;
  if (!atmoRoots(A, B, atmoCamera.w, t0, t1)) discard;
  t0 = max(t0, 0.0);
  // Stop at the ground (sea level) if the ray reaches it.
  float groundDisc = B * B - A * atmoParams.x;
  bool hitsGround = atmoParams.x > 0.0 && B < 0.0 && groundDisc > 0.0;
  // The ground (drawn in front of the shell) hides lines of sight that reach it: skip them early (the
  // logarithmic depth written by this shader stops the GPU from rejecting them before it runs), unless
  // they pass within GRAZING_BAND of grazing it. The lowest point of the line is at radius r with
  // r^2 - a^2 = atmoParams.x - B^2 / A, so that is r - a ~ (r^2 - a^2) / 2a.
  if (hitsGround) {
    float a = atmoParams.z;
    if ((atmoParams.x - B * B / A) / (2.0 * a) < -GRAZING_BAND) discard;
    float g0, g1;
    atmoRoots(A, B, atmoParams.x, g0, g1);
    vec3 groundLight, groundTransmittance;
    atmoScatter(atmoCamera.xyz, ds, d, t0, max(g0, t0), atmoSun, a, VIEW_SAMPLES, groundLight, groundTransmittance);
    groundLight *= atmoHazeScale(groundTransmittance, atmoParams.y);
    vec3 hit = atmoCamera.xyz + ds * g0;
    vec3 up = normalize(hit);
    float lit = smoothstep(-0.1, 0.1, dot(up, atmoSun));
    vec3 sea = GROUND_COLOR * lit;
  #ifdef SEA_REFLECTION
    // The sea reflects the sky, by Fresnel's law averaged over its slopes, as the sea surface does
    // (src/planet/seaWaves.js, seaReflectanceGlsl).
    vec3 r = normalize(reflect(d, up) + 2.0 * sqrt(seaSlopeVariance) * up);
    r = normalize(r + max(0.02 - dot(r, up), 0.0) * up);
    vec3 rs = r + atmoPole.w * dot(r, atmoPole.xyz) * atmoPole.xyz;
    float r0, r1;
    if (atmoRoots(dot(rs, rs), dot(hit, rs), dot(hit, hit) - atmoParams.w * atmoParams.w, r0, r1)) {
      vec3 skyLight, skyTransmittance;
      atmoScatter(hit, rs, r, max(r0, 0.0), r1, atmoSun, a, 6, skyLight, skyTransmittance);
      float facing = sqrt(min(dot(d, up) * dot(d, up) + seaSlopeVariance, 1.0));
      float fresnel = 0.02 + 0.98 * pow(1.0 - facing, 5.0);
      sea = mix(sea, 1.0 - exp(-skyLight), fresnel);
    }
  #endif
    gl_FragColor = vec4((1.0 - exp(-groundLight)) + groundTransmittance * sea, 1.0);
    #include <colorspace_fragment>
    return;
  }
  if (t1 <= t0) discard;
  float sunCos = dot(d, atmoSun);
  float sunDisc = smoothstep(sunCosRadius - 0.000004, sunCosRadius, sunCos);

  vec3 light, transmittance;
#ifdef SKY_LUT
  vec2 uv = skyLutUv(ds / sqrt(A), atmoCamera.xyz, atmoSun, atmoParams.z, atmoParams.w);
  // (Above the horizon's row: the table's lower half is the air in front of the ground.)
  uv.y = max(uv.y, 0.5 + 0.5 / skyLutSize.y);
  light = texture2D(skyLight, uv).rgb;
  transmittance = texture2D(skyTransmittance, uv).rgb;
#else
  atmoScatter(atmoCamera.xyz, ds, d, t0, t1, atmoSun, atmoParams.z, VIEW_SAMPLES, light, transmittance);
#endif
  light *= atmoParams.y;
  // The sun's disc seen through the air, reddened by it.
  light += sunDisc * ATMO_SUN_INTENSITY * 4.0 * transmittance;
  vec3 color = 1.0 - exp(-light);                         // exposure
  float opacity = 1.0 - dot(transmittance, vec3(0.2126, 0.7152, 0.0722));
  gl_FragColor = vec4(color, opacity);
  #include <colorspace_fragment>
}
