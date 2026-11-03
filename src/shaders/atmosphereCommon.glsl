// The atmosphere's scattering model, shared by the sky (atmosphere.frag.glsl) and the haze over everything
// seen through the air (src/planet/aerialPerspective.js): single scattering, ray-marched along a line of
// sight. Rayleigh (blue sky, red sunsets) and Mie (haze, the glow around the sun) with exponentially
// falling density; at each sample the sunlight is attenuated along its own path to the sun, using the
// Chapman function for the air along it (Schuler's form, within ~2.5% except near grazing; zero where
// the ground is in the way).
//
// Positions are in a stretched frame where the planet's ellipsoid becomes a sphere of radius `ground`
// (stretched along the polar axis), relative to the planet's centre; with the ray's direction stretched
// the same way, a parameter t along it is still metres along the real line of sight. Needs PI (<common>).

// Included by both the fog chunk (aerialPerspective.js) and the lights chunk (sunAndSkyLight.js), so
// guarded against a second copy in the same shader.
#ifndef ATMOSPHERE_COMMON
#define ATMOSPHERE_COMMON

// Scattering coefficients at sea level (1/m) and scale heights (m).
const vec3 ATMO_BETA_R = vec3(5.8e-6, 13.5e-6, 33.1e-6);
// The aerosol: for the sky and the clouds (shaders that define ATMO_SKY_AEROSOL: the sky, its table, the cloud
// march), marine air's (an aerosol optical depth of about 0.1), so that distant clouds and the horizon fade
// into haze as at sea; for the ground's own haze and light (terrain, sea, the ring: three.js's materials, by
// the fog and light chunks), a clean day's, so that hills and coasts seen from the air stay clear.
#ifdef ATMO_SKY_AEROSOL
const float ATMO_BETA_M = 80e-6;
#else
const float ATMO_BETA_M = 8e-6;
#endif
const float ATMO_HEIGHT_R = 8000.0;
const float ATMO_HEIGHT_M = 1200.0;
const float ATMO_MIE_G = 0.76;
// The aerosol's light scattered more than once (by the haze and the air around it), which comes from all
// directions: added to its phase evenly. With single scattering alone, thick haze looking away from the sun
// was a dark grey band, darker than the sky above it; a hazy horizon is bright.
const float ATMO_MIE_MULTIPLE = 0.06;
// (Lit by the sky as well as the sun, so bluish: half the air's own colour, of the same luminance. Lit by
// the sun alone, reddened on its way, the haze was tan.)
const vec3 ATMO_MIE_MULTIPLE_TINT = vec3(0.7207, 1.0083, 1.7402);
const float ATMO_SUN_INTENSITY = 22.0;
// The haze over the ground (aerialPerspective.js, and the ground the sky draws near the horizon). The
// sky is drawn brighter than the ground beside it would be (its exposure, with its curve, is set for a
// sky seen on its own, and falls from space: Planet.js). Through thin air (looking down from space, or at
// hills a few kilometres off) the haze is instead on the same scale as the ground it covers,
// ATMO_HAZE_THIN = pi / ATMO_SUN_INTENSITY (the ground is lit by a sun of intensity pi:
// src/scene/lighting.js), whatever the sky's exposure: from space it is what turns the dark sea blue.
// Through air that nearly hides what is behind (the horizon, the ground near the limb) it rises to the
// sky's own brightness, `exposure`, so ground and sky meet without a seam.
const float ATMO_HAZE_THIN = PI / ATMO_SUN_INTENSITY;

float atmoHazeScale(vec3 transmittance, float exposure) {
  float opaque = 1.0 - dot(transmittance, vec3(0.2126, 0.7152, 0.0722));
  return mix(ATMO_HAZE_THIN, exposure, opaque * opaque * opaque);
}

// Stable roots of A t^2 + 2 B t + c = 0 (t0 <= t1); false if there are none.
bool atmoRoots(float A, float B, float c, out float t0, out float t1) {
  float disc = B * B - A * c;
  if (disc <= 0.0) return false;
  float q = -(B + (B >= 0.0 ? 1.0 : -1.0) * sqrt(disc));
  float r1 = q / A;
  float r2 = c / q;
  t0 = min(r1, r2);
  t1 = max(r1, r2);
  return true;
}

