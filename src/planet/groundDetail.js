// The generated ground's look close up (see groundData.js for its shape): what the satellite imagery cannot show.
//
// The imagery (about 100 m pixels on the Big Island) gives the ground's average colour; this splits each of its pixels
// into what the ground there is made of (the region's cover: vegetation, trees, shrubs, sand, cinder, rough or smooth
// lava), as patches, clumps and crowns of each in their own colours, keeping the average the imagery's. Each kind has
// its own generated texture and relief (bump-mapped): tree crowns and shrubs with the ground shaded around them, grass,
// a'a clinker, cracked pahoehoe, cinder gravel, rippled sand with a wet band along the sea. And snow, by the season, on
// the high summits.
//
// Every pattern is a function of the position in the region's plane (CubedSpherePlanetRenderer._groundFrame), with a
// per-tile offset for each band worked out in float64 and reduced modulo the noise lattice's period, so the patterns
// meet across tiles and stay precise in float32. Bands fade out before they are smaller than a pixel.

import * as THREE from 'three'
import { COARSE } from './groundTextures.js'

// Wavelengths (m) of the pattern bands: value-noise octaves, then Voronoi cell sizes.
export const GROUND_BANDS = [
  64, 16, 4, 1, 0.25, 0.0625, // 0-5 noise octaves
  7, 2.6, 0.55, 3.2, 0.11,    // 6 tree crowns, 7 shrubs, 8 a'a clinker, 9 pahoehoe plates, 10 gravel
  0.62, 1.7,                  // 11 grass bunches, 12 stones
]
const PERIOD = 1024 // the noise lattice's period, in cells
// The per-tile offsets are reduced modulo this many cells: a whole number of lattice periods for every scale the
// shader applies to the coordinates (all multiples of 1/20), and for its waves' frequencies, so every pattern is
// continuous where tiles meet. (Reduced modulo the period alone, a pattern of coordinates times 0.7, say, jumped at
// an edge where the neighbours' offsets wrapped differently.)
const OFFSET_PERIOD = PERIOD * 20

/** The per-band offsets for a tile whose centre is at (east, north) metres in the region's plane. */
export function groundOffsets(east, north, out = GROUND_BANDS.map(() => new THREE.Vector2())) {
  for (let i = 0; i < GROUND_BANDS.length; i++) {
    const f = 1 / GROUND_BANDS[i]
    out[i].set(positiveMod(east * f, OFFSET_PERIOD), positiveMod(north * f, OFFSET_PERIOD))
  }
  return out
}

function positiveMod(v, m) {
  const r = v % m
  return r < 0 ? r + m : r
}

// Shared by every tile: the season's snow on the summits (see setGroundSeason).
export const groundUniforms = {
  groundSnow: { value: new THREE.Vector2(0, 5000) }, // (how much, the snow line in metres)
}

/**
 * The snow for a day of the year: Mauna Kea and Mauna Loa are snow-capped after winter storms, mostly from December
 * to March; a light, patchy cap above about 4000 m at its height, in mid-February (on north-facing slopes and in
 * hollows lower down), none from late spring to late autumn.
 */
export function setGroundSeason(dayOfYear) {
  const season = 0.5 + 0.5 * Math.cos(2 * Math.PI * (dayOfYear - 45) / 365.25)
  const amount = Math.min(1, Math.max(0, (season - 0.55) / 0.4))
  groundUniforms.groundSnow.value.set(amount, 4400 - 400 * amount)
}

const L = GROUND_BANDS.map((w) => (1 / w).toFixed(6)).join(', ')

export const groundVertexPars = /* glsl */`
uniform vec3 groundEast;
uniform vec3 groundNorth;
uniform vec3 groundFrameUp;
uniform vec3 groundTileCenter;
attribute vec2 groundCell;
varying vec2 vGroundLocal;
varying vec2 vGroundCell;
varying float vGroundAltitude;
varying vec3 vGroundUp;
varying vec3 vGroundNorth;
varying vec3 vFrameE;
varying vec3 vFrameN;
varying vec3 vFrameU;
`

export function groundVertex(a, b) {
  return /* glsl */`
vGroundLocal = vec2(dot(transformed, groundEast), dot(transformed, groundNorth));
vGroundCell = groundCell;
{
  vec3 p = transformed + groundTileCenter;
  float r = length(p);
  vec3 d = p / r;
  vGroundAltitude = r - 1.0 / sqrt((d.x * d.x + d.z * d.z) / ${(a * a).toExponential(10)} + d.y * d.y / ${(b * b).toExponential(10)});
  vGroundUp = normalize(normalMatrix * (p * vec3(${(1 / (a * a)).toExponential(10)}, ${(1 / (b * b)).toExponential(10)}, ${(1 / (a * a)).toExponential(10)})));
  vGroundNorth = normalize(normalMatrix * groundNorth);
  vFrameE = normalMatrix * groundEast;
  vFrameN = normalMatrix * groundNorth;
  vFrameU = normalMatrix * groundFrameUp;
}`
}