// Air (density-weighted metres) from radius r (height h) out along a ray at zenith cosine c, for scale
// height H: H exp(-h/H) ch(r/H, c), with ch(X, c) ~ k / ((k - 1) c + 1), k = sqrt(pi X / 2); below the
// local horizon, reflected through the ray's lowest point.
float atmoChapman(float H, float r, float h, float c, float ground) {
  float k = sqrt(PI * r / H * 0.5);
  float up = H * exp(-h / H) * k / ((k - 1.0) * abs(c) + 1.0);
  if (c >= 0.0) return up;
  float rt = r * sqrt(1.0 - c * c);
  return 2.0 * H * exp(-(rt - ground) / H) * sqrt(PI * rt / H * 0.5) - up;
}

// Rayleigh and Mie air between p and the sun (from sea level if p is below it); a huge value if the
// ground is in the way.
vec2 atmoSunDepth(vec3 p, vec3 sun, float ground) {
  float r = max(length(p), ground);
  float c = dot(p, sun) / r;
  float b = c * r;
  if (b < 0.0 && b * b - (r * r - ground * ground) > 0.0) return vec2(1e9);
  float h = r - ground;
  return vec2(atmoChapman(ATMO_HEIGHT_R, r, h, c, ground), atmoChapman(ATMO_HEIGHT_M, r, h, c, ground));
}

// The light scattered towards the camera from the stretch t0..t1 of the line of sight from `camera` along
// (stretched) direction ds, true direction d, by `samples` samples; and the air's transmittance over it.
void atmoScatter(vec3 camera, vec3 ds, vec3 d, float t0, float t1, vec3 sun, float ground, int samples,
                 out vec3 light, out vec3 transmittance) {
  float segment = (t1 - t0) / float(samples);
  vec2 viewDepth = vec2(0.0);
  vec3 sumR = vec3(0.0);
  vec3 sumM = vec3(0.0);
  for (int i = 0; i < 16; i++) {
    if (i >= samples) break;
    vec3 p = camera + ds * (t0 + (float(i) + 0.5) * segment);
    // (Not below sea level: the density grows without bound there, and parts of the scene below
    // it, such as the tiles' skirts, would turn black.)
    float h = max(length(p) - ground, 0.0);
    vec2 density = exp(-h / vec2(ATMO_HEIGHT_R, ATMO_HEIGHT_M)) * segment;
    // Each segment's own light is integrated exactly for its (uniform) air: the light scattered at
    // depth s into it is dimmed by exp(-tau s / segment), which averages to (1 - exp(-tau)) / tau.
    // Taking it all from the segment's far end instead loses blue light far more than red where a
    // segment is optically thick (near-horizontal lines of sight through the low air, ~70 km per
    // segment), and turned the horizon orange at noon.
    vec3 tau = ATMO_BETA_R * density.x + ATMO_BETA_M * 1.1 * density.y;
    vec3 within = mix(1.0 - 0.5 * tau, (1.0 - exp(-tau)) / max(tau, vec3(1e-4)), step(vec3(1e-4), tau));
    vec2 sunDepth = atmoSunDepth(p, sun, ground);
    vec3 attenuation = exp(-(ATMO_BETA_R * (viewDepth.x + sunDepth.x) + ATMO_BETA_M * 1.1 * (viewDepth.y + sunDepth.y))) * within;
    viewDepth += density;
    sumR += density.x * attenuation;
    sumM += density.y * attenuation;
  }
  float sunCos = dot(d, sun);
  float phaseR = 3.0 / (16.0 * PI) * (1.0 + sunCos * sunCos);
  float g2 = ATMO_MIE_G * ATMO_MIE_G;
  float phaseM = 3.0 / (8.0 * PI) * ((1.0 - g2) * (1.0 + sunCos * sunCos)) / ((2.0 + g2) * pow(1.0 + g2 - 2.0 * ATMO_MIE_G * sunCos, 1.5));
  light = ATMO_SUN_INTENSITY * (sumR * ATMO_BETA_R * phaseR + ATMO_BETA_M * (sumM * phaseM + sumM.g * ATMO_MIE_MULTIPLE * ATMO_MIE_MULTIPLE_TINT));
  transmittance = exp(-(ATMO_BETA_R * viewDepth.x + ATMO_BETA_M * 1.1 * viewDepth.y));
}

#endif