export const groundFragmentPars = /* glsl */`
#define GROUND_BANDS ${GROUND_BANDS.length}
precision highp sampler2DArray;
#define GROUND_FULL_FOOTPRINT 4.5
// The region's data (groundTextures.js): its chunks as layers, and which layer holds each chunk.
uniform sampler2DArray groundA;
uniform sampler2DArray groundB;
uniform sampler2DArray groundS;
uniform sampler2DArray groundCA;
uniform sampler2DArray groundCB;
uniform sampler2DArray groundCS;
uniform sampler2D groundLookup;
uniform vec3 groundGrid;       // (cells a chunk, chunks across, chunks down)
uniform float groundCellMetres; // (a cell's size, for distances in cells)
uniform float groundActive;
uniform vec4 groundCellToUv;   // (the tile's colour texture's UVs per cell, east and south: a 2 x 2 matrix)
// The region's data at a point (in its cells: the vertices' groundCell), the same on every tile: the coarse copy's,
// blended into the full copy's where a pixel covers less than GROUND_FULL_FOOTPRINT metres (fp). False where it is not
// loaded, or beyond the region.
bool gFetch(vec2 cell, float fp, out vec4 a, out vec4 b, out vec2 slope, out vec3 coarse) {
  vec2 chunk = floor(cell / groundGrid.x);
  a = vec4(0.0); b = vec4(0.0); slope = vec2(0.0); coarse = vec3(0.0);
  if (chunk.x < 0.0 || chunk.y < 0.0 || chunk.x >= groundGrid.y || chunk.y >= groundGrid.z) return false;
  vec4 layers = texelFetch(groundLookup, ivec2(chunk), 0) * 255.0;
  if (layers.g > 254.5) return false;
  // (A layer has a border of one of its cells: its cell k's middle is at k + 0.5 of its cells.)
  vec2 local = cell - chunk * groundGrid.x;
  float cn = groundGrid.x / ${COARSE.toFixed(1)};
  vec3 uvc = vec3((local / ${COARSE.toFixed(1)} + 1.0) / (cn + 2.0), layers.g);
  a = texture(groundCA, uvc);
  b = texture(groundCB, uvc);
  coarse = texture(groundCS, uvc).rgb; // (slope east, north, and height: the coarse copy's)
  slope = coarse.xy;
  float full = 1.0 - smoothstep(GROUND_FULL_FOOTPRINT * 0.55, GROUND_FULL_FOOTPRINT, fp);
  if (full > 0.0 && layers.r < 254.5) {
    vec3 uvl = vec3((local + 1.0) / (groundGrid.x + 2.0), layers.r);
    a = mix(a, texture(groundA, uvl), full);
    b = mix(b, texture(groundB, uvl), full);
    slope = mix(slope, texture(groundS, uvl).rg, full);
  }
  return true;
}
uniform vec2 groundOffset[GROUND_BANDS];
uniform vec2 groundSnow;
varying vec2 vGroundLocal;
varying vec2 vGroundCell;
varying float vGroundAltitude;
varying vec3 vGroundUp;
varying vec3 vGroundNorth;
varying vec3 vFrameE;
varying vec3 vFrameN;
varying vec3 vFrameU;
const float G_INV[GROUND_BANDS] = float[](${L});

// The noise lattice coordinate of this fragment in band i.
#define GP(i) (vGroundLocal * G_INV[i] + groundOffset[i])

float gHash(vec2 p) {
  p = mod(p, ${PERIOD.toFixed(1)});
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec2 gHash2(vec2 p) {
  p = mod(p, ${PERIOD.toFixed(1)});
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}

float gNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(gHash(i), gHash(i + vec2(1.0, 0.0)), u.x), mix(gHash(i + vec2(0.0, 1.0)), gHash(i + vec2(1.0, 1.0)), u.x), u.y);
}

float gHash3(vec3 p) {
  p = mod(p, ${PERIOD.toFixed(1)});
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}

float gNoise3(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(gHash3(i), gHash3(i + vec3(1.0, 0.0, 0.0)), f.x),
                 mix(gHash3(i + vec3(0.0, 1.0, 0.0)), gHash3(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
             mix(mix(gHash3(i + vec3(0.0, 0.0, 1.0)), gHash3(i + vec3(1.0, 0.0, 1.0)), f.x),
                 mix(gHash3(i + vec3(0.0, 1.0, 1.0)), gHash3(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
}

// Voronoi cells: (distance to the nearest point, distance to the next minus that (0 on an edge), the cell's random
// value, the nearest point's own random size).
vec4 gVoronoi(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  float d1 = 8.0, d2 = 8.0, id = 0.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      vec2 o = gHash2(i + g);
      vec2 r = g + o * 0.85 + 0.075 - f;
      float d = dot(r, r);
      if (d < d1) { d2 = d1; d1 = d; id = gHash(i + g + 17.0); }
      else if (d < d2) { d2 = d; }
    }
  }
  d1 = sqrt(d1);
  return vec4(d1, sqrt(d2) - d1, id, fract(id * 7.13));
}

// The nearest Voronoi point's offset from p (in cells) and its random value.
vec3 gVoronoiNearest(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  float d1 = 8.0, id = 0.0;
  vec2 best = vec2(0.0);
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      vec2 r = g + gHash2(i + g) * 0.85 + 0.075 - f;
      float d = dot(r, r);
      if (d < d1) { d1 = d; best = r; id = gHash(i + g + 17.0); }
    }
  }
  return vec3(best, id);
}

// The slope (rise per metre east and north) of a dome h = height * sqrt(1 - d^2 / r^2) over a Voronoi point
// toPoint away (in band i's cells, as gVoronoiNearest gives it; r too). Worked out exactly rather than from screen
// derivatives, which come in 2 x 2 pixel blocks and draw a dome's smooth sides as stepped bands (moire close up).
vec2 gDomeSlope(vec2 toPoint, float r, float height, int i) {
  float q = 1.0 - dot(toPoint, toPoint) / (r * r);
  if (q <= 0.0) return vec2(0.0);
  return height * toPoint / (r * r * sqrt(max(q, 0.05))) * G_INV[i];
}

// How much of band i's detail a pixel of footprint fp (m) can show: all of it until the band is 6 pixels across,
// none once it is 2.
float gVis(int i, float fp) {
  return 1.0 - smoothstep(0.17, 0.5, fp * G_INV[i]);
}

// A mask covering fraction f of the ground, in patches shaped by noise n (0..1); soft edge s.
float gMask(float f, float n, float s) {
  return smoothstep(1.0 - f - s, 1.0 - f + s, n * (1.0 - 2.0 * s) + s);
}

// Sun-lit albedos (linear) of the ground's kinds, relative to one another: the imagery decides the actual colours.
const vec3 G_GRASS = vec3(0.30, 0.25, 0.13);
const vec3 G_SHRUB = vec3(0.07, 0.08, 0.035);
const vec3 G_TREE = vec3(0.035, 0.05, 0.022);
const vec3 G_PAHOEHOE = vec3(0.085, 0.08, 0.075);
const vec3 G_AA = vec3(0.05, 0.045, 0.04);
const vec3 G_CINDER = vec3(0.17, 0.09, 0.06);
const vec3 G_SNOW = vec3(0.82, 0.85, 0.9);
`

// Runs after <map_fragment>: sets the ground's colour (diffuseColor), its bump height gH (m) and roughness gRough.
export const groundFragment = /* glsl */`
float gH = 0.0;
vec2 gG = vec2(0.0); // (the slope of the shapes worked out exactly: see gDomeSlope)
float gRough = 1.0;
float gDetail = 0.0;
// The ground's shading normal (view space): from the cover tile's normal texture, a function of position alone, so
// the same on either side of a tile's edge whatever the tiles' levels (the tiles' own vertex normals are not).
vec3 gMacro = normalize(vNormal);
vec4 cA, cB;
vec2 gSlope;
vec3 gCoarse;
float gFootprint = max(length(dFdx(vGroundLocal)), length(dFdy(vGroundLocal)));
bool gHere = groundActive > 0.5 && gFetch(vGroundCell, gFootprint, cA, cB, gSlope, gCoarse);
if (gHere) gMacro = normalize(vFrameU - gSlope.x * vFrameE - gSlope.y * vFrameN);
if (gHere) {
  float fp = max(length(dFdx(vGroundLocal)), length(dFdy(vGroundLocal)));
  float coastHere = (cA.a * 255.0 - 128.0) * 2.0;
  // (The sea floor keeps the imagery, as the baked tiles have it: the sea shows its own colour over it.)
  if (coastHere > -6.0) {
  float veg = cA.r;
  float coast = (cA.a * 255.0 - 128.0) * 2.0;
  // Steep faces (cliffs, gulch walls): bare rock, patterned in three dimensions (a flat map's patterns would
  // stretch down them). Nothing grows in the sea, and little on a cliff.
  vec3 gN0 = gMacro;
  float gSlope = 1.0 - dot(gN0, vGroundUp);
  float steep = smoothstep(0.25, 0.45, gSlope); // (about 41 to 57 degrees)
  float vegCover = veg; // (on steep faces, how much of the rock is hidden by vegetation)
  veg *= smoothstep(1.0, 10.0, coast) * (1.0 - steep);
  vegCover *= smoothstep(1.0, 10.0, coast);
  float bare = max(0.0, 1.0 - veg);
  float sandF = min(bare, cB.g * 1.6);
  float cinderF = min(bare - sandF, cB.b);
  float lavaF = max(0.0, bare - sandF - cinderF);
  float roughF = cB.r;
  // Sand's own colour, from the 10 m imagery's brightness: black (basalt) to white (coral).
  float shade = cB.a;
  vec3 sandAlbedo = mix(vec3(0.045, 0.04, 0.037), vec3(0.62, 0.55, 0.42), smoothstep(0.07, 0.30, shade));

  // Within each satellite pixel: where each kind is. The patches' noise (bands 1-3) fades to the fractions far off.
  float vis1 = gVis(1, fp), vis2 = gVis(2, fp), vis3 = gVis(3, fp);
  float nPatch = 0.55 * gNoise(GP(1)) + 0.3 * gNoise(GP(2) + 5.3) + 0.15 * gNoise(GP(3) + 1.7);
  float nPatch2 = 0.55 * gNoise(GP(1) + 9.1) + 0.3 * gNoise(GP(2) + 2.9) + 0.15 * gNoise(GP(3) + 7.7);
  float patchVis = vis1;
  float mVeg = mix(veg, gMask(veg, nPatch, 0.04 + fp * 0.02), patchVis);

  // Tree crowns and shrubs: discs in Voronoi cells, sized to cover their fractions of the vegetation.
  float treeF = veg > 0.001 ? min(1.0, cA.g / veg) : 0.0;
  float shrubF = veg > 0.001 ? min(1.0 - treeF, cA.b / veg) : 0.0;
  float mTree = treeF, mShrub = shrubF, crownH = 0.0, crownAo = 1.0;
  vec2 crownG = vec2(0.0);
  // Crowns and shrubs are painted on the ground, which only looks right from well off it: from within about their
  // height of the ground's surface (along its normal, so a hillside above the camera, seen face on, keeps its
  // trees) the ground under them is drawn instead (shaded leaf litter).
  float eyeHeight = dot(vViewPosition, gMacro);
  float fromAboveTree = smoothstep(12.0, 40.0, eyeHeight), fromAboveShrub = smoothstep(3.0, 12.0, eyeHeight);
  float visTree = gVis(6, fp), visShrub = gVis(7, fp);
  if (treeF > 0.01 && visTree > 0.0) {
    vec3 vn = gVoronoiNearest(GP(6));
    float vx = length(vn.xy), vw = fract(vn.z * 7.13);
    float r = sqrt(treeF / 3.0) * (0.75 + 0.5 * vw) + 0.05;
    float edgeT = max(0.06, 1.5 * fp * G_INV[6]); // (soft edges once a cell is only a few pixels: no stair-steps)
    float inCrown = 1.0 - smoothstep(r - edgeT, r + 0.02, vx);
    float lump = gNoise(GP(7) * 2.0 + 3.0);
    crownH += inCrown * lump * 1.2 * fromAboveTree;
    crownG += inCrown * fromAboveTree * gDomeSlope(vn.xy, r, 4.0, 6);
    crownAo *= mix(1.0, mix(1.0 - 0.6 * treeF, 0.55 + 0.45 * smoothstep(r, r * 1.5, vx), fromAboveTree), visTree);
    mTree = mix(treeF, inCrown, visTree * fromAboveTree);
  }
  if (shrubF > 0.01 && visShrub > 0.0) {
    vec3 vn = gVoronoiNearest(GP(7) + 3.7);
    float vx = length(vn.xy), vw = fract(vn.z * 7.13);
    float r = sqrt(shrubF / 3.0) * (0.6 + 0.8 * vw) + 0.04;
    float edgeS = max(0.08, 1.5 * fp * G_INV[7]);
    float inShrub = (1.0 - smoothstep(r - edgeS, r + 0.02, vx)) * (1.0 - mTree);
    crownH += inShrub * gNoise(GP(3) * 1.5) * 0.4 * fromAboveShrub;
    crownG += inShrub * fromAboveShrub * gDomeSlope(vn.xy, r, 1.2, 7);
    crownAo *= mix(1.0, mix(0.6, 0.7 + 0.3 * smoothstep(r, r * 1.4, vx), fromAboveShrub), visShrub);
    mShrub = mix(shrubF, inShrub, visShrub * mix(0.5, 1.0, fromAboveShrub));
  }
  float mGrass = max(0.0, 1.0 - mTree - mShrub);

  // The bare ground: sand, cinder, then lava, rough (a'a) or smooth (pahoehoe).
  float sandShare = bare > 0.001 ? sandF / bare : 0.0;
  float cinderShare = bare > 0.001 ? cinderF / bare : 0.0;
  float mSand = mix(sandShare, gMask(sandShare, nPatch2, 0.05), patchVis);
  float mCinder = mix(cinderShare, gMask(cinderShare / max(0.001, 1.0 - sandShare), 1.0 - nPatch2, 0.05), patchVis) * (1.0 - mSand);
  float mLava = max(0.0, 1.0 - mSand - mCinder);
  float mAa = mix(roughF, gMask(roughF, nPatch, 0.06), patchVis);

  // Their colours, relative to the average the imagery shows.
  const vec3 G_LITTER = vec3(0.09, 0.07, 0.045);
  vec3 vegLocal = mTree * mix(G_LITTER, G_TREE, fromAboveTree) + mShrub * mix(G_LITTER, G_SHRUB, fromAboveShrub) + mGrass * G_GRASS;
  vec3 vegMean = treeF * G_TREE + shrubF * G_SHRUB + max(0.0, 1.0 - treeF - shrubF) * G_GRASS;
  vec3 lavaLocal = mix(G_PAHOEHOE, G_AA, mAa);
  vec3 lavaMean = mix(G_PAHOEHOE, G_AA, roughF);
  vec3 bareLocal = mSand * sandAlbedo + mCinder * G_CINDER + mLava * lavaLocal;
  vec3 bareMean = sandShare * sandAlbedo + cinderShare * G_CINDER + max(0.0, 1.0 - sandShare - cinderShare) * lavaMean;
  vec3 local = mVeg * vegLocal + (1.0 - mVeg) * bareLocal;
  vec3 mean = veg * vegMean + (1.0 - veg) * bareMean;

  // Texture within each kind (multiplies its colour; averages about 1) and relief (m).
  float tex = 1.0;
  float vis4 = gVis(4, fp), vis5 = gVis(5, fp);
  float n3 = gNoise(GP(3)), n4 = gNoise(GP(4)), n5 = gNoise(GP(5));
  // Grass: bunches (fountain grass, in the dry leeward country) with darker ground between them, closing up into
  // turf where the imagery is green (pasture); blades within them, drier and greener patches.
  vec3 img = diffuseColor.rgb;
  float lush = clamp((img.g - max(img.r, img.b)) / max(0.25 * img.g, 0.002), 0.0, 1.0);
  float grassTex = 1.0 + 0.3 * (n3 - 0.5) * vis3;
  float grassH = 0.0;
  vec2 grassG = vec2(0.0);
  float visBunch = gVis(11, fp);
  if (mGrass * mVeg > 0.0) {
    float blades = gNoise(GP(5) * vec2(1.0, 3.0)) * 0.6 + 0.4 * n5;
    float bunchy = (1.0 - lush) * visBunch; // (pasture is a continuous turf)
    if (bunchy > 0.0) {
      // Irregular bunches: the cells warped by noise, of random sizes, some missing, ragged at their edges.
      vec2 q = GP(11);
      q += (vec2(gNoise(q * 0.5 + 3.1), gNoise(q * 0.5 + 8.7)) - 0.5) * 1.1;
      vec3 nb = gVoronoiNearest(q);
      float d = length(nb.xy), size = fract(nb.z * 7.13);
      float r = (0.35 + 0.45 * size) * step(0.08, nb.z);
      // Blades fanning out from each bunch's middle (a fountain), ragged at their tips.
      float angle = atan(nb.y, nb.x);
      float fan = gNoise(vec2(angle * 9.0 + nb.z * 40.0, d * 3.0)) * 0.6 + 0.4 * gNoise(vec2(angle * 23.0, nb.z * 17.0));
      float ragged = (fan - 0.5) * 0.6 * r;
      float inBunch = 1.0 - smoothstep(r * 0.5, r * 1.05, d + ragged);
      float dome = pow(max(0.0, 1.0 - d / max(r, 1e-3)), 0.7);
      float between = 0.62 + 0.2 * gNoise(GP(3) * 2.3); // (bare ground and litter between the bunches)
      float inside = (0.85 + 0.4 * fan) * (1.0 + 0.25 * (nb.z - 0.5)) * (0.8 + 0.3 * dome);
      blades = mix(blades, fan, inBunch);
      grassTex *= mix(1.0, mix(between, inside, inBunch), bunchy);
      grassH += inBunch * 0.06 * fan * bunchy;
      // (The dome's slope: h = 0.22 (1 - d / r)^0.7, falling away from the bunch's middle, nb.xy away.)
      float rimward = max(1.0 - d / max(r, 1e-3), 0.05);
      grassG += inBunch * bunchy * 0.22 * 0.7 * pow(rimward, -0.3) / max(r, 1e-3) * nb.xy / max(d, 1e-3) * G_INV[11];
    }
    // Blades and tufts (in pasture: the turf's own lumps).
    grassTex *= 1.0 + (0.45 * (blades - 0.5) * vis5 + 0.25 * (gNoise(GP(4) * 1.7) - 0.5) * vis4) * (0.6 + 0.4 * lush);
    grassH += (0.015 * blades * vis5 + 0.03 * gNoise(GP(4) * 1.7) * vis4) * lush;
    grassTex *= 1.0 + 0.3 * (n4 - 0.5) * vis4;
    grassH += 0.02 * n4 * vis4;
  }
  // Lava. A'a: clinker of loose blocks, some rusty. Pahoehoe: plates parted by cracks, ropes, a glassy sheen.
  float aaTex = 1.0, aaH = 0.0, pahTex = 1.0, pahH = 0.0;
  vec3 tex3 = vec3(1.0); // (a tint of the texture's own)
  float visClinker = gVis(8, fp), visPlate = gVis(9, fp);
  if (mLava * (1.0 - mVeg) > 0.0 && visClinker + visPlate > 0.0) {
    if (mAa > 0.01) {
      // Clinker: a jumble of jagged blocks of every size, each at its own height and tilt, with dark voids between.
      vec2 q = GP(8);
      q += (vec2(gNoise(q * 0.6 + 2.0), gNoise(q * 0.6 + 7.0)) - 0.5) * 0.9;
      // Two sizes of block piled together: the larger ones' tops, the smaller filling the gaps between them.
      vec3 a1 = gVoronoiNearest(q);
      vec3 a2 = gVoronoiNearest(q * 2.3 + 5.0);
      vec2 t1 = gHash2(vec2(a1.z * 97.0, 3.0)) - 0.5, t2 = gHash2(vec2(a2.z * 89.0, 7.0)) - 0.5;
      float h1 = 0.3 * a1.z + dot(t1, a1.xy) * 0.8 - 0.25 * dot(a1.xy, a1.xy);
      float h2 = 0.15 * a2.z + dot(t2, a2.xy) * 0.35 - 0.1 * dot(a2.xy, a2.xy) - 0.08;
      float top = max(h1, h2);
      float first = step(h2, h1);
      float spiky = gNoise(GP(4) * 2.0 + 3.0) * 0.6 + n5 * 0.4;
      aaH = (0.6 * top + 0.08 * spiky * vis4) * visClinker + 0.35 * (n3 - 0.5) * vis3;
      float id = mix(a2.z, a1.z, first);
      float rust = smoothstep(0.95, 0.99, fract(id * 23.0)) * 0.7; // (a few clasts oxidised red)
      vec3 clast = mix(vec3(1.0), vec3(2.2, 1.3, 0.9), rust);
      // Darker deeper down in the pile (the shade between blocks).
      aaTex = mix(1.0, (0.6 + 0.7 * fract(id * 7.0)) * (0.45 + 0.9 * clamp(top + 0.3, 0.0, 0.7)), visClinker);
      tex3 = mix(vec3(1.0), clast, visClinker * mAa);
    }
    if (mAa < 0.99) {
      // Plates of irregular size and shape, parted by cracks; a few ropy (folded) ones.
      vec2 q = GP(9);
      q += (vec2(gNoise(q * 0.7 + 1.3), gNoise(q * 0.7 + 6.1)) - 0.5) * 1.3;
      vec4 v = gVoronoi(q);
      float crack = (1.0 - smoothstep(0.0, 0.03 + fp * 0.5 * G_INV[9], v.y)) * step(0.25, fract(v.z * 13.0));
      float ropy = smoothstep(0.82, 0.9, v.z);
      // (Waves along the plate in its own coordinates, about 0.2 m apart: continuous wherever it lies.)
      vec2 toPlate = gVoronoiNearest(q).xy;
      float rope = ropy * sin(dot(toPlate, normalize(vec2(0.6 + v.w, 1.0 - v.w))) * 6.2832 * 15.0 + n3 * 6.0) * (1.0 - v.x);
      // Smooth billowy lobes (toes) of several sizes; the plates only slightly domed.
      float lobes = 0.5 * abs(gNoise(GP(2) + 2.2) - 0.5) + 0.35 * abs(gNoise(GP(3) + 4.4) - 0.5) + 0.15 * abs(gNoise(GP(3) * 2.3) - 0.5);
      pahH = (0.05 * (1.0 - v.x * v.x) - 0.05 * crack) * visPlate + 0.5 * lobes * vis3 + 0.012 * rope * vis4;
      pahTex = mix(1.0, (0.92 + 0.16 * v.z) * (1.0 - 0.6 * crack), visPlate) * (1.0 + 0.2 * (lobes - 0.15) * vis3 + 0.15 * (n4 - 0.5) * vis4);
    }
  }
  // Cinder: gravel, red and black.
  vec4 gravel = vec4(0.0);
  float visGravel = gVis(10, fp);
  // Cinder and ash: drifts of darker and redder scoria (metres), lapilli (centimetres), the odd larger lump of scoria.
  float drift = gNoise(GP(2) * 0.8 + 6.0);
  float cinderTex = (0.75 + 0.5 * drift) * (1.0 + 0.35 * (n3 - 0.5) * vis3 + 0.3 * (n4 - 0.5) * vis4);
  float cinderH = 0.06 * n3 * vis3 + 0.015 * n4 * vis4;
  vec2 cinderG = vec2(0.0);
  if ((mCinder + mSand) * (1.0 - mVeg) > 0.0 && visGravel > 0.0) {
    // Lapilli: rounded, of mixed sizes, loose (the finer ones a texture between them).
    vec3 lap = gVoronoiNearest(GP(10));
    float lr = (0.18 + 0.3 * fract(lap.z * 11.0)) * step(lap.z, 0.45);
    float pebble = sqrt(max(0.0, 1.0 - dot(lap.xy, lap.xy) / max(lr * lr, 1e-4)));
    float fine = gNoise(GP(10) * 3.1 + 2.0);
    cinderTex *= mix(1.0, mix(0.7 + 0.5 * fine, (0.5 + 1.0 * lap.z) * (0.75 + 0.35 * pebble), step(0.001, pebble)), visGravel);
    cinderH += 0.004 * fine * visGravel;
    cinderG += gDomeSlope(lap.xy, lr, 0.012, 10) * visGravel;
  }
  vec3 cinderTint = mix(vec3(0.7, 0.75, 0.85), vec3(1.15, 0.95, 0.85), drift);
  // Sand: wind ripples, grains, and wet and darker in the swash.
  // (Whole numbers of waves per lattice period along each axis, so the phase is continuous between tiles.)
  float ripple = sin(dot(GP(4), vec2(1.25, 1.0)) * 6.2832 + n3 * 5.0 + gNoise(GP(4) * 0.5) * 3.0);
  float wet = 1.0 - smoothstep(3.0, 9.0, coast + 4.0 * (n3 - 0.5));
  float sandTex = (1.0 + 0.12 * (n5 - 0.5) * vis5 + 0.08 * (n4 - 0.5) * vis4) * (1.0 - 0.45 * wet);
  float sandH = (0.012 * ripple * vis4 + 0.004 * n5 * vis5) * (1.0 - wet);

  float lavaTex = mix(pahTex, aaTex, mAa), lavaH = mix(pahH, aaH, mAa);

  // Loose stones over the dry ground: few on pasture and sand, more among dry grass and on cinder.
  float stoneTex = 1.0, stoneH = 0.0;
  vec2 stoneG = vec2(0.0);
  float visStone = gVis(12, fp);
  float stoneDensity = mVeg * mGrass * mix(0.35, 0.04, lush) + (1.0 - mVeg) * (mCinder * 0.3 + mLava * (1.0 - mAa) * 0.15);
  if (stoneDensity > 0.01 && visStone > 0.0) {
    vec3 sn = gVoronoiNearest(GP(12) + 11.0);
    float sx = length(sn.xy), sz = sn.z, sw = fract(sz * 7.13);
    if (sz < stoneDensity) {
      float r = 0.07 + 0.16 * sw * sw;
      float inStone = 1.0 - smoothstep(r - 0.015, r + 0.01, sx);
      stoneG = inStone * visStone * gDomeSlope(sn.xy, r, r * 0.8, 12);
      stoneTex = mix(1.0, mix(0.45 + 0.3 * fract(sz * 31.0), 0.7 + 0.3 * smoothstep(r, r * 1.6, sx), 1.0 - inStone), visStone);
    }
  }
  float vegTex = mTree * (0.7 + 0.6 * n3) + mShrub * (0.8 + 0.4 * n4) + mGrass * grassTex;
  float bareTex = mSand * sandTex + mCinder * cinderTex + mLava * lavaTex;
  // Mottling at every scale the imagery's pixels hide (thicker and thinner grass, soil and rock showing through,
  // weathering), strongest on vegetation.
  float vis0 = gVis(0, fp);
  float mottle = 0.45 * (gNoise(GP(0) + 3.3) - 0.5) * vis0 + 0.35 * (gNoise(GP(1) + 6.6) - 0.5) * vis1
               + 0.2 * (gNoise(GP(2) + 9.9) - 0.5) * vis2;
  tex = mix(bareTex, vegTex, mVeg) * stoneTex * (1.0 + mottle * mix(0.35, 0.6, mVeg));
  tex3 = mix(mix(vec3(1.0), cinderTint, mCinder) * mix(vec3(1.0), tex3, mLava), vec3(1.0), mVeg);
  gH = mix(mSand * sandH + mCinder * cinderH + mLava * lavaH, mGrass * grassH, mVeg) + crownH * mVeg + stoneH;
  gG = mix(mCinder * cinderG, mGrass * grassG, mVeg) + crownG * mVeg + stoneG;
  // (Pahoehoe's glassy skin glints close up; from further off its cracks, dust and weathering make it matte.)
  float glassy = (1.0 - mAa) * mLava * visPlate;
  gRough = mix(mix(0.9, 0.6, glassy) - 0.45 * wet * mSand, 0.95, mVeg);

  // The imagery's colour, split into its kinds. Near the coast its pixels are partly sea: there the ground's own
  // colours are used instead.
  // (The cover's fractions are only estimates, and the imagery's pixels are four times the cover's: the ratios are
  // kept moderate, or a patch of the brighter kind in a pixel thought to be mostly the darker blows out.)
  vec3 ratio = clamp(pow(local / max(mean, vec3(0.004)), vec3(0.6)), 0.35, 1.6);
  vec3 ground = diffuseColor.rgb * ratio;
  // (Bare ground: its kinds' own colours. Vegetation: the imagery's colour from further inland, where its pixels are
  // all land, found up the coast's distance gradient.)
  float coastal = 1.0 - smoothstep(25.0, 110.0, coast);
  if (coastal > 0.0) {
    vec4 aE, aS, bX; vec2 sX; vec3 sY;
    gFetch(vGroundCell + vec2(1.0, 0.0), gFootprint, aE, bX, sX, sY);
    gFetch(vGroundCell + vec2(0.0, 1.0), gFootprint, aS, bX, sX, sY);
    // (Up the coast's distance, in cells east and south.)
    vec2 grad = vec2((aE.a * 255.0 - 128.0) * 2.0 - coast, (aS.a * 255.0 - 128.0) * 2.0 - coast);
    vec3 inland = diffuseColor.rgb;
#ifdef USE_MAP
    if (dot(grad, grad) > 1e-6) {
      vec2 cells = normalize(grad) * max(0.0, 160.0 - coast) / groundCellMetres;
      inland = texture2D(map, vMapUv + vec2(dot(groundCellToUv.xy, cells), dot(groundCellToUv.zw, cells))).rgb;
    }
#endif
    vec3 vegRatio = clamp(pow(vegLocal / max(vegMean, vec3(0.004)), vec3(0.6)), 0.35, 1.6);
    // (Bare ground keeps the imagery's colour from inland too, split into its kinds; only sand takes its own.)
    vec3 bareRatio = clamp(pow(bareLocal / max(bareMean, vec3(0.004)), vec3(0.6)), 0.35, 1.6);
    vec3 nearCoast = mix(mix(inland * bareRatio, sandAlbedo, mSand), inland * vegRatio, mVeg);
    ground = mix(ground, nearCoast, coastal);
  }
  ground *= tex * tex3 * mix(1.0, crownAo, mVeg);

  // Steep faces: lava flows in layers a few metres thick, broken into blocks, where they are bare; elsewhere the
  // vegetation clinging to them (the imagery's colour, mottled in three dimensions: no crowns, which would stretch).
  if (steep > 0.0) {
    float alt = vGroundAltitude;
    // (Each band fades out before it is smaller than a few pixels, measured up the face as well as across it.)
    float fpz = max(fp, max(abs(dFdx(alt)), abs(dFdy(alt))));
    float zvis0 = 1.0 - smoothstep(0.17, 0.5, fpz / 3.0), zvis2 = gVis(2, fpz), zvis3 = gVis(3, fpz), zvis4 = gVis(4, fpz);
    float layer = mix(0.5, gNoise(vec2(alt * 0.33, 0.0) + GP(0) * 0.35), zvis0);
    float clinker = smoothstep(0.66, 0.8, gNoise(vec2(alt * 0.33 + 17.0, 0.0) + GP(0) * 0.35)) * zvis0;
    float blocks = mix(0.5, gNoise3(vec3(GP(2), alt * G_INV[2])), zvis2);
    float fine = mix(0.5, gNoise3(vec3(GP(3) + 3.0, alt * G_INV[3])), zvis3);
    float grain = mix(0.5, gNoise3(vec3(GP(4) + 7.0, alt * G_INV[4])), zvis4);
    vec3 rock = vec3(0.075, 0.068, 0.062) * (0.85 + 0.3 * layer) * (0.75 + 0.5 * blocks) * (0.85 + 0.3 * fine);
    rock = mix(rock, vec3(0.1, 0.07, 0.055), clinker * 0.3);
    float rockH = 0.25 * layer + 0.35 * blocks + 0.1 * fine + 0.02 * grain;
    float clinging = smoothstep(0.25, 0.75, vegCover + 0.35 * (blocks - 0.5));
    vec3 face = mix(rock * (1.0 + 0.2 * (grain - 0.5)), diffuseColor.rgb * (0.7 + 0.6 * fine) * (0.8 + 0.4 * blocks), clinging);
    ground = mix(ground, face, steep);
    gH = mix(gH, mix(rockH, 0.6 * blocks + 0.2 * fine, clinging), steep);
    gG *= 1.0 - steep;
    gRough = mix(gRough, 0.92, steep);
  }

  // Snow: on the high summits in winter, more on slopes facing north and in hollows, patchy at its edge. Where it lies
  // depends on the ground alone, not on the view or the tile: the coarse copy's height and slope (the drawn surface's
  // height depends on the tile's level, the shading's slope on the distance), and patches from noise that is never
  // faded.
  float snowAltitude = gCoarse.z;
  if (groundSnow.x > 0.0 && snowAltitude > groundSnow.y - 400.0) {
    vec2 sc = gCoarse.xy;
    float steepness = length(sc);
    float aspect = steepness > 1e-4 ? -sc.y / steepness : 0.0; // (1 facing north: the ground falls to the north)
    float slope = 1.0 - inversesqrt(1.0 + steepness * steepness);
    // (Coarse enough, 64 and 32 m, to need no fading with distance.)
    float patches = 0.6 * gNoise(GP(0)) + 0.4 * gNoise(GP(0) * 2.0 + 4.1);
    float line = groundSnow.y - 180.0 * aspect * min(1.0, steepness * 8.0) - 450.0 * (patches - 0.5) + 400.0 * slope;
    float snow = smoothstep(line - 30.0, line + 50.0, snowAltitude) * groundSnow.x;
    ground = mix(ground, G_SNOW * (1.0 + 0.06 * (n4 - 0.5) * vis4), snow);
    gH = mix(gH, 0.02 * n3 * vis3 + 0.005 * n4 * vis4, snow);
    gG *= 1.0 - snow;
    gRough = mix(gRough, 0.45, snow);
  }
  diffuseColor.rgb = ground;
#ifdef GROUND_DEBUG_ALBEDO
  diffuseColor.rgb = ground; // (shown unlit: see the renderer's groundDebug=2)
#endif
#ifdef GROUND_DEBUG
  // (The kinds, for tuning: red lava (brighter a'a), green vegetation (brighter trees), blue sand, magenta cinder.)
  diffuseColor.rgb = (1.0 - mVeg) * (mLava * vec3(0.3 + 0.7 * mAa, 0.0, 0.0) + mSand * vec3(0.0, 0.0, 1.0) + mCinder * vec3(0.8, 0.0, 0.8))
    + mVeg * vec3(0.0, 0.4 + 0.6 * mTree, 0.0);
#endif
  gDetail = smoothstep(-6.0, -2.0, coast);
  }
}
`

// Runs after <normal_fragment_maps>: the relief gH bump-maps the normal.
export const groundNormalFragment = /* glsl */`
normal = gMacro;
if (gDetail > 0.0) {
  // The shapes' exact slopes, then the rest of the relief bump-mapped from its screen derivatives.
  normal = normalize(normal - gG.x * normalize(vFrameE) - gG.y * normalize(vFrameN));
  vec3 dpdx = dFdx(-vViewPosition), dpdy = dFdy(-vViewPosition);
  float dhx = dFdx(gH), dhy = dFdy(gH);
  vec3 r1 = cross(dpdy, normal), r2 = cross(normal, dpdx);
  float det = dot(dpdx, r1);
  vec3 grad = sign(det) * (dhx * r1 + dhy * r2);
  normal = normalize(abs(det) * normal - grad);
}
`

export const groundRoughnessFragment = /* glsl */`
roughnessFactor = gRough;
`
