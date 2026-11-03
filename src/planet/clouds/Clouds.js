import * as THREE from 'three'
import { standInScene } from '../../scene/precompile.js'
import '../../scene/sunAndSkyLight.js' // registers <sun_and_sky_light> (and <atmosphere_common>)
import { SunAndSkyLight } from '../../scene/sunAndSkyLight.js'
import { cloudNoiseTextures, smearStats, midShapeStats, SHAPE_SIZE, DETAIL_SIZE } from './cloudNoise.js'
import { WeatherMap } from './weatherMap.js'
import { RealClouds } from './realClouds.js'
import { RAIN_AREA } from '../../physics/weather.js'
import { MULTIPLE_SCATTERING } from '../../scene/skyIrradiance.js'

// Volumetric clouds over the whole planet, from the weather (weatherMap.js) and tiling noise
// (cloudNoise.js), drawn over the rendered scene in three passes at RESOLUTION of the screen:
//
// 1. Distance: the scene again, writing each pixel's distance from the camera, so the clouds stop at
//    whatever is in front of them (the ground, the sea, the ring, a vehicle in a cloud).
// 2. Clouds: each pixel's line of sight is marched through the cloud shell (sea level to SHELL_TOP over
//    the ellipsoid, stretched to a sphere as the sky does), up to the ground or the scene, across the
//    cells of a grid fixed to the planet (see main): what is drawn depends on where the camera is only
//    through where it is seen from, so moving the camera never makes the clouds shimmer, slide or pop
//    (samples at distances from the camera, or jittered, sliced them into terraces that slid as it
//    moved); nothing changes from frame to frame, so recordings are repeatable. Along the way:
//    - The weather map gives the cover, the low cloud layer's base and top, the convective share, the
//      rain and the wind. Convective weather gives cumulus, rising into towers in heavy showers;
//      otherwise the layer is stratiform.
//    - The density is the shape noise, its gaps widened where the cover is low and its edges eroded by
//      the detail noise, through the layer's height profile. The noise is anchored to the planet
//      (sampled at planet coordinates relative to the camera plus the camera's position modulo the
//      tile, worked out in float64), and drifts with the wind by flow-mapping: two copies, each
//      displaced by the wind for up to DRIFT_PERIOD and restarted in turn, cross-faded, so the drift
//      never distorts it without bound.
//    - Light: the sun's (dimmed by the air and the planet's shadow: sunAndSkyLight.js) through the
//      cloud towards the sun (a short march), with a two-lobed phase function and approximate
//      multiple scattering; the sky's and the ground's from below and above; and the haze between
//      the camera and the cloud.
//    Below the clouds the march also crosses the air's own murk: rain shafts under raining clouds
//    (rainShaft), and haze, mist or sea fog from the humidity near the surface (airMurk), which cut how
//    far one can see. They are lit by the sun as it reaches the end of the line of sight (one shadow
//    march per pixel rather than per step, so there are no shafts of light through them).
//    And for each pixel showing the scene, how much its light is dimmed by the clouds: the sun's share
//    of the light there (sunAndSkyLight.js's model) times the cloud's transmittance towards the sun
//    (cloudShadow), and the sky's share less under overcast.
// 3. Composite: the scene dimmed by the clouds' shadow, the clouds over it (premultiplied; their
//    transmittance dims what is behind), and rain streaks when the camera is in the rain.

// The cloud target's resolution (of the screen's), the same from every height (switching it changed the
// pixels' footprints, and with them the clouds' detail, at once). This is High quality's; the graphics
// quality setting can choose a lower one (Clouds.resolution, GraphicsQuality.js).
const RESOLUTION = 0.5
// The pixel footprints (m) over which the clouds become a flat layer of the real clouds' opacity, at
// FLAT_HEIGHT (m), as the imagery shows them from far out in space (too small to see as shapes, and the
// march's cells are too few to show them steadily).
const FLAT_FOOTPRINT = [1500, 5000]
const FLAT_HEIGHT = 2000
// The lightest quality's (CLOUD_LITE_FLAT): from nearer.
const LITE_FLAT_FOOTPRINT = [250, 800]
// The flat layer's light: shares of the sunlight on it (by the sun's height) and of the sky's.
const FLAT_SUN = 0.55
const FLAT_SKY = 1.0
const SHELL_TOP = 13000 // m
// The march (see main): the cloud layer, from LAYER_BOTTOM (m) up (below the lowest cloud bases), in the
// cells of a grid fixed to the planet: fine cells CELL_MIN (m) and up, powers of two at about CELL_SHARE
// of the distance, climbing or falling no more than VERTICAL_CELL (m) across one (HIGH_CELLS times both
// where there can only be high cloud), in coarse cells COARSE fine ones across, up to CELL_MAX (m), at
// most MAX_COARSE of them; HEIGHT_MARGIN (m): how far beyond a column's layers cloud is looked for.
// MURK_STEPS across each stretch below the layer.
const CELL_MIN = 16
const CELL_MAX = 8192
const CELL_SHARE = 0.004
const COARSE = 8
// (CLOUD_LITE_COLUMNS: coarse cells twice as long where a pixel's footprint is under this, m.)
const LITE_COLUMNS_FOOTPRINT = 100
// (CLOUD_LITE_CELLS: fine cells twice as long for every this many a line of sight has been through.)
const LITE_CELL_BUDGET = 48
const MAX_COARSE = 1500
const HEIGHT_MARGIN = 100
const HIGH_CELLS = 8
const VERTICAL_CELL = 150
const MURK_STEPS = 10
const LAYER_BOTTOM = 250
// The pixel footprints (m) over which the clouds' shapes fade to their expected density.
const LOD_FOOTPRINT = [150, 900]
const LIGHT_STEPS = 5
// The lighter qualities' light (CLOUD_LITE_LIGHT, liteDepths): the density (0..1) it passes through inside a
// cloud, less than the cores' (the light finds its way between the shapes).
const LITE_DENSITY = 0.03
const LITE_REACH = 2000
const LITE_SUN_STEPS = [60, 250]
const LITE_AMBIENT = 0.5
// The sky's and the ground's light inside the clouds: dimmed by the cloud above (or below) as
// exp(-AMBIENT_EXTINCTION * its optical depth), slower than the direct sunlight as it is scattered on
// rather than lost; VERTICAL_STEPS samples each way (see verticalDepth).
const AMBIENT_EXTINCTION = 0.5
const VERTICAL_STEPS = 4
// The noise tiles (m): shape and detail.
const SHAPE_TILE = 8000
const DETAIL_TILE = 3000
// The detail noise fades to its average over these pixel footprints, in its texels (DETAIL_TILE / DETAIL_SIZE).
const DETAIL_FADE = [1.5, 4]
// The mid-level layer's shapes are on MID_TILE (m, dividing SHAPE_TILE), smaller than the low cloud's, and
// move with the wind aloft (MID_WIND times the surface's).
const MID_TILE = 2000
const MID_WIND = 2.5
// Its depth (m), from altocumulus's to altostratus's (by its stratiform share), and altostratus's density (a
// deep but thin sheet, through which the sun shows dimly).
const MID_DEPTH = [200, 1500]
// Altocumulus is thin: its cloudlets' density at their cores is MID_THIN of the low cloud's (an optical depth
// of a few through one), graded from the core to nothing at the edge of its cell, without the cumulus's
// crisp, dense outlines (see CUMULUS_DENSITY). So overhead it is a faint, soft mottling, and its cells stand
// out only when the light crosses the layer (a low sun), as a mackerel sky does. (Dense, it was a field of
// white popcorn over everything below.)
const MID_THIN = 0.3
// It comes in patches (see MACRO_TILE), not evenly across a weather cell: their edges' softness in the
// large-scale field.
const MID_PATCH_EDGE = 0.06
// (The patches' tile (m; dividing MACRO_TILE, so that its offset serves): patches some kilometres across.)
const MID_PATCH_TILE = 50000
const MID_PACKED = 0.8
// (The share of a cell's rise from its edge to its core over which its density rises: the lanes between.)
const MID_FILL = 0.6
const MID_EDGE_COVER = 0.7
// MID_MASK: altocumulus's cells are a 2D mask (Worley cells on MID_MASK_TILE, about 125 m across, the same
// at every height through the layer), which thins its cloud by up to MID_MASK_DEPTH where they meet (where
// the Worley value is under MID_MASK_EDGE), right through the layer; the volumetric noise (on MID_TILE) its
// larger structure. Looking up, a line of sight along the lanes between the cells sees them thin; a
// slanting one crosses them quickly, through the cells either side, so towards the horizon the cells merge.
// (They fade out from the start of its level of detail's range, as being the finest.)
const MID_MASK_TILE = 1000
const MID_MASK_DEPTH = 0.95
const MID_MASK_EDGE = [0.25, 0.6]
// (MID_MASK_MEAN: the mask's thinning averaged over the noise, for the light through the layer, which does not
// read the mask.)
function midMaskMean(shape) {
  const d = shape.image.data, smooth = (e0, e1, x) => { const t = Math.min(Math.max((x - e0) / (e1 - e0), 0), 1); return t * t * (3 - 2 * t) }
  let sum = 0
  for (let i = 0; i < d.length; i += 4) sum += 1 - MID_MASK_DEPTH + MID_MASK_DEPTH * smooth(MID_MASK_EDGE[0], MID_MASK_EDGE[1], d[i + 2] / 255)
  return sum / (d.length / 4)
}
// Its smaller tile repeated visibly (rows of the same shapes towards the horizon): its noise is averaged
// with the noise again on a tile MID_RATIO (the golden ratio) times smaller, so that the two have no period
// in common and the pattern does not repeat. (A turned copy did the same, but its matrix slowed the whole
// march.)
const MID_RATIO = (1 + Math.sqrt(5)) / 2
const RATIO_TILE = MID_TILE / MID_RATIO
// The mid-level cloud's shape is MID_CELLS Worley noise (rounded cells, as altocumulus are in), and the rest
// the billowy noise the low cloud uses; its thresholds are its own distribution's (midShapeStats).
const MID_CELLS = 0.3
// Altostratus (the stratiform mid-level cloud) is a fairly even sheet, the sun showing dimly through it as
// through ground glass (an optical depth of about 5): its shapes fade to their expected density as its
// stratiform share rises over MID_SHEET_EVEN (with the altocumulus's cells it was a field of soft blobs), at
// MID_SHEET_DENSITY of that.
const MID_SHEET_EVEN = [0.5, 1.0]
// (But not wholly even where it is seen, only where the light passes through it: MID_SHEET_TEXTURE of the
// shapes is left, the little texture real altostratus has.)
const MID_SHEET_TEXTURE = 0.35
// The pixel footprints (m) over which the mid-level cloud's shapes fade to their expected density: smaller
// than the low cloud's (LOD_FOOTPRINT), as its shapes are, so that towards the horizon altocumulus blurs
// together, as it does, rather than packing its cells (and the noise's repetition) into rows of texture.
const MID_LOD_FOOTPRINT = [6, 24]
const MID_SHEET_DENSITY = 1.0
// The mid-level layer's opacity seen from space per unit of its cover, from altocumulus's to altostratus's,
// and the most of the cloudy share of the sky (after the high cloud) it may take.
const MID_OPACITY = [0.2, 0.85]
// (And the low cloud's.)
const LOW_OPACITY = 0.9
// Near the camera, a finer octave of the detail noise (on FINE_TILE, m, which divides DETAIL_TILE) in the
// erosion, fading out over pixel footprints of FINE_FOOTPRINT (m): without it, close clouds were smooth blobs.
const FINE_TILE = 750
const FINE_FOOTPRINT = [4, 24]
const FINE_SHARE = 0.5
// Large-scale structure (cloud streets and cells, clusters and gaps): the shape noise again on this tile
// (m), moving the cover through a probit transform, so it shows where the clouds themselves are too
// small to see (from orbit).
const MACRO_TILE = 400000
// The clouds' types. The cover, where the satellite imagery is (realClouds.js; otherwise the weather's),
// is shared between three layers in proportion to how much of each the weather has today (weatherMap.js's
// cloud types: the real world's mix from surface observations, moved by the day's highs and lows; see
// cloudColumn):
// - High cloud (cirrus, cirrostratus): thin (opacity HIGH_OPACITY where it is, an optical depth of about
//   0.3, so it covers a good deal more of the sky than its opacity; thin cirrus is what the faint
//   brightening of the imagery over clear sea mostly is), up to HIGH_SHARE of the opacity; HIGH_THICKNESS
//   (m) deep from the high cloud base, drawn out into streaks along the wind (which is CIRRUS_WIND times
//   the surface's aloft).
// - Mid-level cloud (altocumulus, altostratus; not in the lighter qualities, whose low cloud takes its
//   share): as opaque as MID_OPACITY, by its type.
// - Low cloud for the rest of the opacity, less LOW_FLOOR of it (the imagery's opacity varies about the
//   blurred share the upper layers take, and a thin sky would otherwise always have some low cloud under its
//   cirrus): a few fair-weather cumulus where there is little (FAIR_CUMULUS of the sky, more with
//   convection, in fields a few hundred kilometres across covering about FAIR_FIELDS of the clear sky, the
//   rest clear); stratocumulus and stratus as the weather's mix has them, and a stratus sheet wherever the
//   cover rises over STRATUS_ONSET; towers in showers (the weather's, where the imagery has cloud:
//   SHOWER_OPACITY).
const HIGH_SHARE = 0.45
// The noon sun's elevations (degrees) over which the imagery's cover gives way to the weather's (see realShare).
const NOON_SUN_FADE = [15, 25]
const LOW_FLOOR = 0.12
const HIGH_BLUR = 60000 // m
const SHOWER_OPACITY = [0.3, 0.7]
const HIGH_OPACITY = 0.25
const HIGH_THICKNESS = 1500
const HIGH_TILE = 30000
const HIGH_DENSITY = 0.012
// Its fibres (cirrus): the shape noise on FIBRE_TILE (m) (its channels by FIBRE_WEIGHTS, favouring the
// finer octaves, for narrow streaks), stretched FIBRE_STRETCH times along the east-west lines of the
// planet's latitude and longitude, into hair-like streaks a few hundred metres across and kilometres long,
// bent by the patches' noise (FIBRE_BEND, m per tenth of it) into curls and hooks; the cloud is where that
// rises over FIBRE_EDGES (in standard deviations of it, see smearStats), and denser there, so the streaks
// gather some of the cloud the layer would have spread evenly. (Averaged instead along the wind over a
// dozen points, a few hundred metres apart, as far apart as the noise's finest cells, the fibres were
// grains: cirrocumulus. Stretched along latitude and longitude, they are fixed to the planet wherever the
// camera is, from one point; stretched along the wind, they would need a point to stretch about, and
// about the camera they slid and jumped. The upper winds are mostly zonal.)
// Where the high cloud's opacity rises over VEIL_OPACITY it thickens into an even veil (cirrostratus);
// below that it is streaks. (By the opacity: the cover saturates wherever there is much cirrus at all.)
const FIBRE_TILE = 4000
const FIBRE_STRETCH = 16
const FIBRE_BEND = 1500
const FIBRE_WEIGHTS = [0.4, 0.3, 0.3, 0.0]
const FIBRE_EDGES = [0.3, 1.5]
// Cirrocumulus: the high cloud's fibres turned into small rounded cells in rows (by the share
// Clouds.cirrocumulus; from the weather, none yet): the shape noise on CELLS_TILE (m), unstretched and
// unbent, by CELLS_WEIGHTS (favouring the finest Worley octaves, cells about a hundred metres across, a
// degree or less seen from below).
const CELLS_TILE = 3000
const CELLS_WEIGHTS = [0.1, 0.0, 0.6, 0.3]
const VEIL_OPACITY = [0.35, 0.45]
// The streaks: the shape noise averaged over STREAK_TAPS points along HIGH_STREAK_LENGTH (m) of the wind
// (which narrows its spread; STREAK_SPREAD restores it).
const STREAK_TAPS = 3
const HIGH_STREAK_LENGTH = 20000
const STREAK_SPREAD = 1.45
const CIRRUS_WIND = 3
// Low cloud mostly either covers much of the sky or is absent, breaking up in a narrow band at the edges
// of overcast masses: where the imagery's opacity is low, the cloud it shows is mostly thin haze and the
// odd cloud rather than a field of cumulus, so the low cover is faded out below LOW_COVER_EDGES[1], to
// none at LOW_COVER_EDGES[0]. (Pushing the higher covers to a full cover too made overcast masses solid
// blocks with flat sides and walls along the imagery's texels.) Only at the imagery's own resolution: a
// larger area's average cover (a coarser footprint) is left as it is, so this fades out over pixel
// footprints of SHARPEN_FOOTPRINT imagery texels. The fade follows the imagery blurred over SHARPEN_BLUR
// mip levels (~2^levels texels), so that the edges follow smooth contours rather than the texels.
const LOW_COVER_EDGES = [0.2, 0.5]
const SHARPEN_FOOTPRINT = [1, 8]
const SHARPEN_BLUR = 1.5
// The low layer's depth (m): cumulus CUMULUS_DEPTH[0] deep, and up to CUMULUS_DEPTH[1] more as the cover
// rises (towers in showers aside); stratiform cloud STRATUS_DEPTH_SHARE of the reanalysis's layer, within
// STRATUS_DEPTH.
const CUMULUS_DEPTH = [500, 900]
const STRATUS_DEPTH_SHARE = 0.5
const STRATUS_DEPTH = [500, 1200]
// Showers: cumulus congestus SHOWER_DEPTH (m) deep in heavy showers, towering a further TOWER_DEPTH (m) into
// cumulonimbus only in scattered cells: where the shape noise on TOWER_TILE (m) is above its quantile
// leaving TOWER_SHARE of the area. (Every heavy shower was a 9 km tower, a wall of them over the whole
// rainy area, which also cost the most to draw.)
const SHOWER_DEPTH = 3000
const TOWER_DEPTH = 6000
const TOWER_TILE = 80000
const TOWER_SHARE = 0.25
const CUMULUS_EROSION = 0.6
const CUMULUS_DENSITY = 3.0
// ...near the camera: they fade to the plain erosion and density over pixel footprints of CRISP_FOOTPRINT (m),
// where the billows would be smaller than a pixel (and shimmer as the camera moves).
const CRISP_FOOTPRINT = [2, 20]
const FAIR_CUMULUS = [0.012, 0.03]
// Cumulus are smaller than stratocumulus: their shapes are read CUMULUS_SCALE times finer (an integer, so the
// tile still divides SHAPE_TILE). They come in fields (CU_FIELD_TILE, m, dividing MACRO_TILE: some kilometres
// across) with CU_PACKED of the sky inside, edges CU_FIELD_EDGE soft in the field's noise.
const CUMULUS_SCALE = 2
const CU_FIELD_TILE = 40000
const CU_PACKED = 0.2
const CU_FIELD_EDGE = 0.03
const FAIR_FIELDS = 0.35
const STRATUS_ONSET = [0.4, 0.85]
// The sunlight diffused through the cloud to its base (see diffuseSun): cumulus's, a sheet's.
const DIFFUSE_SUN = [0.05, 0.15]
const DRIFT_PERIOD = 2400 // s
// The phase function's asymmetry in the second and third octaves of the multiple scattering (cloudScatter),
// of the first's.
const PHASE_OCTAVES = [0.6, 0.3]
// Extinction (1/m) of a cloud at full density.
const EXTINCTION = 0.03
// (The sheet's expected density before MID_SHEET_DENSITY: the far density's (see lowCloudDensity) for a full
// cover, times the stratiform profile's mean.)
const MID_SHEET_MEAN = -Math.log(0.05) / (EXTINCTION * MID_DEPTH[1] * 0.5) * 0.8
// The air's murk (airMurk): the visibility (m) for the surface humidity, CLEAR_VISIBILITY up to 88% and
// falling to fog near saturation: about 60 km at 90%, 15 km at 95%, 600 m at 99%. It adds what the
// atmosphere's own aerosol (atmosphereCommon.glsl's ATMO_BETA_M, marine air: ATMO_VISIBILITY, repeated
// here) leaves out: the haze of dry air is the atmosphere's, lit as the sky is.
const ATMO_VISIBILITY = 3.912 / (80e-6 * 1.1 + 13.5e-6)
const CLEAR_VISIBILITY = ATMO_VISIBILITY
const FOG_VISIBILITY = 300
// Rain: visibility (m) for a rain rate R (mm/h), RAIN_VISIBILITY * R^-0.63.
const RAIN_VISIBILITY = 12000
// The clouds' shadow on the scene: samples across the low and the high cloud (see cloudShadow).
const SHADOW_STEPS = 16
const SHADOW_HIGH_STEPS = 4

// Cloud types, for testing and tuning one at a time (Clouds.setCloudTypeTest): each sets the columns'
// fields everywhere, over whatever the weather gives. low: [cover, stratiform, showers, base (m), top (m)];
// high: [cover, opacity, base (m)], cells: its share of cirrocumulus (0: cirrus); mid: [cover, stratiform, base (m)]; rain (mm/h) and
// humidity. Unset layers are clear.
export const CLOUD_TYPES = [
  { name: 'cumulus', low: [0.3, 0, 0, 900, 1900] },
  { name: 'cumulus congestus', low: [0.45, 0, 0.6, 800, 4500] },
  { name: 'cumulonimbus', low: [0.5, 0, 1, 700, 11000] },
  { name: 'stratocumulus', low: [0.85, 0.6, 0, 700, 1500] },
  { name: 'stratus', low: [1, 1, 0, 300, 900] },
  { name: 'nimbostratus', low: [1, 1, 0, 700, 4500], rain: 3, humidity: 0.95 },
  { name: 'altocumulus', mid: [0.6, 0, 3500] },
  { name: 'altostratus', mid: [1, 1, 3000] },
  { name: 'cirrus', high: [0.6, 0.15, 9000] },
  { name: 'cirrocumulus', high: [0.6, 0.15, 9000], cells: 1 },
  { name: 'cirrostratus', high: [1, 0.45, 9000] },
]

const fullscreenVertex = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

const distanceMaterial = new THREE.ShaderMaterial({
  vertexShader: `
#include <common>
#include <logdepthbuf_pars_vertex>
varying float vCloudDistance;
void main() {
  #include <begin_vertex>
  #include <project_vertex>
  #include <logdepthbuf_vertex>
  vCloudDistance = length(mvPosition.xyz);
}
`,
  fragmentShader: `
#include <common>
#include <logdepthbuf_pars_fragment>
varying float vCloudDistance;
void main() {
  #include <logdepthbuf_fragment>
  gl_FragColor = vec4(vCloudDistance, 0.0, 0.0, 1.0);
}
`,
  side: THREE.DoubleSide,
})

// The cloud march's fragment shader, for the shape noise's statistics (cloudNoise.js).
const marchFragment = (stats, detailMean, maskMean, mid = midShapeStats(MID_CELLS)) => `
#define ATMO_SKY_AEROSOL
#include <common>
#include <sun_and_sky_light>
precision highp sampler3D;
uniform sampler2D distanceMap;
uniform sampler2D weatherA;
uniform sampler2D weatherB;
uniform sampler2D weatherC;
uniform sampler2D weatherD;
uniform sampler3D shapeNoise;
uniform sampler3D detailNoise;
uniform sampler3D occupancy;      // bounds on the shape noise (cloudNoise.js)
uniform mat4 inverseProjection;
uniform mat4 cameraWorld;
uniform mat3 worldToPlanet;
uniform vec3 shapeOffset[2];    // the camera's planet position modulo the shape tile (m), for each drift copy
uniform vec3 detailOffset[2];
uniform vec3 cameraGrid;        // the camera's planet position modulo CELL_MAX (m), for the march's grid
uniform vec3 cameraPlanet;      // the camera's planet position (m; float32, for the high cloud's streaks)
uniform vec3 driftShift[2];     // each drift copy's own shift (m)
uniform vec3 macroOffset;        // the camera's planet position modulo the large-scale tile (m)
uniform vec3 towerOffset;        // the camera's planet position modulo TOWER_TILE (m)
uniform vec3 ratioOffset[2];     // shapeOffset's position (each drift copy's) modulo RATIO_TILE (m)
uniform sampler2D realClouds;    // the real clouds' opacity (realClouds.js)
uniform float realBlend;         // 1 where the real clouds' opacity sets the cover (it has loaded), else 0
uniform float realDeclination;   // the sun's declination (degrees) on the snapshot's day
uniform float realTexel;         // the real clouds' texel size (m)
uniform vec3 drift;             // x, y: the two copies' drift times (s); z: the second copy's weight
uniform vec2 exposure;          // x: the sky's exposure (Planet.js); y: the sun's intensity
uniform ivec2 lightSteps;       // LIGHT_STEPS, VERTICAL_STEPS (a uniform, so their loops are not unrolled)
// Always 1. A loop whose count is multiplied by it is not unrolled (the compiler cannot know the count):
// unrolled, a long loop of texture reads has them all issued at once, which needs registers for all their
// results, and the march spilled registers to memory (and on small GPUs the code outgrew the
// instruction cache). Such loops are unrolled by hand in groups of a few reads, enough to keep the GPU's
// memory busy.
uniform int noUnroll;
uniform int cloudTypeTest;      // 1: the sky filled with a test type (setCloudTypeTest)
uniform vec3 midTest;           // the cloud type's mid-level layer (cover, stratiform share, base), if any
uniform vec4 lowTest;           // its low cloud's cover, stratiform share, showers and base (m)
uniform vec3 lowTest2;          // its low cloud's top (m), and the rain (mm/h) and humidity (if rain >= 0)
uniform vec3 highTest;          // its high cloud's cover, opacity and base (m)
uniform float cirrocumulus;     // the high cloud's share of cirrocumulus (see CELLS_TILE)
// The high cloud's fibres or cells (see FIBRE_TILE and CELLS_TILE, for its share of cirrocumulus, worked out
// once rather than for each sample): 1 / their tile east and north (m), how far they bend (m per unit of the
// patches' noise); the noise channels' weights; its mean, 1 / its standard deviation and 1 / the root of the
// share of the sky the fibres fill.
uniform vec4 fibreTiles;
uniform vec4 fibreWeights;
uniform vec3 fibreStats;
uniform float pixelAngle;       // radians per pixel of the cloud target
varying vec2 vUv;
layout(location = 0) out vec4 outClouds;
layout(location = 1) out vec4 outShade;  // r: the scene's dimming by the clouds; g: rain at the camera (mm/h)

const float SHELL_TOP = ${SHELL_TOP.toFixed(1)};
const int MURK_STEPS = ${MURK_STEPS};
// (CLOUD_LITE_FLAT: the flat layer from nearer, for the lightest quality: from orbit, the imagery alone.)
#ifdef CLOUD_LITE_FLAT
const float FLAT_FOOTPRINT0 = ${LITE_FLAT_FOOTPRINT[0].toFixed(1)}, FLAT_FOOTPRINT1 = ${LITE_FLAT_FOOTPRINT[1].toFixed(1)};
#else
const float FLAT_FOOTPRINT0 = ${FLAT_FOOTPRINT[0].toFixed(1)}, FLAT_FOOTPRINT1 = ${FLAT_FOOTPRINT[1].toFixed(1)};
#endif
const float LAYER_BOTTOM = ${LAYER_BOTTOM.toFixed(1)};
const float EXTINCTION = ${EXTINCTION.toFixed(4)};

float remap(float v, float a, float b, float c, float d) { return c + (v - a) / (b - a) * (d - c); }

// The cost view (Clouds.setCostView): how much work each pixel took, counted instead of drawn.
#ifdef CLOUD_COST
vec4 cost = vec4(0.0);   // columns looked up, densities (full: with the detail), light march samples, fine cells
vec2 cost2 = vec2(0.0);  // high cloud with fibres, shadow samples
#define COST(field) field += 1.0;
#else
#define COST(field)
#endif

// The rain under the clouds that are raining (mm/h; weather.js showerRain), from the weather map.
float showerRain(vec4 weather) {
  return weather.g / mix(${RAIN_AREA[0].toFixed(3)}, ${RAIN_AREA[1].toFixed(3)}, weather.b);
}

// The shape value's quantiles (cloudNoise.js): the threshold that leaves a fraction cover above it.
const float SHAPE_QUANTILE[${stats.quantiles.length}] = float[](${stats.quantiles.map(q => q.toFixed(5)).join(', ')});
const float SHAPE_MEAN = ${stats.mean.toFixed(5)};
const float SHAPE_TOP = ${stats.quantiles[stats.quantiles.length - 2].toFixed(5)};
const float MID_QUANTILE[${mid.quantiles.length}] = float[](${mid.quantiles.map(q => q.toFixed(5)).join(', ')});
const float MID_MEAN = ${mid.mean.toFixed(5)};
const float MID_TOP = ${mid.quantiles[mid.quantiles.length - 2].toFixed(5)};
float normalCdf(float x) {
  float t = 1.0 / (1.0 + 0.2316419 * abs(x));
  float tail = exp(-0.5 * x * x) * 0.3989422804 * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0.0 ? 1.0 - tail : tail;
}
float probit(float p) {
  float q = p < 0.5 ? p : 1.0 - p;
  float t = sqrt(-2.0 * log(q));
  float x = t - (2.515517 + 0.802853 * t + 0.010328 * t * t) / (1.0 + 1.432788 * t + 0.189269 * t * t + 0.001308 * t * t * t);
  return p < 0.5 ? -x : x;
}
float coverThreshold(float cover) {
  float x = clamp(1.0 - cover, 0.0, 1.0) * ${(stats.quantiles.length - 1).toFixed(1)};
  int i = int(min(floor(x), ${(stats.quantiles.length - 2).toFixed(1)}));
  return mix(SHAPE_QUANTILE[i], SHAPE_QUANTILE[i + 1], x - float(i));
}
// The same for the mid-level cloud's shape (midShapeStats).
float midCoverThreshold(float cover) {
  float x = clamp(1.0 - cover, 0.0, 1.0) * ${(stats.quantiles.length - 1).toFixed(1)};
  int i = int(min(floor(x), ${(stats.quantiles.length - 2).toFixed(1)}));
  return mix(MID_QUANTILE[i], MID_QUANTILE[i + 1], x - float(i));
}

// The planet frame position (m, relative to the camera) and its latitude/longitude (degrees) for a
// point at offset o (world axes) from the camera; p is that point in the stretched frame.
vec2 latLon(vec3 p) {
  vec3 q = worldToPlanet * p;
  float k = 1.0 + slPole.w;
  return vec2(degrees(atan(k * q.y, length(q.xz))), degrees(atan(q.x, q.z)));
}

vec2 mapUv(vec2 ll) { return vec2(ll.y / 360.0 + 0.5, (ll.x + 90.0) / 180.0); }

// The two copies of the noise (flow-mapped with the wind) at q, cross-faded with their spread kept.
// How much of the finer octave the detail noise has (see FINE_FOOTPRINT; set by columnDensity).
float fineWeight = 0.0;
// How crisp cumulus are (1 near, 0 far: see CRISP_FOOTPRINT; set by columnDensity).
float crispWeight = 0.0;
// log2 of the footprint (m) of the samples being taken (set by columnDensity and levelsOfDetail): the detail
// noise and the high cloud's fibres fade to their averages, unread, where they are too fine to see.
float noiseLevel = 0.0;

// flatShift and mask (mid-level only): the vector from local down its vertical to the layer's base, and the
// 2D mask there (see MID_MASK; read only withMask). small (low cloud only): the share of the shapes read at
// CUMULUS_SCALE. full: the detail noise too.
float driftedShape(vec3 local, vec3 wind, float scale, out float detail, bool full, vec3 flatShift, out float mask, float small, bool withMask) {
  float shape = 0.0;
  detail = 0.0;
  mask = 0.0;
  for (int i = 0; i < 2; i++) {
    float weight = i == 0 ? 1.0 - drift.z : drift.z;
    vec3 q = local - wind * (i == 0 ? drift.x : drift.y);
    vec4 s = texture(shapeNoise, (q + shapeOffset[i]) * (scale / ${SHAPE_TILE.toFixed(1)}));
    float fbm = s.g * 0.625 + s.b * 0.25 + s.a * 0.125;
    float value = remap(s.r, fbm - 1.0, 1.0, 0.0, 1.0);
    if (scale > 1.5) {
      // (Mid-level: rounded cells, from the Worley noise more than the billowy (see MID_CELLS); averaged with
      // the same on a second tile (see MID_RATIO), its spread restored.)
      vec4 t = texture(shapeNoise, (ratioOffset[i] + q) / ${RATIO_TILE.toFixed(3)});
      float cells = s.b * 0.75 + t.b * 0.25;  // (one octave of cells, mostly one tile: averaging blurred them away)
      value = mix(0.5 * (value + remap(t.r, t.g * 0.625 + t.b * 0.25 + t.a * 0.125 - 1.0, 1.0, 0.0, 1.0)), cells, ${MID_CELLS.toFixed(2)});
      // (The 2D mask: Worley cells on MID_MASK_TILE, the same at every height.)
      if (withMask) mask += weight * texture(shapeNoise, (q + flatShift + shapeOffset[i]) / ${MID_MASK_TILE.toFixed(1)}).b;
    }
    else if (small > 0.0) {
      // (Cumulus: the shapes CUMULUS_SCALE times smaller, fixed to the planet as the large ones are, so that
      // blending between them by the cloud's type does not make them slide.)
      vec4 c = texture(shapeNoise, (q + shapeOffset[i]) * (${CUMULUS_SCALE.toFixed(1)} / ${SHAPE_TILE.toFixed(1)}) + vec3(0.37, 0.53, 0.19));
      value = mix(value, remap(c.r, c.g * 0.625 + c.b * 0.25 + c.a * 0.125 - 1.0, 1.0, 0.0, 1.0), small);
    }
    shape += weight * value;
    if (full) {
      // (Its average where a pixel spans several of its texels (DETAIL_FADE), unread: there it only aliased into
      // speckle and moire.)
      float detailFade = smoothstep(${(DETAIL_FADE[0] * DETAIL_TILE / DETAIL_SIZE).toFixed(1)}, ${(DETAIL_FADE[1] * DETAIL_TILE / DETAIL_SIZE).toFixed(1)}, exp2(noiseLevel));
      float fbm = ${detailMean.toFixed(5)};
      if (detailFade < 1.0) {
        vec4 dn = texture(detailNoise, (q + detailOffset[i]) / ${DETAIL_TILE.toFixed(1)});
        fbm = mix(dn.r * 0.625 + dn.g * 0.25 + dn.b * 0.125, fbm, detailFade);
      }
      if (fineWeight > 0.0) {
        vec4 fn = texture(detailNoise, (q + mod(detailOffset[i], ${FINE_TILE.toFixed(1)})) / ${FINE_TILE.toFixed(1)});
        fbm = mix(fbm, mix(fbm, fn.r * 0.625 + fn.g * 0.25 + fn.b * 0.125, ${FINE_SHARE.toFixed(2)}), fineWeight);
      }
      detail += weight * fbm;
    }
  }
  // (Cross-fading two copies narrows the spread: restore it, so the cover stays the same.)
  float mean = scale > 1.5 ? MID_MEAN : SHAPE_MEAN;
  return mean + (shape - mean) / length(vec2(1.0 - drift.z, drift.z));
}

// Density (0..1) of thresholded noise for a cover: from 0 at the threshold to 1 near the noise's top
// (SHAPE_TOP), so even sparse clouds are dense at their cores.
float thresholdDensity(float shape, float cover) {
  float threshold = coverThreshold(cover);
  return clamp((shape - threshold) / max(SHAPE_TOP - threshold, 0.02), 0.0, 1.0);
}


// The low cloud's opacity with its low values faded out (LOW_COVER_EDGES), at the imagery's resolution (see
// SHARPEN_FOOTPRINT).
// lowOpacity: as the imagery shows it at the footprint; soft: from the imagery blurred (SHARPEN_BLUR).
float sharpenLow(float lowOpacity, float soft, float footprint) {
  float strength = 1.0 - smoothstep(${SHARPEN_FOOTPRINT[0].toFixed(1)} * realTexel, ${SHARPEN_FOOTPRINT[1].toFixed(1)} * realTexel, footprint);
  return lowOpacity * mix(1.0, smoothstep(${LOW_COVER_EDGES[0].toFixed(2)}, ${LOW_COVER_EDGES[1].toFixed(2)}, soft), strength);
}

// The real clouds' (or the weather's) opacity at uv, blurred for sharpening (see SHARPEN_BLUR).
float softOpacity(vec2 uv, float weatherOpacity, float share, float footprint) {
  if (share <= 0.0) return weatherOpacity;
  float real = textureLod(realClouds, uv, log2(max(footprint, 1.0) / realTexel) + ${SHARPEN_BLUR.toFixed(1)}).r;
  return mix(weatherOpacity, clamp((real - 0.05) / 0.95, 0.0, 1.0), share);
}

// How much of the cover comes from the real clouds' imagery at uv (once loaded): all of it, less where the
// noon sun was low on the snapshot's day (over NOON_SUN_FADE, degrees of elevation), where the weather's
// takes over. (There, over snow and ice in grazing light, the satellite's neighbouring passes look very
// different, and the imagery's clouds show their edges as arcs and straight lines: above about 75 degrees
// of latitude around the equinoxes, down to about 50 in midwinter.)
float realShare(vec2 uv) {
  float noonSun = 90.0 - abs(uv.y * 180.0 - 90.0 - realDeclination);
  return realBlend * smoothstep(${NOON_SUN_FADE[0].toFixed(1)}, ${NOON_SUN_FADE[1].toFixed(1)}, noonSun);
}

// The weather and cloud cover of a column of the sky (the same for every height in it, and changing
// little across a coarse cell of the march, which blends it between the cell's ends): from the
// textures at uv, the point p (stretched) and planet-frame offset local, for a pixel footprint (m).
struct CloudColumn {
  float highCover, highOpacity, lowCover, stratiform, showers;
  float base, top, highBase;
  vec3 wind;
  float humidity, rain;
  vec3 mid;  // the mid-level layer: cover, stratiform share, base (m) (see midLayer)
};

CloudColumn cloudColumn(vec2 uv, vec3 p, vec3 local, float footprint) {
  COST(cost.x)
  vec4 a = texture2D(weatherA, uv);
  vec4 b = texture2D(weatherB, uv);
  // The sky's opacity seen from space: the real clouds' (less the imagery's floor of faint haze and noise
  // over clear sea, about 0.05; the mip level from the pixel's footprint, as automatic derivatives mean
  // nothing along a ray and jump at the date line), or the weather's, which takes over towards the poles
  // (realShare, see POLAR_FADE).
  float opacity = a.r * 0.9;
  // The shape noise on the large-scale tile (read once, for two uses).
  vec4 m = texture(shapeNoise, (local + macroOffset) / ${MACRO_TILE.toFixed(1)});
  float field = remap(m.r, m.g * 0.625 + m.b * 0.25 + m.a * 0.125 - 1.0, 1.0, 0.0, 1.0);
  // (Large-scale structure in the weather's smooth cover, fading out as it shrinks below a pixel.)
  float macroDetail = 1.0 - smoothstep(2000.0, 8000.0, footprint);
  if (macroDetail > 0.0 && opacity > 0.01) {
    float macro = field - SHAPE_MEAN;
    opacity = normalCdf(probit(clamp(opacity, 0.005, 0.995)) + 9.0 * macro * macroDetail);
  }
  float opacitySmooth = opacity;
  float share = realShare(uv);
#ifdef CLOUD_LITE_IMAGERY
  // (The lightest quality: the high cloud's share follows the imagery unblurred too, from the one read: the
  // double vision that blurring avoided is seen from orbit, where this quality draws the flat layer instead.)
  float opacitySoft = softOpacity(uv, opacity, share, footprint);
  if (share > 0.0) {
    float real = textureLod(realClouds, uv, log2(max(footprint, 1.0) / realTexel)).r;
    opacity = mix(opacity, clamp((real - 0.05) / 0.95, 0.0, 1.0), share);
    opacitySmooth = opacity;
  }
#else
  float opacitySoft = softOpacity(uv, opacity, share, footprint);
  if (share > 0.0) {
    float real = textureLod(realClouds, uv, log2(max(footprint, 1.0) / realTexel)).r;
    opacity = mix(opacity, clamp((real - 0.05) / 0.95, 0.0, 1.0), share);
    // (And blurred over about HIGH_BLUR, for the high cloud's share: see below.)
    float smoothReal = textureLod(realClouds, uv, max(log2(max(footprint, 1.0) / realTexel), log2(${HIGH_BLUR.toFixed(1)} / realTexel))).r;
    opacitySmooth = mix(opacitySmooth, clamp((smoothReal - 0.05) / 0.95, 0.0, 1.0), share);
  }
#endif
  // Shared between the layers (weatherMap.js's cloud types: each layer's cover today). The high cloud, thin
  // (its opacity per cover HIGH_OPACITY), as much as the weather has (it barely shows from space, so the
  // imagery hardly says where it is), but no more opaque than the sky seen from space. The rest between the
  // mid-level and low layers in proportion to the weather's (at their opacities per cover, MID_OPACITY and
  // LOW_OPACITY): each one's transmittance is raised to the same power, the one that leaves the sky as
  // opaque as it is seen from space, so each keeps its share of the optical depth, and where the imagery is
  // clear, both are. (The upper layers follow the opacity blurred over HIGH_BLUR, so that only the low cloud
  // carries the imagery's edges: with more layers following them, from orbit the same pattern showed at
  // several heights, apart by parallax, as double vision. The low cloud takes the rest. The lighter
  // qualities have no mid-level layer: the low cloud takes its share too, so that from space the sky is as
  // cloudy.)
  vec4 c = texture2D(weatherC, uv);
  float highOpacity = min(a.a * ${HIGH_OPACITY.toFixed(3)}, opacitySmooth);
  float highCover = clamp(highOpacity / ${HIGH_OPACITY.toFixed(3)}, 0.0, 1.0);
  float above = 1.0 - highOpacity;  // (the share of the sky the layers above leave clear)
  vec3 mid = vec3(0.0, 0.0, c.b * 1000.0);
#ifndef CLOUD_NO_MID
  vec4 dm = texture2D(weatherD, uv);
  float midPerCover = mix(${MID_OPACITY[0].toFixed(2)}, ${MID_OPACITY[1].toFixed(2)}, dm.g);
  vec2 depths = -log(1.0 - min(vec2(dm.r * midPerCover, dm.a * ${LOW_OPACITY.toFixed(2)}), 0.99));
  float rest = -log(clamp((1.0 - opacitySmooth) / above, 0.01, 1.0));  // (the optical depth left for them)
  float midOpacity = min(1.0 - exp(-depths.x * rest / max(depths.x + depths.y, 1e-4)), midPerCover);
  mid.xy = vec2(midOpacity / midPerCover, dm.g);
  // (In patches, packed: its cells touching (MID_PACKED of the sky inside a patch), the patches where the
  // shape noise on PATCH_TILE (larger convection cells, which altocumulus forms in) is above the threshold
  // that leaves as much in patches as keeps its cover, with edges MID_PATCH_EDGE soft.)
  if (mid.x > 0.002) {
    vec4 pn = texture(shapeNoise, (local + macroOffset) / ${MID_PATCH_TILE.toFixed(1)} + vec3(0.37, 0.11, 0.73));
    float patchField = remap(pn.r, pn.g * 0.625 + pn.b * 0.25 + pn.a * 0.125 - 1.0, 1.0, 0.0, 1.0);
    float patchThreshold = coverThreshold(min(mid.x / ${MID_PACKED.toFixed(2)}, 1.0));
    mid.x = ${MID_PACKED.toFixed(2)} * smoothstep(patchThreshold - ${MID_PATCH_EDGE.toFixed(3)}, patchThreshold + ${MID_PATCH_EDGE.toFixed(3)}, patchField);
  }
  above *= 1.0 - midOpacity;
#endif
  float lowShare = clamp((1.0 - opacity) / above, 0.0, 1.0);  // (the clear share the low cloud must leave)
  float lowRaw = clamp((1.0 - lowShare - ${LOW_FLOOR.toFixed(2)}) / ${(1 - LOW_FLOOR).toFixed(2)}, 0.0, 1.0);
  float convective = a.b;
  float showers = convective * clamp(showerRain(a) / 3.0, 0.0, 1.0) * smoothstep(${SHOWER_OPACITY[0].toFixed(2)}, ${SHOWER_OPACITY[1].toFixed(2)}, opacity);
  // (Not faded in showers: their towers are solid clouds, and thinned they were tall, translucent wisps.)
  float lowOpacity = mix(sharpenLow(lowRaw,
    clamp((1.0 - (1.0 - opacitySoft) / above - ${LOW_FLOOR.toFixed(2)}) / ${(1 - LOW_FLOOR).toFixed(2)}, 0.0, 1.0), footprint), lowRaw, showers);
  // (The fair-weather cumulus come in fields: the large-scale noise above its FAIR_FIELDS quantile.)
  float fieldThreshold = coverThreshold(${FAIR_FIELDS.toFixed(2)});
  float fair = mix(${FAIR_CUMULUS[0].toFixed(3)}, ${FAIR_CUMULUS[1].toFixed(3)}, convective) * smoothstep(fieldThreshold - 0.03, fieldThreshold + 0.06, field);
  float lowCover = max(lowOpacity / 0.9, fair);
  // (The cloud's type from the cover before fading, which changes where there is cloud, not what kind: a
  // sheet where it covers the sky, and otherwise the weather's mix of stratocumulus and stratus against
  // cumulus, c.a.)
  float stratiform = max(smoothstep(${STRATUS_ONSET[0].toFixed(2)}, ${STRATUS_ONSET[1].toFixed(2)}, max(lowRaw / 0.9, fair)), 1.0 - c.a) * (1.0 - showers);
  vec3 up = normalize(worldToPlanet * p);
  vec3 east = normalize(cross(vec3(0.0, 1.0, 0.0), up));
  vec3 north = cross(up, east);
  float base = b.x * 1000.0;
  // (Only in showers heavy enough to matter: the read is costly, and the towers fade in from there.)
  float towers = 0.0;
  if (showers > 0.02) {
    vec4 tn = texture(shapeNoise, (local + towerOffset) / ${TOWER_TILE.toFixed(1)});
    float towerField = remap(tn.r, tn.g * 0.625 + tn.b * 0.25 + tn.a * 0.125 - 1.0, 1.0, 0.0, 1.0);
    float towerThreshold = coverThreshold(${TOWER_SHARE.toFixed(2)});
    towers = smoothstep(towerThreshold - 0.02, towerThreshold + 0.08, towerField) * smoothstep(0.02, 0.1, showers);
  }
  float cumulusTop = base + ${CUMULUS_DEPTH[0].toFixed(1)} + ${CUMULUS_DEPTH[1].toFixed(1)} * lowCover
    + (${SHOWER_DEPTH.toFixed(1)} + ${TOWER_DEPTH.toFixed(1)} * towers) * showers;
  float stratusTop = base + clamp(${STRATUS_DEPTH_SHARE.toFixed(2)} * (b.y * 1000.0 - base), ${STRATUS_DEPTH[0].toFixed(1)}, ${STRATUS_DEPTH[1].toFixed(1)});
  CloudColumn col;
  col.highCover = highCover;
  col.highOpacity = highOpacity;
  col.lowCover = lowCover;
  col.stratiform = stratiform;
  col.showers = showers;
  col.base = base;
  col.top = mix(cumulusTop, stratusTop, stratiform);
  col.highBase = c.g * 1000.0;
  col.wind = b.z * east + b.w * north;
  col.humidity = c.r;
  col.rain = showerRain(a);
  col.mid = mid;
  // (A cloud type filling the sky, for testing: see CLOUD_TYPES.)
  // (From uniforms rather than a branch for each type, which, copied wherever a column is worked out, slowed
  // the whole march.)
  if (cloudTypeTest > 0) {
    col.lowCover = lowTest.x; col.stratiform = lowTest.y; col.showers = lowTest.z; col.base = lowTest.w; col.top = lowTest2.x;
    col.highCover = highTest.x; col.highOpacity = highTest.y; col.highBase = highTest.z;
    if (lowTest2.y >= 0.0) { col.rain = lowTest2.y; col.humidity = lowTest2.z; }
  }
  // Fair-weather cumulus in fields (CU_FIELD_TILE, some kilometres across), a few clouds close together
  // (CU_PACKED of the sky) with clear sky between, as much in fields as keeps the cover (rather than spread
  // evenly to the horizon, where they stacked up into a wall): where the cover is low and cumuliform.
  float cumulusShare = (1.0 - col.stratiform) * (1.0 - col.showers) * (1.0 - smoothstep(${(0.6 * CU_PACKED).toFixed(3)}, ${CU_PACKED.toFixed(3)}, col.lowCover));
  if (cumulusShare > 0.0 && col.lowCover > 0.002) {
    vec4 fn = texture(shapeNoise, (local + macroOffset) / ${CU_FIELD_TILE.toFixed(1)} + vec3(0.71, 0.29, 0.13));
    float fieldValue = remap(fn.r, fn.g * 0.625 + fn.b * 0.25 + fn.a * 0.125 - 1.0, 1.0, 0.0, 1.0);
    float fieldThreshold = coverThreshold(min(col.lowCover / ${CU_PACKED.toFixed(3)}, 1.0));
    col.lowCover = mix(col.lowCover, ${CU_PACKED.toFixed(3)} * smoothstep(fieldThreshold - ${CU_FIELD_EDGE.toFixed(3)}, fieldThreshold + ${CU_FIELD_EDGE.toFixed(3)}, fieldValue), cumulusShare);
  }
  return col;
}

// The low cloud's density (0..1) in a column at planet-frame offset from the camera local, altitude h (m),
// at level of detail lod (0: the noise's shapes, 1: their expected value); full adds the detail erosion.
// layer: the height within the layer (0 at the base, 1 at the top), if in it. (Apart from columnDensity, for
// the light marches: thin as it is, the high cloud is left out of them, and so is its code, which, copied
// into each of their samples, made the shader too large to run quickly.)
// A column's mid-level layer: its cover, stratiform share (altocumulus 0, altostratus 1) and base (m).
// Worked out when needed rather than kept with the column: the columns are many and live in registers.
vec3 midLayer(CloudColumn col) {
#ifdef CLOUD_NO_MID
  return vec3(0.0, 0.0, 3500.0);  // (the lighter qualities have none)
#endif
  if (cloudTypeTest > 0) return midTest;
  return col.mid;
}

// The optical depth of a column's mid-level layer straight up from height h (m), from its expected density
// (its far density integrates to -log(1 - 0.95 cover) / 0.5 times its profile's mean, over the share of it
// above h).
float midDepthAbove(CloudColumn col, float h) {
  vec3 midL = midLayer(col);
  if (midL.x <= 0.0) return 0.0;
  float midDepth = mix(${MID_DEPTH[0].toFixed(1)}, ${MID_DEPTH[1].toFixed(1)}, midL.y);
  return -log(1.0 - 0.95 * min(midL.x, 1.0)) * 2.0 * mix(0.68, 0.78, midL.y) * mix(${MID_THIN.toFixed(2)}, ${MID_SHEET_DENSITY.toFixed(2)}, midL.y)
    * clamp((midL.z + midDepth - max(h, midL.z)) / midDepth, 0.0, 1.0);
}

// The levels of detail (0: the noise's shapes, 1: their expected value) for a pixel footprint (m): the low
// cloud's (LOD_FOOTPRINT) and the mid-level cloud's (MID_LOD_FOOTPRINT), worked out once for many samples.
vec2 levelsOfDetail(float footprint) {
  noiseLevel = log2(max(footprint, 1.0));
  return vec2(smoothstep(${LOD_FOOTPRINT[0].toFixed(1)}, ${LOD_FOOTPRINT[1].toFixed(1)}, footprint),
    smoothstep(${MID_LOD_FOOTPRINT[0].toFixed(1)}, ${MID_LOD_FOOTPRINT[1].toFixed(1)}, footprint));
}

float lowCloudDensity(CloudColumn col, vec3 local, float h, bool full, vec2 lods, inout float layer) {
  vec3 midL = midLayer(col);
  float density = 0.0;
  // The low layer, or the mid-level one (smaller shapes, on MID_TILE, moving with the wind aloft), whichever
  // the height is in (they do not overlap; the low cloud's if they do): the same code for both, once in
  // the shader. (Looping over both made the whole march slower, mid-level cloud or not.)
  float midTop = midL.z + mix(${MID_DEPTH[0].toFixed(1)}, ${MID_DEPTH[1].toFixed(1)}, midL.y);
  bool inLow = col.lowCover > 0.0 && h > col.base && h < col.top;
  bool mid = !inLow && midL.x > 0.0 && h > midL.z && h < midTop;
  {
    float lowCover = mid ? midL.x : col.lowCover;
    float stratiform = mid ? midL.y : col.stratiform;
    float showers = mid ? 0.0 : col.showers;
    float base = mid ? midL.z : col.base;
    float top = mid ? midTop : col.top;
    float hf = (h - base) / (top - base);
    if (lowCover <= 0.0 || hf <= 0.0 || hf >= 1.0) return 0.0;
    layer = hf;
    // (The mid-level cloud's own level of detail, for its smaller shapes; altostratus mostly even, and fully
    // so for the light through it, MID_SHEET_TEXTURE.)
    float lod = mid ? max(lods.y, smoothstep(${MID_SHEET_EVEN[0].toFixed(2)}, ${MID_SHEET_EVEN[1].toFixed(2)}, stratiform) * (full ? ${(1 - MID_SHEET_TEXTURE).toFixed(2)} : 1.0)) : lods.x;
    // Height profiles: cumulus rounded at the top, stratus flat.
    float cumulus = smoothstep(0.0, 0.08, hf) * smoothstep(1.0, 0.45, hf);
    float stratus = smoothstep(0.0, 0.2, hf) * smoothstep(1.0, 0.75, hf);
    // (Altocumulus flat as well, a layer of thin pancakes, not heaps: piled up, they were a field of popcorn.)
    float profile = mid ? stratus : mix(cumulus, stratus, stratiform);
    float d = 0.0, detail = 0.0;
    if (lod < 1.0) {
      // (The mid-level tile divides the low cloud's, and the noise repeats: the same offsets serve, scaled.)
      float mask;
      vec3 flatShift = mid ? -normalize(cameraPlanet + local) * (h - base) : vec3(0.0);
      // (Altocumulus: no detail noise, which it has no erosion to use; and its mask only where it is seen, not
      // for the light through it, MID_MASK_MEAN.)
      float shape = driftedShape(local, col.wind * (mid ? ${MID_WIND.toFixed(1)} : 1.5), mid ? ${(SHAPE_TILE / MID_TILE).toFixed(1)} : 1.0, detail, full && !mid, flatShift, mask,
        mid ? 0.0 : (1.0 - stratiform) * (1.0 - showers), full);
      // (Altocumulus's cells stay at least MID_EDGE_COVER and fade, rather than shrink, where its cover thins
      // towards a patch's edge: shrunk, they were a wide band of separate dots, which looked sandy.)
      float threshold = mid ? midCoverThreshold(max(lowCover, ${MID_EDGE_COVER.toFixed(2)})) : coverThreshold(lowCover);
      d = clamp((shape - threshold) / max((mid ? MID_TOP : SHAPE_TOP) - threshold, 0.02), 0.0, 1.0);
      // (Altocumulus's cells filled, falling off only in the narrow lanes between them: rising across the
      // whole cell, only their cores showed, as speckles.)
      if (mid) d = smoothstep(0.0, ${MID_FILL.toFixed(2)}, d) * min(lowCover / ${MID_PACKED.toFixed(2)}, 1.0)
        * mix(full ? mix(1.0 - ${MID_MASK_DEPTH.toFixed(2)}, 1.0, smoothstep(${MID_MASK_EDGE[0].toFixed(2)}, ${MID_MASK_EDGE[1].toFixed(2)}, mask)) : ${maskMean.toFixed(4)}, 1.0, max(smoothstep(0.0, 0.3, lod), stratiform));  // (altocumulus's cells, not altostratus's)
      d *= profile;
      // Edges eroded by the detail noise (wispy below, billowy above); less on stratus.
      // (Cumulus strongly, and denser along the line of sight, so what is left is opaque within a few metres
      // of its surface: their outlines are the detail's billows (crisp, as cauliflower), not the shape's
      // smooth rise. Not for the light through them: as dense there, the approximate multiple scattering
      // left them dark grey.)
      // (Not altocumulus, which is thin (MID_THIN), its density graded smoothly across its cells.)
      float crisp = mid ? 0.0 : crispWeight;
      if (full && d > 0.0 && !mid) d = max(remap(d, mix(mix(0.3, ${CUMULUS_EROSION.toFixed(2)}, crisp), 0.12, stratiform) * mix(detail, 1.0 - detail, clamp(hf * 4.0, 0.0, 1.0)), 1.0, 0.0, 1.0), 0.0)
        * mix(mix(1.0, ${CUMULUS_DENSITY.toFixed(1)}, crisp), 1.0, stratiform);
    }
    // Too far for the clouds to be told apart: a density giving the column the transmittance of a cover
    // of opaque clouds (spreading the clouds' own density out evenly would make any cover of them opaque).
    float far = -log(1.0 - 0.95 * min(lowCover, 1.0)) / (EXTINCTION * (top - base) * 0.5) * profile;
    density += mix(d, far, lod) * mix(1.0, 1.6, showers) * (mid ? mix(${MID_THIN.toFixed(2)}, ${MID_SHEET_DENSITY.toFixed(2)}, stratiform) : 1.0);
  }
  return density;
}

// Cloud density (0..1) in a column at planet-frame offset from the camera local, altitude h (m); full
// adds the detail erosion. layer: the height within its layer (0 at the base, 1 at the top; 1 in high
// cloud).
float columnDensity(CloudColumn col, vec3 local, float h, bool full, float footprint, out float layer) {
  layer = 0.0;
  float highCover = col.highCover, highOpacity = col.highOpacity, lowCover = col.lowCover;
  float stratiform = col.stratiform, showers = col.showers, base = col.base, top = col.top;
  vec3 surfaceWind = col.wind;
  // Too far for the noise's features (a few hundred metres up) to be seen: its expected value.
  float lod = smoothstep(${LOD_FOOTPRINT[0].toFixed(1)}, ${LOD_FOOTPRINT[1].toFixed(1)}, footprint);
  float midLod = smoothstep(${MID_LOD_FOOTPRINT[0].toFixed(1)}, ${MID_LOD_FOOTPRINT[1].toFixed(1)}, footprint);
  float density = 0.0;
  if (full) COST(cost.y)
  fineWeight = full ? 1.0 - smoothstep(${FINE_FOOTPRINT[0].toFixed(1)}, ${FINE_FOOTPRINT[1].toFixed(1)}, footprint) : 0.0;
  noiseLevel = log2(max(footprint, 1.0));
  crispWeight = 1.0 - smoothstep(${CRISP_FOOTPRINT[0].toFixed(1)}, ${CRISP_FOOTPRINT[1].toFixed(1)}, footprint);

  // Low cloud.
  density += lowCloudDensity(col, local, h, full, vec2(lod, midLod), layer);
  fineWeight = 0.0;

  // High cloud: streaks along the wind aloft.
  float hb = col.highBase;
  float hh = (h - hb) / ${HIGH_THICKNESS.toFixed(1)};
  if (highCover > 0.005 && hh > 0.0 && hh < 1.0) {
    layer = 1.0;
    float profile = smoothstep(0.0, 0.3, hh) * smoothstep(1.0, 0.6, hh);
    vec3 windAloft = surfaceWind * ${CIRRUS_WIND.toFixed(1)};
    // (Or, becalmed, east: worked out here rather than kept with the column, to save registers.)
    vec3 along = windAloft;
    if (length(windAloft) <= 0.1) along = cross(vec3(0.0, 1.0, 0.0), cameraPlanet + local);
    along = normalize(along);
    float d = 0.0;
    if (lod < 1.0) {
      // Drawn out along the wind: the noise averaged over STREAK_TAPS points along it (a smear depends only on
      // the point's own position, so the streaks stay put as the camera moves; squeezing the coordinates
      // along the wind needs a point to squeeze about, and about the camera they slid and jumped). In the
      // planet's frame: float32 is precise enough here, to about a metre, for features kilometres across.
      vec3 planetPoint = cameraPlanet + local;
      float shape = 0.0, fibre = 0.0;
      for (int i = 0; i < 2; i++) {
        float weight = i == 0 ? 1.0 - drift.z : drift.z;
        if (weight < 0.002) continue;
        float age = i == 0 ? drift.x : drift.y;
        // (Offset from the low cloud's noise, so the two layers' shapes are unrelated.)
        vec3 q = planetPoint - windAloft * age + driftShift[i] + vec3(9137.0, 4211.0, 15731.0);
        float smear = 0.0;
        for (int k = 0; k < ${STREAK_TAPS}; k++) {
          vec4 sn = texture(shapeNoise, (q + along * ${HIGH_STREAK_LENGTH.toFixed(1)} * (float(k) / ${(STREAK_TAPS - 1).toFixed(1)} - 0.5)) / ${HIGH_TILE.toFixed(1)});
          smear += remap(sn.r, sn.g * 0.625 + sn.b * 0.25 + sn.a * 0.125 - 1.0, 1.0, 0.0, 1.0);
        }
        // (Averaging narrows the noise's spread: restored, so the cover stays about the same.)
        shape += weight * (SHAPE_MEAN + (smear / ${STREAK_TAPS.toFixed(1)} - SHAPE_MEAN) * ${STREAK_SPREAD.toFixed(2)});
      }
      shape = SHAPE_MEAN + (shape - SHAPE_MEAN) / length(vec2(1.0 - drift.z, drift.z));
      d = thresholdDensity(shape, highCover) * profile;
      // Fibres along the wind (cirrus), filling in to an even veil as the cover rises (cirrostratus). (Only
      // where there is cloud to draw them in, and the veil has not filled them in: they are the most costly
      // part of the march.)
      float veil = smoothstep(${VEIL_OPACITY[0].toFixed(2)}, ${VEIL_OPACITY[1].toFixed(2)}, highOpacity);
      // (Farther than a pixel to about one of the fibres' texels across them, filled in to their average, as the
      // lighter qualities always draw them: smaller than a pixel, they aliased into a fine hatching.)
      float fibreTexel = 1.0 / (${SHAPE_SIZE.toFixed(1)} * fibreTiles.y);
      float fibreFade = smoothstep(1.0, 2.0, exp2(noiseLevel) / fibreTexel);
#ifdef CLOUD_LITE_HIGH
      fibreFade = 1.0;
#endif
      if (full && d > 0.0 && (veil >= 1.0 || fibreFade >= 1.0)) d = min(d, 1.0) * mix(mix(1.0, 1.0 / fibreStats.z, fibreFade), 1.0, veil);
      else if (full && d > 0.0) {
        // (The point's east and north (m) on the sphere of the planet's equatorial radius, and the wind aloft's
        // east and north; the east period divides the equator, so there is no seam at the date line.)
        float ar = slParams.z;
        vec2 en = vec2(atan(planetPoint.x, planetPoint.z), atan(planetPoint.y, length(planetPoint.xz))) * ar;
        vec3 upP = normalize(planetPoint), eastP = normalize(cross(vec3(0.0, 1.0, 0.0), upP));
        vec2 windEN = vec2(dot(windAloft, eastP), dot(windAloft, cross(upP, eastP)));
        float bend = (shape - SHAPE_MEAN) * fibreTiles.z;
        for (int i = 0; i < 2; i++) {
          float weight = i == 0 ? 1.0 - drift.z : drift.z;
          if (weight < 0.002) continue;
          COST(cost2.x)
          float age = i == 0 ? drift.x : drift.y;
          vec2 g = en - windEN * age + driftShift[i].xy;
          // (Through the noise's tile on a slant, at irrational slopes, so that its pattern never repeats
          // across the sky: on the level, the cirrocumulus's small cells repeated in rows towards the horizon.)
          vec2 t = vec2(g.x * fibreTiles.x, (g.y + bend) * fibreTiles.y);
          float f = dot(textureLod(shapeNoise, vec3(t, h * fibreTiles.y + dot(t, vec2(${(MID_RATIO - 1).toFixed(6)}, ${(Math.SQRT2 - 1).toFixed(6)}))), 0.0), fibreWeights);
          fibre += weight * (f - fibreStats.x) * fibreStats.y;
        }
        fibre /= length(vec2(1.0 - drift.z, drift.z));
        // (Gathered into the streaks, though not all of it: cirrus stays thin and translucent.)
        float streaks = smoothstep(${FIBRE_EDGES[0].toFixed(2)}, ${FIBRE_EDGES[1].toFixed(2)}, fibre) * fibreStats.z;
        d = min(d, 1.0) * mix(mix(streaks, 1.0 / fibreStats.z, fibreFade), 1.0, veil);
      }
    }
    float far = -log(1.0 - highOpacity) / (EXTINCTION * ${HIGH_THICKNESS.toFixed(1)} * 0.5) * profile;
    // (Not clamped to 1: the fibres gather the layer's cloud into the streaks.)
    density += mix(max(d, 0.0) * ${HIGH_DENSITY.toFixed(3)}, far, lod);
  }
  return density;
}

float cloudDensity(vec2 uv, vec3 p, vec3 local, float h, bool full, float footprint, out float layer) {
  return columnDensity(cloudColumn(uv, p, local, footprint), local, h, full, footprint, layer);
}

// The distance along the line of sight D (planet axes; safeD: D with no zero component) from r to where
// it leaves the grid's cell of size cell (m) it is in (moving on from a cell's plane, into the next).
float cellExit(float r, float cell, vec3 D, vec3 safeD) {
  vec3 q = cameraGrid + D * r;
  vec3 inside = floor((q + D * (cell * 1e-3)) / cell) * cell;   // (nudged off the plane it is on)
  vec3 ahead = (inside + step(vec3(0.0), D) * cell - q) / safeD;
  return max(min(ahead.x, min(ahead.y, ahead.z)), cell * 1e-3);
}

// An upper bound on the shape noise's value anywhere within extent (m) of q (m, before dividing by the
// tile): the highest of the occupancy texture's blocks overlapping that box, at the finest level whose
// blocks are at least the box's size across (so it overlaps at most two along each axis).
float shapeBound(vec3 q, float extent, float tile) {
  int size = textureSize(occupancy, 0).x;
  float texels = 2.0 * extent / tile * float(size);
  int level = int(clamp(ceil(log2(max(texels, 1.0))), 0.0, log2(float(size))));
  int n = size >> level;
  vec3 lo = (fract(q / tile) - extent / tile) * float(n);
  ivec3 a = ivec3(floor(lo)), b = ivec3(floor(lo + 2.0 * extent / tile * float(n)));
  float bound = 0.0;
  for (int k = 0; k < 8; k++) {
    ivec3 i = ivec3((k & 1) == 0 ? a.x : b.x, (k & 2) == 0 ? a.y : b.y, (k & 4) == 0 ? a.z : b.z);
    i = ((i % n) + n) % n;
    bound = max(bound, texelFetch(occupancy, ivec3(i.xy, 2 * size - 2 * n + i.z), 0).r);
  }
  return bound;
}

// The cloud's optical depth from p (stretched; local: its planet-frame offset from the camera) towards the
// sun (sunDirS stretched), in a column col, over LIGHT_STEPS steps doubling from 60 m.
float sunwardDepth(CloudColumn col, vec3 p, vec3 local, vec3 sunDirS, float footprint) {
  float a = slParams.z;
  float od = 0.0, unused;
  float lightStep = 60.0;
  vec2 lod = levelsOfDetail(footprint);
  for (int k = 0; k < lightSteps.x; k++) {
    // (The middle of the step, which starts where the steps before it end. At lightStep * (k + 0.5) the
    // samples ran out to 4 km, and the light through a sheet more than a few hundred metres deep, such as
    // altostratus, missed most of it: the sun through it was a glare 25 degrees across.)
    float lightAt = lightStep * 1.5 - 60.0;
    vec3 q = p + sunDirS * lightAt;
    vec3 ql = local + worldToPlanet * (slSun * lightAt);
    od += lowCloudDensity(col, ql, length(q) - a, false, lod, unused) * lightStep;
    COST(cost.z)
    lightStep *= 2.0;
  }
  return od * EXTINCTION;
}

#ifdef CLOUD_LITE_LIGHT
// The optical depths towards the sun, up and down (as lightDepths' x, y, z) at p (stretched; local: its
// planet-frame offset; h: its height) in a column, for the lighter graphics qualities: towards the sun, two
// short samples of the cloud (LITE_SUN_STEPS, m: whether the point is near a sunlit side) and beyond them
// a typical density inside a cloud (LITE_DENSITY) up to the layer's top, no further than the march's
// light reaches (LITE_REACH); up and down, that density along the paths to its top and base, less (the
// sky's light reaches in from all round: LITE_AMBIENT). The tops and sides of the clouds are lit and their
// bases dark as with the march; what is lost is the finer shading inside them and one cloud's shadow on
// another. (The light marches made the march too large for small GPUs.)
vec3 liteDepths(CloudColumn col, vec3 p, vec3 local, float h, vec3 sunDirS, float footprint) {
  float depth = max(col.top - col.base, 1.0);
  float density = ${LITE_DENSITY.toFixed(2)} * mix(1.0, 1.6, col.showers);
  float a = slParams.z;
  vec2 lod = levelsOfDetail(footprint);
  float sun = 0.0, unused;
  for (int k = 0; k < 2; k++) {
    float at = k == 0 ? ${LITE_SUN_STEPS[0].toFixed(1)} : ${LITE_SUN_STEPS[1].toFixed(1)};
    float stepLength = k == 0 ? ${(2 * LITE_SUN_STEPS[0]).toFixed(1)} : ${(LITE_SUN_STEPS[1] - LITE_SUN_STEPS[0]).toFixed(1)};
    sun += lowCloudDensity(col, local + worldToPlanet * (slSun * at), length(p + sunDirS * at) - a, false, lod, unused) * stepLength;
  }
  float mu = max(dot(normalize(p), sunDirS), 0.1);
  float above = clamp(col.top - h, 0.0, min(depth, ${LITE_REACH.toFixed(1)})), below = clamp(h - col.base, 0.0, min(depth, ${LITE_REACH.toFixed(1)}));
  sun += density * max(above / mu - ${LITE_SUN_STEPS[1].toFixed(1)}, 0.0);
  // (And the mid-level layer above, from its expected density: without it, altostratus was lit as if
  // nothing were above its base, a white glare.)
  float mid = midDepthAbove(col, h) / EXTINCTION;
  return EXTINCTION * vec3(sun + mid / mu, ${LITE_AMBIENT.toFixed(2)} * (density * above + mid), ${LITE_AMBIENT.toFixed(2)} * density * below);
}
#endif

// The share of sunlight scattered towards the eye at optical depth od from the sun: multiple scattering,
// approximately (octaves of weaker extinction and flatter phase: phase holds each octave's lobe, broader as
// the light is scattered more, see main), less the powder effect (the sunlit side of a cloud's surface is
// darker than its depths' glow).
float cloudScatter(float od, vec3 phase) {
  float scatter = 0.0;
  float att = 1.0, ext = 1.0, ph = 1.0;
  for (int k = 0; k < 3; k++) {
    scatter += att * exp(-od * ext) * mix(1.0 / (4.0 * PI), phase[k], ph);
    att *= 0.5; ext *= 0.5; ph *= 0.5;
  }
  return scatter * (1.0 - 0.6 * exp(-od * 2.0));
}

// The cloud's optical depth straight up (dir 1) or down (dir -1) from height h (m) at planet-frame offset
// local, in a column col: VERTICAL_STEPS steps doubling from 80 m, for the sky's light from above and the
// ground's from below.
float verticalDepth(CloudColumn col, vec3 local, float h, float dir, float footprint) {
  vec3 up = normalize(cameraPlanet + local);
  float od = 0.0, unused;
  float stepLength = 80.0;
  vec2 lod = levelsOfDetail(footprint);
  for (int k = 0; k < lightSteps.y; k++) {
    float at = dir * stepLength * (float(k) + 0.5);
    if (h + at < 0.0) break;
    od += lowCloudDensity(col, local + up * at, h + at, false, lod, unused) * stepLength;
    COST(cost.z)
    stepLength *= 2.0;
  }
  return od * EXTINCTION;
}

// Columns blended (t from a to b), for the points between two where they are known.
CloudColumn mixColumn(CloudColumn a, CloudColumn b, float t) {
  CloudColumn m;
  m.highCover = mix(a.highCover, b.highCover, t);
  m.highOpacity = mix(a.highOpacity, b.highOpacity, t);
  m.lowCover = mix(a.lowCover, b.lowCover, t);
  m.stratiform = mix(a.stratiform, b.stratiform, t);
  m.showers = mix(a.showers, b.showers, t);
  m.base = mix(a.base, b.base, t);
  m.top = mix(a.top, b.top, t);
  m.highBase = mix(a.highBase, b.highBase, t);
  m.wind = mix(a.wind, b.wind, t);
  m.humidity = mix(a.humidity, b.humidity, t);
  m.rain = mix(a.rain, b.rain, t);
  m.mid = mix(a.mid, b.mid, t);
  return m;
}

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float phaseHG(float c, float g) {
  float g2 = g * g;
  return (1.0 - g2) / (4.0 * PI * pow(1.0 + g2 - 2.0 * g * c, 1.5));
}

// Ray against a sphere of radius r about the origin from o along unit d: entry and exit (-1 if none).
vec2 sphere(vec3 o, vec3 d, float r) {
  float b = dot(o, d), c = dot(o, o) - r * r;
  float disc = b * b - c;
  if (disc < 0.0) return vec2(-1.0);
  float s = sqrt(disc);
  return vec2(-b - s, -b + s);
}

// The real clouds' opacity (or the weather's cover) at uv, as the flat layer shows it, for a footprint (m).
float flatOpacityAt(vec2 uv, float footprint) {
  vec4 w = texture2D(weatherA, uv);
  float opacity = w.r * 0.9, share = realShare(uv);
  float soft = softOpacity(uv, opacity, share, footprint);
  if (share > 0.0) opacity = mix(opacity, clamp((textureLod(realClouds, uv, log2(max(footprint, 1.0) / realTexel)).r - 0.05) / 0.95, 0.0, 1.0), share);
  // (The low cloud's part faded, as the march's: see cloudColumn.)
  // (The mid-level layer is in the low cloud's part here: from this far only the total shows.)
  float high = min(min(opacity, ${HIGH_SHARE.toFixed(3)}), w.a * ${HIGH_OPACITY.toFixed(3)});
  float low = sharpenLow(clamp(1.0 - (1.0 - opacity) / (1.0 - high), 0.0, 1.0), clamp(1.0 - (1.0 - soft) / (1.0 - high), 0.0, 1.0), footprint);
  return 1.0 - (1.0 - high) * (1.0 - low);
}

// The share of sunlight reaching p (stretched; local: its planet-frame offset from the camera) through
// the clouds towards the sun (sunS, stretched), for a pixel footprint (m). The line towards the sun is
// sampled only where it crosses the layers' heights (from the column at p): SHADOW_STEPS across the low
// cloud and SHADOW_HIGH_STEPS across the high, at fixed fractions, so the samples are points fixed to the
// planet wherever the camera is. From far enough away (FLAT_FOOTPRINT, as the clouds themselves), the
// flat layer's opacity where the line crosses FLAT_HEIGHT instead.
float cloudShadow(vec3 p, vec3 local, vec3 sunS, float footprint) {
  float a = slParams.z;
  vec2 floorHit = sphere(p, sunS, a);
  if (floorHit.x > 0.0) return 0.0;  // (the planet's own shadow is the light model's)
  float hp = length(p) - a;
  float mu = max(dot(normalize(p), sunS), 0.02);
  float flatShare = smoothstep(FLAT_FOOTPRINT0, FLAT_FOOTPRINT1, footprint);
  float flatLit = 1.0;
  if (flatShare > 0.0) {
    vec3 q = p + sunS * max((${FLAT_HEIGHT.toFixed(1)} - hp) / mu, 0.0);
    // (Only below the layer: ground that rises through it, such as a high mountain, is above its clouds.)
    flatLit = 1.0 - flatOpacityAt(mapUv(latLon(q)), footprint) * (1.0 - smoothstep(${(FLAT_HEIGHT - 300).toFixed(1)}, ${(FLAT_HEIGHT + 300).toFixed(1)}, hp));
    if (flatShare > 0.999) return flatLit;
  }
  CloudColumn col = cloudColumn(mapUv(latLon(p)), p, local, max(footprint, 150.0));
  float od = 0.0, unused;
  for (int layerIndex = 0; layerIndex < 2; layerIndex++) {
    bool low = layerIndex == 0;
    float bottom = low ? col.base : col.highBase, top = low ? col.top : col.highBase + ${HIGH_THICKNESS.toFixed(1)};
    // (The mid-level layer with the low cloud's.)
    vec3 midL = midLayer(col);
    if (low && midL.x > 0.002) { bottom = min(bottom, midL.z); top = max(top, midL.z + ${MID_DEPTH[1].toFixed(1)}); }
    if (!low && col.highCover <= 0.005) continue;
#ifdef CLOUD_LITE_SHADOW
    if (!low) continue;  // (the lighter qualities: no shadow of the thin high cloud)
#endif
    float ta = max((bottom - ${HEIGHT_MARGIN.toFixed(1)} - hp) / mu, 0.0), tb = (top + ${HEIGHT_MARGIN.toFixed(1)} - hp) / mu;
    if (tb <= ta) continue;
#ifdef CLOUD_LITE_SHADOW
    int steps = ${SHADOW_STEPS / 4};  // (and fewer samples of the low cloud's)
#else
    int steps = low ? ${SHADOW_STEPS} : ${SHADOW_HIGH_STEPS};
#endif
    float dt = (tb - ta) / float(steps);
    for (int j = 0; j < ${SHADOW_STEPS}; j++) {
      if (j >= steps) break;
      float t = ta + dt * (float(j) + 0.5);
      vec3 q = p + sunS * t;
      COST(cost2.y)
      od += cloudDensity(mapUv(latLon(q)), q, local + worldToPlanet * (slSun * t), length(q) - a, false, max(footprint, 150.0), unused) * dt;
    }
  }
  return mix(exp(-EXTINCTION * od), flatLit, flatShare);
}

// The air's murk at a point (extinction, 1/m), beyond the clear air the atmosphere model already has:
// haze from the surface humidity, thickening into mist and, near saturation, a shallow fog.
float airMurk(CloudColumn col, float h) {
  float rh = col.humidity;
  float visibility = ${CLEAR_VISIBILITY.toFixed(1)} * pow(clamp((1.0 - rh) / 0.12, 0.0, 1.0), 2.0);
  visibility = max(visibility, ${FOG_VISIBILITY.toFixed(1)});
  float extinction = max(3.912 / visibility - 3.912 / ${ATMO_VISIBILITY.toFixed(1)}, 0.0);
  float height = mix(1200.0, 200.0, smoothstep(0.93, 0.99, rh));
  return extinction * exp(-max(h, 0.0) / height);
}

// The share of the light from above (the sky's, and the sun's scattered on its way through) that reaches
// height h (m) through a column's low and mid-level cloud: for each, its clear share, and through the cloud
// the diffuse transmission of a thick scattering layer (two-stream: 1 / (1 + 0.75 tau (1 - g)), g about 0.85)
// for the optical depth of the cloud above (at half its full density; an even sheet of altostratus at its
// own). About a seventh under 4 km of nimbostratus, a half under a thin stratus: under thick overcast the day
// is dim, and the murk and the cloud's base with it.
float overcastShare(CloudColumn col, float h) {
  float tau = EXTINCTION * 0.5 * max(col.top - max(h, col.base), 0.0);
  float share = 1.0 - min(col.lowCover, 1.0) + min(col.lowCover, 1.0) / (1.0 + 0.1125 * tau);
  vec3 midL = midLayer(col);
  if (midL.x > 0.0) {
    float midTop = midL.z + mix(${MID_DEPTH[0].toFixed(1)}, ${MID_DEPTH[1].toFixed(1)}, midL.y);
    float midTau = EXTINCTION * mix(${(0.5 * MID_THIN).toFixed(3)}, ${MID_SHEET_MEAN.toFixed(4)} * ${MID_SHEET_DENSITY.toFixed(2)}, midL.y) * max(midTop - max(h, midL.z), 0.0);
    share *= 1.0 - min(midL.x, 1.0) + min(midL.x, 1.0) / (1.0 + 0.1125 * midTau);
  }
  return share;
}

// The share of the sunlight reaching height h (m) in a column through its low and mid-level cloud, from their
// expected density (as lowCloudDensity's from afar), for the sun's height (mu, the cosine of its zenith
// angle): what the air under the clouds is lit by on average. (Worked out, not marched as cloudShadow is:
// marched for every pixel of the sky, it was a twentieth of the whole march's time.)
float expectedSun(CloudColumn col, float h, float mu) {
  // (Each layer's far density integrates to -log(1 - 0.95 cover) / 0.5 times its profile's mean, over the
  // share of it above h.)
  float od = -log(1.0 - 0.95 * min(col.lowCover, 1.0)) * 2.0 * mix(0.68, 0.78, col.stratiform) * mix(1.0, 1.6, col.showers)
    * clamp((col.top - max(h, col.base)) / max(col.top - col.base, 1.0), 0.0, 1.0);
  od += midDepthAbove(col, h);
  return exp(-od / max(mu, 0.05));
}

// The share of the sunlight (times overcastShare) diffused down through the cloud to its depths and base:
// DIFFUSE_SUN[0] for cumulus, whose light leaks out of their sides, up to DIFFUSE_SUN[1] for a sheet
// (stratiform), which the light can only leave through its base or top. (With the cumulus's share,
// nimbostratus was nearly black.)
float diffuseSun(float stratiform) { return mix(${DIFFUSE_SUN[0].toFixed(3)}, ${DIFFUSE_SUN[1].toFixed(3)}, stratiform); }

// The murk's light (before white): the sun's where it reaches (sun, its share through the clouds), with the
// murk's phase function; the sky's and the ground's through the cloud above (overcast, overcastShare); and,
// where the clouds shade the sun, its light diffused through them, as the cloud's base has it (diffuseSun).
// (Without that, rain under nimbostratus was darker than the cloud it fell from.)
vec3 murkLighting(vec3 direct, vec3 skyDown, vec3 groundUp, float sun, float overcast, float stratiform, float phase) {
  return direct * (sun * phase * PI + (1.0 - sun) * diffuseSun(stratiform) * overcast) + (skyDown + groundUp) * RECIPROCAL_PI * 0.5 * overcast;
}

// Rain below the clouds (extinction, 1/m): under the cloud bases that are raining, a shaft as wide as
// the cloud above it.
float rainShaft(CloudColumn col, vec3 p, vec3 local, float h) {
#ifdef CLOUD_LITE_MURK
  // (The lighter qualities have no rain shafts: the haze and fog only.)
  return 0.0;
#endif
  float rate = col.rain;
  if (rate < 0.1) return 0.0;
  float base = col.base;
  if (h > base) return 0.0;
  // The cloud a little above its base, straight up from here.
  vec3 up = normalize(p);
  float lift = base + 0.25 * (col.top - base) - h;
  float unused;
  float cloud = columnDensity(col, local + worldToPlanet * (up * lift), h + lift, false, 400.0, unused);
  return smoothstep(0.02, 0.25, cloud) * 3.912 / (${RAIN_VISIBILITY.toFixed(1)} * pow(rate, -0.63));
}

// The rain at the camera c (mm/h), with the same shaft as rainShaft (0 above the cloud base), in the column
// over it col.
float cameraRain(CloudColumn col, vec3 c) {
  float shaft = rainShaft(col, c, vec3(0.0), length(c) - slParams.z);
  return shaft > 0.0 ? pow(shaft * ${RAIN_VISIBILITY.toFixed(1)} / 3.912, 1.0 / 0.63) : 0.0;
}

void main() {
  vec4 view = inverseProjection * vec4(vUv * 2.0 - 1.0, -1.0, 1.0); // (the near plane: the far one is too far for float32)
  vec3 dirWorld = normalize((cameraWorld * vec4(normalize(view.xyz / view.w), 0.0)).xyz);
  // The stretched frame: positions with the polar axis scaled so the ellipsoid is a sphere of radius a.
  vec3 ds = dirWorld + slPole.w * dot(dirWorld, slPole.xyz) * slPole.xyz;
  float stretch = length(ds);
  vec3 d = ds / stretch;
  vec3 c = slCamera.xyz;
  float a = slParams.z;
  float sceneDistance = texture2D(distanceMap, vUv).r;
  vec2 outer = sphere(c, d, a + SHELL_TOP);
  vec2 ground = sphere(c, d, a);
  float t0 = max(outer.x, 0.0);
  float t1 = outer.y;
  if (ground.x > 0.0) t1 = min(t1, ground.x);
  t1 = min(t1, sceneDistance * stretch);
  vec3 sunDirS = normalize(slSun + slPole.w * dot(slSun, slPole.xyz) * slPole.xyz);
  // The column over the camera, for the rain there, the murk's light against the sky and the haze's in front of
  // the clouds: worked out once, and only what they need of it kept. (It was in the shader three times.)
  float cameraSun, cameraOvercast, rainHere;
  {
    CloudColumn colCamera = cloudColumn(mapUv(latLon(c)), c, vec3(0.0), 400.0);
    float hc = length(c) - a;
    cameraSun = expectedSun(colCamera, hc, dot(normalize(c), sunDirS));
    cameraOvercast = overcastShare(colCamera, hc);
    rainHere = cameraRain(colCamera, c);
  }
  // The scene's dimming by the clouds, at the end of the line of sight (the ground or the scene).
  // (Where nothing was drawn the distance pass leaves 1e9 m: the sky, not a scene point out in space, which
  // the clouds never shade; taken as one, the murk against the sky was lit by the full sun, even under
  // nimbostratus.)
  float tScene = min(ground.x > 0.0 ? ground.x : 1e30, sceneDistance < 1e8 ? sceneDistance * stretch : 1e30);
  float sceneSun = 1.0, shade = 1.0;
  if (tScene < 1e20 && slParams.x > 0.5) {
    vec3 ps = c + d * tScene;
    vec3 localS = worldToPlanet * (dirWorld * (tScene / stretch));
    sceneSun = cloudShadow(ps, localS, sunDirS, tScene / stretch * pixelAngle);
    vec3 up = normalize(ps);
    float mu = dot(up, slSun);
    vec3 sun = slSunTransmittance(ps) * max(mu, 0.0);
    vec3 sky = slSkyIrradiance(mu) * slParams.y;
    float directShare = dot(sun, vec3(0.2126, 0.7152, 0.0722)) / max(dot(sun + sky, vec3(0.2126, 0.7152, 0.0722)), 1e-6);
    float cover = texture2D(weatherA, mapUv(latLon(ps))).r;
    float lit = directShare * sceneSun + (1.0 - directShare) * (1.0 - 0.5 * cover * cover);
    // (Seen through the air's haze, which the shadow does not darken: by the air's transmittance.)
    float at0, at1;
    float airSeen = 1.0;
    if (atmoRoots(dot(ds / stretch, ds / stretch), dot(c, d), dot(c, c) - (a + 100000.0) * (a + 100000.0), at0, at1)) {
      vec3 airLight, airTransmittance;
      atmoScatter(c, d, dirWorld, max(at0, 0.0), min(at1, tScene), slSun, a, 8, airLight, airTransmittance);
      airSeen = dot(airTransmittance, vec3(0.2126, 0.7152, 0.0722));
    }
    shade = mix(1.0, lit, airSeen);
  }
  else if (slParams.x > 0.5) {
    // (Sky: the murk's sunlight as at the camera, through the clouds' expected density (expectedSun): the
    // murk against the sky reaches kilometres away, lit through the cover on average, not darkened all over
    // as one cumulus's shadow passes over the camera.)
    sceneSun = sphere(c, sunDirS, a).x > 0.0 ? 0.0 : cameraSun;
  }
  outShade = vec4(shade, rainHere, 0.0, 1.0);
  if (outer.y <= 0.0 || t1 <= t0) {
    outClouds = vec4(0.0, 0.0, 0.0, 1.0);
#ifdef CLOUD_COST
    outClouds = cost;
    outShade.ba = cost2;
#endif
    return;
  }
  // The march. Everything it samples must be fixed to the planet, so that moving the camera cannot
  // change what is drawn, only where it is seen from: sampling at distances from the camera (in steps,
  // fine or jittered) sliced the clouds into terraces that slid over them as it moved (moire).
  // - The cloud layer (from LAYER_BOTTOM to the shell's top) is cut into the cells of a grid fixed to the
  //   planet (planet axes, powers of two growing with the distance so each divides the next: see
  //   CELL_SHARE), and the density is integrated across each cell's stretch of the line of sight by
  //   Simpson's rule, from its values where the line of sight enters and leaves the cell (on the grid's
  //   planes) and at the middle; the light from the sun through the cloud is worked out at the ends and
  //   blended across. The cells' boundaries belong to the world, and the points move smoothly along them
  //   as the camera moves, so nothing slides.
  // - The fine cells come in coarse ones. Where neither of a coarse cell's columns can hold cloud at the
  //   heights crossed, or (near enough for the noise's shapes) the noise cannot reach the cover's
  //   threshold anywhere along it (the occupancy bounds, cloudNoise.js), only the murk is added. Either
  //   test only skips what would be empty, so it changes nothing that is drawn.
  // - The weather and the light change little across a coarse cell: from its ends (blended) and middle.
  // - Below the layer there is only the murk, which is smooth: MURK_STEPS steps each side.
  float transmittance = 1.0;
  vec3 light = vec3(0.0);
  float depthSum = 0.0, depthWeight = 0.0;
  float sunCos = dot(d, normalize(slSun + slPole.w * dot(slSun, slPole.xyz) * slPole.xyz));
  // (The two-lobed phase function for each octave of cloudScatter, the lobes broader as the light is scattered
  // more: with the same sharp lobe in each, the sun through altostratus was a glare 25 degrees across.)
  vec3 phase;
  for (int k = 0; k < 3; k++) {
    float g = k == 0 ? 1.0 : k == 1 ? ${PHASE_OCTAVES[0].toFixed(2)} : ${PHASE_OCTAVES[1].toFixed(2)};
    phase[k] = mix(phaseHG(sunCos, 0.65 * g), phaseHG(sunCos, -0.2 * g), 0.3);
  }
  float sunIntensity = exposure.y;
  float murkPhase = mix(phaseHG(sunCos, 0.5), 1.0 / (4.0 * PI), 0.5);
  vec3 white = mix(vec3(1.0), SL_WHITE, slParams.y) * sunIntensity;
  // The line of sight in the planet's axes (true metres), and the grid's coordinates (the camera's planet
  // position modulo CELL_MAX, worked out in float64, plus the offset from it).
  vec3 D = normalize(worldToPlanet * dirWorld);
  vec3 safeD = vec3(abs(D.x) > 1e-6 ? D.x : 1e-6, abs(D.y) > 1e-6 ? D.y : 1e-6, abs(D.z) > 1e-6 ? D.z : 1e-6);
  // From far enough away, the flat layer (FLAT_FOOTPRINT), lit by the sun on it and the sky above it; in
  // between, blended with the march's clouds.
  float flatShare = 0.0;
  vec3 flatLight = vec3(0.0);
  float flatOpacity = 0.0, tFlat = 0.0;
  vec2 flatHit = sphere(c, d, a + ${FLAT_HEIGHT.toFixed(1)});
  if (flatHit.y > 0.0) {
    tFlat = flatHit.x > 0.0 ? flatHit.x : flatHit.y;
    float footprint = tFlat / stretch * pixelAngle;
    flatShare = smoothstep(FLAT_FOOTPRINT0, FLAT_FOOTPRINT1, footprint);
    if (flatShare > 0.0 && tFlat >= t0 && tFlat <= t1) {
      vec3 pf = c + d * tFlat;
      vec2 uv = mapUv(latLon(pf));
      flatOpacity = flatOpacityAt(uv, footprint);
      // (Seen aslant, more of the sky is cloud: the clear share falls as through a layer, by the length of
      // the line of sight across it, as the march's clouds do from afar.)
      float slant = abs(dot(D, normalize(cameraPlanet + D * (tFlat / stretch))));
      flatOpacity = 1.0 - pow(1.0 - min(flatOpacity, 0.999), min(1.0 / max(slant, 1e-3), 30.0));
      vec3 fDirect, fSkyDown, fGroundUp, fUp;
      slLightAt(dirWorld * (tFlat / stretch), fDirect, fSkyDown, fGroundUp, fUp);
      float mu = max(dot(fUp, slSun), 0.0);
      flatLight = (fDirect * mu * ${FLAT_SUN.toFixed(2)} + fSkyDown * ${FLAT_SKY.toFixed(2)} * RECIPROCAL_PI) * sunIntensity * flatOpacity;
    }
  }
  // The stretches: below the layer before it (from a camera under it), in it, and below it after it
  // (looking down through it).
  vec2 bottom = sphere(c, d, a + LAYER_BOTTOM);
  float tLayer0 = t0, tLayer1 = t1;
  if (length(c) < a + LAYER_BOTTOM) tLayer0 = min(max(bottom.y, t0), t1);
  else if (bottom.x > t0) tLayer1 = min(bottom.x, t1);
  for (int stretchIndex = 0; stretchIndex < 3; stretchIndex++) {
    if (flatShare > 0.999) break;
    float ta = stretchIndex == 0 ? t0 : stretchIndex == 1 ? tLayer0 : tLayer1;
    float tb = stretchIndex == 0 ? tLayer0 : stretchIndex == 1 ? tLayer1 : t1;
    if (tb <= ta) continue;
    float r = ta / stretch, rEnd = tb / stretch;   // true metres along the line of sight
    if (stretchIndex != 1) {
      // Below the layer: the murk alone.
      for (int i = 0; i < MURK_STEPS; i++) {
        float r1 = min(r + (rEnd - ta / stretch) / float(MURK_STEPS), rEnd);
        float rm = 0.5 * (r + r1);
        vec3 p = c + d * (rm * stretch);
        float h = length(p) - a;
        vec3 local = D * rm;
        CloudColumn col = cloudColumn(mapUv(latLon(p)), p, local, rm * pixelAngle);
        float murk = airMurk(col, h) + rainShaft(col, p, local, h);
        if (murk > 1e-7) {
          vec3 stepDirect, stepSkyDown, stepGroundUp, upW;
          slLightAt(dirWorld * rm, stepDirect, stepSkyDown, stepGroundUp, upW);
          vec3 murkLight = murkLighting(stepDirect, stepSkyDown, stepGroundUp, sceneSun, overcastShare(col, h), col.stratiform, murkPhase) * white;
          float murkT = exp(-murk * (r1 - r) * stretch);
          light += transmittance * murkLight * (1.0 - murkT);
          transmittance *= murkT;
        }
        r = r1;
        if (r >= rEnd || transmittance < 0.01) break;
      }
      if (transmittance < 0.01) break;
      continue;
    }
    // The layer, a coarse cell at a time (COARSE fine cells across). The weather, the light and the murk
    // change little across one: its columns are worked out where the line of sight enters and leaves it
    // (and blended between), its light at the middle. Where neither end's column can hold cloud at the
    // stretch's heights, only the murk is added; otherwise the fine cells across it are integrated.
    vec3 pA = c + d * (r * stretch);
    CloudColumn colA;  // (the first cell's, with the cells' ends, below)
    float d0 = 0.0;          // the density where the next fine cell starts
    bool d0Known = false;
    float fineDone = 0.0;  // (fine cells so far, for CLOUD_LITE_CELLS)
    for (int i = 0; i < ${MAX_COARSE}; i++) {
      if (r >= rEnd) break;
      // (CLOUD_LITE_CELLS: twice as long, for the lightest graphics quality, whose pixels are larger: the clouds'
      // edges a little chunkier, for a third fewer density samples.)
#ifdef CLOUD_LITE_CELLS
      float fine = exp2(ceil(log2(clamp(r * ${(2 * CELL_SHARE).toFixed(4)}, ${CELL_MIN.toFixed(1)}, ${(CELL_MAX / COARSE).toFixed(1)}))));
      // (And twice as long again for every LITE_CELL_BUDGET fine cells the line of sight has already been
      // through, so that long stretches of thin cloud, where it is not stopped early, cost a bounded number.)
      fine = min(fine * exp2(floor(fineDone / ${LITE_CELL_BUDGET.toFixed(1)})), ${(CELL_MAX / COARSE).toFixed(1)});
#else
      float fine = exp2(ceil(log2(clamp(r * ${CELL_SHARE.toFixed(4)}, ${CELL_MIN.toFixed(1)}, ${(CELL_MAX / COARSE).toFixed(1)}))));
#endif
      // (And short enough to climb or fall no more than VERTICAL_CELL across one, for the layers' height
      // profiles: looking down from orbit, cells as long as the distance asks for would each span the
      // whole layer, and slice it into rings.)
      float climb = abs(dot(D, normalize(cameraPlanet + D * r)));
      float steepest = exp2(max(floor(log2(${VERTICAL_CELL.toFixed(1)} / max(climb, 1e-4))), log2(${CELL_MIN.toFixed(1)})));
      fine = min(fine, steepest);
      // (CLOUD_LITE_COLUMNS: coarse cells twice as many fine ones across, for the lighter qualities: half the
      // columns, whose weather is read and worked out once a coarse cell.)
#ifdef CLOUD_LITE_COLUMNS
      // (Only near, where a pixel is under LITE_COLUMNS_FOOTPRINT: farther, the columns follow the satellite
      // imagery's edges, and longer cells showed; from orbit they gained nothing.)
      float coarse = fine * (r * pixelAngle < ${LITE_COLUMNS_FOOTPRINT.toFixed(1)} ? ${(2 * COARSE).toFixed(1)} : ${COARSE.toFixed(1)});
#else
      float coarse = fine * ${COARSE.toFixed(1)};
#endif
      // (Far enough for only the expected density, which is smooth across: the coarse cell is one fine
      // cell, unless it would climb too far.)
      if (r * pixelAngle >= ${LOD_FOOTPRINT[1].toFixed(1)}) fine = min(coarse, steepest);
      float rc1 = min(r + cellExit(r, coarse, D, safeD), rEnd);
      float rcm = 0.5 * (r + rc1);
      vec3 pB = c + d * (rc1 * stretch);
      // (The first cell's start column from the same place in the shader as each cell's end column, in a loop
      // the compiler does not unroll: the column is large.)
      CloudColumn colB;
      for (int k = i == 0 ? 0 : 1; k < 2 * noUnroll; k++) {
        float rk = k == 0 ? r : rc1;
        vec3 pk = k == 0 ? pA : pB;
        CloudColumn ck = cloudColumn(mapUv(latLon(pk)), pk, D * rk, rk * pixelAngle);
        if (k == 0) colA = ck;
        else colB = ck;
      }
      // The stretch's heights (the lowest where the line of sight passes closest to the centre).
      float hA = length(pA) - a, hB = length(pB) - a;
      float rLow = clamp(-dot(c, d) / stretch, r, rc1);
      float hLow = length(c + d * (rLow * stretch)) - a;
      float hHigh = max(hA, hB);
      bool lowCloud = max(colA.lowCover, colB.lowCover) > 0.002
        && hHigh > min(colA.base, colB.base) - ${HEIGHT_MARGIN.toFixed(1)} && hLow < max(colA.top, colB.top) + ${HEIGHT_MARGIN.toFixed(1)};
      // (The mid-level layer is drawn with the low cloud.)
      vec3 midA = midLayer(colA), midB = midLayer(colB);
      bool midCloud = max(midA.x, midB.x) > 0.002
        && hHigh > min(midA.z, midB.z) - ${HEIGHT_MARGIN.toFixed(1)} && hLow < max(midA.z, midB.z) + ${(MID_DEPTH[1] + HEIGHT_MARGIN).toFixed(1)};
      bool highCloud = max(colA.highCover, colB.highCover) > 0.005
        && hHigh > min(colA.highBase, colB.highBase) - ${HEIGHT_MARGIN.toFixed(1)} && hLow < max(colA.highBase, colB.highBase) + ${(HIGH_THICKNESS + HEIGHT_MARGIN).toFixed(1)};
      // Near enough for the noise's shapes everywhere along it (no expected density): whether the noise
      // can reach the threshold of the higher cover anywhere along it (both drift copies, the wind
      // changing between the columns, and for the high cloud its smear along the wind).
      if (rc1 * pixelAngle <= ${LOD_FOOTPRINT[0].toFixed(1)}) {
        float halfLength = 0.5 * (rc1 - r);
        vec3 localM = D * rcm;
        float spreadNorm = length(vec2(1.0 - drift.z, drift.z));
        if (lowCloud) {
          vec3 windM = 0.75 * (colA.wind + colB.wind);
          float windChange = 0.75 * length(colB.wind - colA.wind);
          float bound = 0.0;
          for (int k = 0; k < 2 * noUnroll; k++) {
            float age = k == 0 ? drift.x : drift.y;
            bound = max(bound, shapeBound(localM - windM * age + shapeOffset[k], halfLength + windChange * age, ${SHAPE_TILE.toFixed(1)}));
            // (And the cumulus's smaller shapes, where they may be: see CUMULUS_SCALE.)
            if (min(colA.stratiform, colB.stratiform) < 1.0)
              bound = max(bound, shapeBound(localM - windM * age + shapeOffset[k] + vec3(0.37, 0.53, 0.19) * ${(SHAPE_TILE / CUMULUS_SCALE).toFixed(1)}, halfLength + windChange * age, ${(SHAPE_TILE / CUMULUS_SCALE).toFixed(1)}));
          }
          lowCloud = SHAPE_MEAN + (bound - SHAPE_MEAN) / spreadNorm > coverThreshold(max(colA.lowCover, colB.lowCover));
        }
        if (highCloud) {
          vec3 windM = 0.5 * ${CIRRUS_WIND.toFixed(1)} * (colA.wind + colB.wind);
          float windChange = 0.5 * ${CIRRUS_WIND.toFixed(1)} * length(colB.wind - colA.wind);
          float bound = 0.0;
          for (int k = 0; k < 2 * noUnroll; k++) {
            float age = k == 0 ? drift.x : drift.y;
            vec3 q = cameraPlanet + localM - windM * age + driftShift[k] + vec3(9137.0, 4211.0, 15731.0);
            float b = shapeBound(q, halfLength + windChange * age + ${(HIGH_STREAK_LENGTH / 2).toFixed(1)}, ${HIGH_TILE.toFixed(1)});
            bound = max(bound, SHAPE_MEAN + (b - SHAPE_MEAN) * ${STREAK_SPREAD.toFixed(2)});
          }
          highCloud = SHAPE_MEAN + (bound - SHAPE_MEAN) / spreadNorm > coverThreshold(max(colA.highCover, colB.highCover));
        }
      }
      lowCloud = lowCloud || midCloud;
      // The rain shaft under the cloud, sampled once for the coarse cell (at its middle; where there is cloud,
      // as if below the base, and used in each of its fine cells below the base: smooth enough, and costly per
      // fine cell). (From one place in the shader for both.)
      CloudColumn colMid = mixColumn(colA, colB, 0.5);
      vec3 pMid = c + d * (rcm * stretch);
      float hMid = length(pMid) - a;
      float rainMid = rainShaft(colMid, pMid, D * rcm, lowCloud || highCloud ? min(hMid, colMid.base - 1.0) : hMid);
      // Without cloud, only the murk (often none).
      float murk = 0.0;
      if (!lowCloud && !highCloud) murk = airMurk(colMid, hMid) + rainMid;
      // The light at the middle (only where something is lit: it is costly). The sun's through the air (the
      // direct light from slLightAt, as at the same point), the sky's and the ground's, and the murk's.
      vec3 murkLight = vec3(0.0), sunlight = vec3(0.0), skyAmbient = vec3(0.0), groundAmbient = vec3(0.0);
      if (lowCloud || highCloud || murk > 1e-7) {
        vec3 stepDirect, stepSkyDown, stepGroundUp, upW;
        slLightAt(dirWorld * rcm, stepDirect, stepSkyDown, stepGroundUp, upW);
        murkLight = murkLighting(stepDirect, stepSkyDown, stepGroundUp, sceneSun, overcastShare(colA, length(c + d * (rcm * stretch)) - a), colA.stratiform, murkPhase) * white;
        sunlight = stepDirect * sunIntensity;
        skyAmbient = stepSkyDown * 1.6 * sunIntensity * RECIPROCAL_PI * 0.5;
        groundAmbient = stepGroundUp * 0.6 * sunIntensity * RECIPROCAL_PI * 0.5;
      }
      if (!lowCloud && !highCloud) {
        if (murk > 1e-7) {
          float murkT = exp(-murk * (rc1 - r) * stretch);
          light += transmittance * murkLight * (1.0 - murkT);
          transmittance *= murkT;
        }
        d0 = 0.0;
        d0Known = true;
      }
      else {
        float rainCell = rainMid;
        bool needD0 = !d0Known;
        // (Only high cloud: drawn out along the wind, and with gentler height profiles, so smooth enough for
        // cells HIGH_CELLS times the low cloud's.)
        if (!lowCloud) fine = min(fine * ${HIGH_CELLS.toFixed(1)}, min(coarse, steepest * 4.0));
        float rf = r;
        for (int j = 0; j < ${6 * COARSE + 3}; j++) {
          if (rf >= rc1) break;
          float r1 = min(rf + cellExit(rf, fine, D, safeD), rc1);
          COST(cost.w)
          fineDone += 1.0;
          float rm = 0.5 * (rf + r1);
          float dt = (r1 - rf) * stretch;
          vec3 p = c + d * (rm * stretch);
          float h = length(p) - a;
          vec3 local = D * rm;
          float footprint = rm * pixelAngle;
          CloudColumn col = mixColumn(colA, colB, (rm - r) / max(rc1 - r, 1e-3));
          float murk = airMurk(col, h) + (h <= col.base ? rainCell : 0.0);
          if (murk > 1e-7) {
            float murkT = exp(-murk * dt);
            light += transmittance * murkLight * (1.0 - murkT);
            transmittance *= murkT;
          }
          // The density across the fine cell's stretch (Simpson's rule): at its start (the first cell only; then
          // the cell before's end), middle and end. (From one place in the shader, in a loop it does not unroll:
          // the density, with its mid-level and high cloud, is large, and its copies held so many registers that
          // they spilled.)
          float dm = 0.0, d1 = 0.0, layer = 0.0;
          for (int e = 0; e < 3 * noUnroll; e++) {
            if (e == 0 && !needD0) continue;
            float re = e == 0 ? rf : e == 1 ? rm : r1;
            CloudColumn ce = mixColumn(colA, colB, (re - r) / max(rc1 - r, 1e-3));
            float le;
            float de = columnDensity(ce, D * re, length(c + d * (re * stretch)) - a, true, re * pixelAngle, le);
            if (e == 0) d0 = de;
            else if (e == 1) { dm = de; layer = le; }
            else d1 = de;
          }
          needD0 = false;
          float density = (d0 + 4.0 * dm + d1) / 6.0;
          // (Each end's share of the cell's cloud, for its light: the middle's split between them.)
          float end0 = d0 + 2.0 * dm, end1 = d1 + 2.0 * dm;
          float share0 = end0 / max(end0 + end1, 1e-6);
          d0 = d1;
          float rf0 = rf;
          rf = r1;
          if (density <= 0.0005) continue;
          float sigma = EXTINCTION * density;
          // The light towards the sun through the cloud, and through the cloud above and below (which the sky's
          // and the ground's light come through), worked out once for the cell, where the light the eye gets
          // from it comes from: weighted by the cloud at each end (where a cell crosses a cloud's edge, the
          // cloud's light, not the clear air's beside it) and by how much of each end's light reaches the eye
          // through the cell (for a cell of optical depth tau, the far end's share is ((1 - e^-tau) / tau -
          // e^-tau) / (1 - e^-tau): a half through a thin cell, about 1 / tau through a thick one). Exact for
          // light varying evenly across the cell. (It was worked out where the planes of a grid crossed the
          // line of sight, and blended between them: inside a deck the light varies unevenly with depth, and the
          // blending's error followed the planes, as moire and lines criss-crossing the deck from afar; and
          // through the thick cells of a deck the eye sees only the near end's light. In the middle of the cell
          // alone, cells crossing a cloud's edge were lit as the clear air and showed as steps.)
          // (High cloud alone is too thin to shade itself much: lit as if clear.)
          float cellTau = max(sigma * dt, 1e-4);
          float cellT = exp(-cellTau);
          float farShare = cellTau < 0.01 ? 0.5 - cellTau / 12.0 : ((1.0 - cellT) / cellTau - cellT) / (1.0 - cellT);
          float nearWeight = share0 * (1.0 - farShare), farWeight = (1.0 - share0) * farShare;
          float xl = mix(rf0, r1, farWeight / max(nearWeight + farWeight, 1e-6));
          vec3 od = vec3(0.0);
          if (lowCloud) {
            CloudColumn colL = mixColumn(colA, colB, (xl - r) / max(rc1 - r, 1e-3));
            vec3 pL = c + d * (xl * stretch);
            float hL = length(pL) - a;
#ifdef CLOUD_LITE_LIGHT
            od = liteDepths(colL, pL, D * xl, hL, sunDirS, xl * pixelAngle);
#else
            od = vec3(sunwardDepth(colL, pL, D * xl, sunDirS, xl * pixelAngle),
              verticalDepth(colL, D * xl, hL, 1.0, xl * pixelAngle), verticalDepth(colL, D * xl, hL, -1.0, xl * pixelAngle));
#endif
          }
          float scatter = cloudScatter(od.x, phase);
          vec2 ambientShare = exp(-${AMBIENT_EXTINCTION.toFixed(3)} * od.yz);
          vec3 ambient = skyAmbient * ambientShare.x + groundAmbient * ambientShare.y;
          // Sunlight scattered many times inside the cloud, which lights even its shaded depths and base:
          // less the more cloud there is above (overcastShare's diffuse transmission; the base of a deep cloud
          // is dark). (Sky and ground light: ambient, from above and below.)
          vec3 diffuse = sunlight * diffuseSun(col.stratiform) * overcastShare(col, h);
          vec3 sourceLight = sunlight * scatter * 4.0 + ambient + diffuse;
          // Energy-conserving integration across the stretch.
          float stepT = exp(-sigma * dt);
          light += transmittance * sourceLight * (1.0 - stepT);
          depthSum += transmittance * (1.0 - stepT) * rm * stretch;
          depthWeight += transmittance * (1.0 - stepT);
          transmittance *= stepT;
          if (transmittance < 0.01) break;
        }
        d0Known = true;
      }
      r = rc1;
      pA = pB;
      colA = colB;
      if (transmittance < 0.01) break;
    }
    if (transmittance < 0.01) break;
  }
  if (flatShare > 0.0) {
    light = mix(light, flatLight, flatShare);
    transmittance = mix(transmittance, 1.0 - flatOpacity, flatShare);
    depthSum = mix(depthSum, flatOpacity * tFlat, flatShare);
    depthWeight = mix(depthWeight, flatOpacity, flatShare);
  }
  // Haze between the camera and the cloud (by its opacity-weighted distance). The air's light in front of
  // a cloud is the brighter of the sky's (as the sky beside it is drawn, with its exposure: clouds seen
  // against the sky) and the light on the clouds' own scale (ATMO_HAZE_THIN, uncapped: from space, where
  // the sky's exposure falls, clouds seen against the ground). Single scattering alone leaves far clouds
  // tan from space (along a grazing line of sight the air reddens them strongly and adds too little light
  // of its own), so the latter is scaled up for the light scattered more than once (MULTIPLE_SCATTERING,
  // as the sky's light); and for an extended bright surface such as a cloud deck the light scattered out
  // of the line of sight is largely made up by light scattered into it from beside it, so its reddening
  // is half desaturated.
  if (depthWeight > 0.0 && slParams.y > 0.5) {
    float tc = depthSum / depthWeight;
    float at0, at1;
    if (atmoRoots(dot(ds / stretch, ds / stretch), dot(c, d), dot(c, c) - (a + 100000.0) * (a + 100000.0), at0, at1)) {
      vec3 airLight, airTransmittance;
      atmoScatter(c, d, dirWorld, max(at0, 0.0), min(at1, tc), slSun, a, 8, airLight, airTransmittance);
      vec3 cloudTransmittance = mix(airTransmittance, vec3(dot(airTransmittance, vec3(0.2126, 0.7152, 0.0722))), 0.5);
      vec3 inScatter = max((1.0 - exp(-airLight)) * exposure.x, airLight * ATMO_HAZE_THIN * ${MULTIPLE_SCATTERING.toFixed(2)});
      // (That is the clear sky's air. Under an overcast the air in front of its base is in the clouds'
      // shade, lit only by what comes through them (overcastShare at the camera), and the clear sky's blue over
      // it made nimbostratus a pale blue-grey; under broken cloud the sun lights it through the gaps (the
      // camera's sun through the clouds' expected density). The planet's own shadow is the air light's.)
      float hc = length(c) - a;
      if (hc < SHELL_TOP && sphere(c, sunDirS, a).x <= 0.0) {
        inScatter *= mix(cameraOvercast, 1.0, cameraSun);
      }
      // (Over the clouds' share of the opacity (depthWeight), not the murk's, whose light is the air's own:
      // where rain or mist hid all but a trace of the clouds beyond, the haze over the whole of it began
      // abruptly at the elevation where the clouds came into reach, a hard arc across the sky.)
      float cloudShare = depthWeight / max(1.0 - transmittance, 1e-4);
      light = light * mix(vec3(1.0), cloudTransmittance, cloudShare) + inScatter * depthWeight;
    }
  }
  outClouds = vec4(light, transmittance);
#ifdef CLOUD_COST
  outClouds = cost;
  outShade.ba = cost2;
#endif
}
`

// The clouds' highlights (linear): rolled off above HIGHLIGHT_KNEE, towards HIGHLIGHT_PEAK (a Reinhard curve,
// which keeps more of the spread of the brightest tops than an exponential one, which flattened them).
const HIGHLIGHT_KNEE = 0.5
const HIGHLIGHT_PEAK = 0.85

const compositeFragment = `
uniform sampler2D clouds;
uniform sampler2D shade;
uniform vec2 texel;
uniform float rainTime;        // simulated time (s), for the streaks
uniform float aspect;
varying vec2 vUv;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// Rain streaks across the view: short, faint, slightly slanted lines falling through the frame, in two
// layers (near, faster and longer; far, slower), more of them the harder it rains.
float streaks(vec2 uv, float rain) {
  float sum = 0.0;
  for (int layer = 0; layer < 2; layer++) {
    float scale = layer == 0 ? 40.0 : 90.0;
    float speed = layer == 0 ? 2.6 : 1.4;
    vec2 p = vec2(uv.x * aspect + uv.y * 0.08, uv.y + rainTime * speed) * vec2(scale, scale * 0.25);
    vec2 cell = floor(p);
    vec2 f = fract(p);
    float h = hash12(cell + float(layer) * 37.0);
    float present = step(h, clamp(rain / 50.0, 0.02, 0.3));
    float x = fract(h * 13.7);
    float line = smoothstep(0.06, 0.0, abs(f.x - x)) * smoothstep(0.0, 0.3, f.y) * smoothstep(1.0, 0.6, f.y);
    sum += present * line * (layer == 0 ? 0.25 : 0.12);
  }
  return sum;
}

void main() {
  // A small tent filter over the half-resolution clouds (softens their upscaling).
  vec4 c = 0.4 * texture2D(clouds, vUv)
    + 0.15 * (texture2D(clouds, vUv + vec2(texel.x, 0.0)) + texture2D(clouds, vUv - vec2(texel.x, 0.0))
            + texture2D(clouds, vUv + vec2(0.0, texel.y)) + texture2D(clouds, vUv - vec2(0.0, texel.y)));
  float opacity = 1.0 - c.a;
  // Premultiplied, linear: unpremultiply to encode for the (sRGB) canvas, then premultiply again.
  vec3 color = opacity > 1e-4 ? c.rgb / opacity : vec3(0.0);
  // (Their highlights rolled off above HIGHLIGHT_KNEE towards HIGHLIGHT_PEAK, by luminance, keeping the
  // colour: sunlit tops are far brighter than a screen can show, and clipped they were flat white, without
  // detail.)
  float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
  if (luminance > ${HIGHLIGHT_KNEE.toFixed(2)}) {
    float range = ${(HIGHLIGHT_PEAK - HIGHLIGHT_KNEE).toFixed(3)};
    float over = luminance - ${HIGHLIGHT_KNEE.toFixed(2)};
    color *= (${HIGHLIGHT_KNEE.toFixed(2)} + range * over / (over + range)) / luminance;
  }
  vec3 encoded = pow(max(color, vec3(0.0)), vec3(1.0 / 2.2)) * opacity;
  // The scene's dimming by the clouds (linear: as a factor on the sRGB canvas, its gamma root).
  float dim = pow(clamp(texture2D(shade, vUv).r, 0.0, 1.0), 1.0 / 2.2);
  float rain = texture2D(shade, vec2(0.5)).g;
  if (rain > 0.05) encoded += vec3(0.3) * streaks(vUv, rain);
  gl_FragColor = vec4(encoded, c.a * dim);
}
`

const _offset = new THREE.Vector3()
const _cameraPlanet = new THREE.Vector3()
const _m4 = new THREE.Matrix4()
const _far = new THREE.Color(1e9, 0, 0)

export class Clouds {
  // planet: Planet (its atmosphere uniforms are updated each frame); planetCoordSys: the planet's frame.
  constructor(planet, planetCoordSys) {
    this.planet = planet
    this.planetCoordSys = planetCoordSys
    // Drawing-buffer pixels per output pixel across (the supersampling factor while recording): the
    // clouds' detail is filtered to the output pixel, so a supersampled frame looks like an ordinary one.
    this.pixelScale = 1
    // The cloud target's resolution, of the drawing buffer's (see RESOLUTION).
    this.resolution = RESOLUTION
    this.weatherMap = new WeatherMap()
    this.realClouds = new RealClouds()
    this.enabled = true
    const noise = cloudNoiseTextures()
    const targetOptions = { type: THREE.FloatType, format: THREE.RGBAFormat, depthBuffer: true, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter }
    this.distanceTarget = new THREE.WebGLRenderTarget(1, 1, { ...targetOptions, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter })
    this.cloudTarget = new THREE.WebGLRenderTarget(1, 1, { ...targetOptions, type: THREE.HalfFloatType, depthBuffer: false, count: 2 })
    this.uniforms = {
      ...SunAndSkyLight.uniforms,
      distanceMap: { value: this.distanceTarget.texture },
      weatherA: { value: this.weatherMap.textures[0] },
      weatherB: { value: this.weatherMap.textures[1] },
      weatherC: { value: this.weatherMap.textures[2] },
      weatherD: { value: this.weatherMap.textures[3] },
      shapeNoise: { value: noise.shape },
      detailNoise: { value: noise.detail },
      occupancy: { value: noise.occupancy },
      inverseProjection: { value: new THREE.Matrix4() },
      cameraWorld: { value: new THREE.Matrix4() },
      worldToPlanet: { value: new THREE.Matrix3() },
      shapeOffset: { value: [new THREE.Vector3(), new THREE.Vector3()] },
      macroOffset: { value: new THREE.Vector3() },
      towerOffset: { value: new THREE.Vector3() },
      ratioOffset: { value: [new THREE.Vector3(), new THREE.Vector3()] },
      cameraPlanet: { value: new THREE.Vector3() },
      cameraGrid: { value: new THREE.Vector3() },
      driftShift: { value: [new THREE.Vector3(), new THREE.Vector3()] },
      realClouds: { value: null },
      realBlend: { value: 0 },
      realDeclination: { value: 0 },
      realTexel: { value: 4000 },
      detailOffset: { value: [new THREE.Vector3(), new THREE.Vector3()] },
      drift: { value: new THREE.Vector3() },
      exposure: { value: new THREE.Vector2(1, Math.PI) },
      lightSteps: { value: [LIGHT_STEPS, VERTICAL_STEPS] },
      noUnroll: { value: 1 },
      cloudTypeTest: { value: 0 },
      midTest: { value: new THREE.Vector3() },
      lowTest: { value: new THREE.Vector4() },
      lowTest2: { value: new THREE.Vector3() },
      highTest: { value: new THREE.Vector3() },
      cirrocumulus: { value: 0 },
      fibreTiles: { value: new THREE.Vector4() },
      fibreWeights: { value: new THREE.Vector4() },
      fibreStats: { value: new THREE.Vector3() },
      pixelAngle: { value: 0.001 },
    }
    const quad = (material) => {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material)
      mesh.frustumCulled = false
      return new THREE.Scene().add(mesh)
    }
    this.marchScene = quad(new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: fullscreenVertex, fragmentShader: marchFragment(noise.shapeStats, noise.detailMean, midMaskMean(noise.shape)), glslVersion: THREE.GLSL3, depthTest: false, depthWrite: false }))
    this.compositeScene = quad(new THREE.ShaderMaterial({
      uniforms: { clouds: { value: this.cloudTarget.textures[0] }, shade: { value: this.cloudTarget.textures[1] }, texel: { value: new THREE.Vector2() }, rainTime: { value: 0 }, aspect: { value: 1 } },
      vertexShader: fullscreenVertex,
      fragmentShader: compositeFragment,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.SrcAlphaFactor,
      blendSrcAlpha: THREE.ZeroFactor,
      blendDstAlpha: THREE.OneFactor,
    }))
    this.quadCamera = new THREE.Camera()
  }

  /**
   * Weather for the date (day of year, UTC hours) and drift for the simulated time t (s). Called each
   * frame before render.
   */
  update(renderer, dayOfYear, utcHours, t) {
    // (The weather map also gives the sea its roughness, with or without the clouds.)
    this.weatherMap.update(renderer, dayOfYear, utcHours)
    if (!this.enabled) return
    this.realClouds.setDayOfYear(dayOfYear + utcHours / 24)
    // The real clouds' snapshot (10240 x 5120) takes ~0.1 s to upload: do it as soon as it has loaded,
    // rather than on the first frame with clouds (e.g. on coming up out of the sea).
    if (this.realClouds.ready && this._uploaded !== this.realClouds.texture) {
      renderer.initTexture(this.realClouds.texture)
      this._uploaded = this.realClouds.texture
    }
    this.time = t
  }

  // Compiles the passes' shaders in the background (see precompile.js), so that the first frame with
  // clouds (e.g. on coming up out of the sea) does not wait for them: the march, the composite, and the
  // distance pass's variants for the objects in `scene` (new ones only).
  compileAsync(renderer, scene, camera) {
    if (!this.enabled) return Promise.resolve()
    const compiled = []
    // Each for the target it is drawn into (three.js compiles for the current target's colour space),
    // and the distance pass with the scene's lights but no fog, as it is drawn.
    const previousTarget = renderer.getRenderTarget()
    const standIns = standInScene(scene, { material: distanceMaterial, seen: (this._compiled ??= new Set()) })
    if (standIns) {
      const fog = scene.fog
      scene.fog = null
      renderer.setRenderTarget(this.distanceTarget)
      compiled.push(renderer.compileAsync(standIns, camera, scene))
      scene.fog = fog
    }
    if (!this._compiledPasses) {
      this._compiledPasses = true
      renderer.setRenderTarget(this.cloudTarget)
      compiled.push(renderer.compileAsync(this.marchScene, this.quadCamera))
      renderer.setRenderTarget(previousTarget)
      compiled.push(renderer.compileAsync(this.compositeScene, this.quadCamera))
    }
    renderer.setRenderTarget(previousTarget)
    return Promise.all(compiled)
  }

  // Draws the clouds over what `renderer` has drawn of `scene` from `camera`.
  render(renderer, scene, camera, sunIntensity, skyExposure) {
    if (!this.enabled) return
    const size = renderer.getDrawingBufferSize(new THREE.Vector2())
    this.planetCoordSys.updateWorldMatrix(true, false)
    camera.getWorldPosition(_cameraPlanet)
    this.planetCoordSys.worldToLocal(_cameraPlanet)
    const resolution = this.resolution
    const w = Math.max(1, Math.round(size.x * resolution)), h = Math.max(1, Math.round(size.y * resolution))
    if (this.distanceTarget.width !== w || this.distanceTarget.height !== h) {
      this.distanceTarget.setSize(w, h)
      this.cloudTarget.setSize(w, h)
      // (No smoothing at full resolution.)
      this.compositeScene.children[0].material.uniforms.texel.value.set(resolution < 1 ? 1 / w : 0, resolution < 1 ? 1 / h : 0)
      this.compositeScene.children[0].material.uniforms.aspect.value = w / h
    }
    const u = this.uniforms
    // Planet axes (the camera's planet position, float64, is above: for the noise offsets).
    u.worldToPlanet.value.setFromMatrix4(_m4.copy(this.planetCoordSys.matrixWorld).invert())
    const t = this.time ?? 0
    const phase = t / DRIFT_PERIOD
    const ages = [((phase % 1) + 1) % 1, (((phase + 0.5) % 1) + 1) % 1]
    u.drift.value.set(ages[0] * DRIFT_PERIOD, ages[1] * DRIFT_PERIOD, Math.abs(2 * ages[0] - 1))
    // Each copy restarts from a different place in the tile (so a restart does not repeat it).
    ages.forEach((age, i) => {
      const cycle = Math.floor(phase + (i ? 0.5 : 0))
      const shift = cycle * 7919.37 + i * 3571.1
      // (Wrapped at the high cloud's tile, a whole number of its fibres' tiles, so the noise is the same.)
      const wrap = (v) => ((v % HIGH_TILE) + HIGH_TILE) % HIGH_TILE
      u.driftShift.value[i].set(wrap(shift), wrap(shift * 0.61), wrap(shift * 1.37))
      for (const [target, tile] of [[u.shapeOffset.value[i], SHAPE_TILE], [u.detailOffset.value[i], DETAIL_TILE]]) {
        _offset.set(_cameraPlanet.x + shift, _cameraPlanet.y + shift * 0.61, _cameraPlanet.z + shift * 1.37)
        target.set(((_offset.x % tile) + tile) % tile, ((_offset.y % tile) + tile) % tile, ((_offset.z % tile) + tile) % tile)
      }
      // (And modulo the mid-level cloud's second tile, which does not divide the others.)
      const t = RATIO_TILE
      u.ratioOffset.value[i].set(((_offset.x % t) + t) % t, ((_offset.y % t) + t) % t, ((_offset.z % t) + t) % t)
    })
    u.cameraPlanet.value.copy(_cameraPlanet)
    u.cameraGrid.value.set(...['x', 'y', 'z'].map(k => ((_cameraPlanet[k] % CELL_MAX) + CELL_MAX) % CELL_MAX))
    const mt = MACRO_TILE
    u.macroOffset.value.set(((_cameraPlanet.x % mt) + mt) % mt, ((_cameraPlanet.y % mt) + mt) % mt, ((_cameraPlanet.z % mt) + mt) % mt)
    const tt = TOWER_TILE
    // (Offset from the other uses of the noise, so the towers are unrelated to them.)
    u.towerOffset.value.set(((_cameraPlanet.x + 31337) % tt + tt) % tt, ((_cameraPlanet.y + 17011) % tt + tt) % tt, ((_cameraPlanet.z + 7919) % tt + tt) % tt)
    u.inverseProjection.value.copy(camera.projectionMatrixInverse)
    u.cameraWorld.value.copy(camera.matrixWorld)
    u.exposure.value.set(skyExposure, sunIntensity)
    this.compositeScene.children[0].material.uniforms.rainTime.value = t % 1000
    u.pixelAngle.value = 2 / (camera.projectionMatrix.elements[5] * h) * this.pixelScale
    this.updateFibres()
    u.realClouds.value = this.realClouds.texture
    u.realTexel.value = 2 * Math.PI * 6378137 / (this.realClouds.texture.image?.width ?? 10240)
    u.realBlend.value = this.realClouds.ready ? 1 : 0
    const snapshot = this.realClouds.textureDate
    if (snapshot) {
      const day = (Date.parse(`${snapshot}T12:00:00Z`) - Date.UTC(Number(snapshot.slice(0, 4)), 0, 1)) / 86400000 + 1
      u.realDeclination.value = -23.44 * Math.cos(2 * Math.PI * (day + 10) / 365.25)
    }

    const previousTarget = renderer.getRenderTarget()
    const previousClear = renderer.getClearColor(new THREE.Color()), previousAlpha = renderer.getClearAlpha()
    const atmosphere = this.planet.atmosphere, atmosphereVisible = atmosphere.visible
    // 1. Distance.
    atmosphere.visible = false
    const override = scene.overrideMaterial, background = scene.background, fog = scene.fog
    scene.overrideMaterial = distanceMaterial
    scene.background = null
    scene.fog = null
    renderer.setRenderTarget(this.distanceTarget)
    renderer.setClearColor(_far, 1) // (a float target: nothing drawn is "far")
    renderer.clear()
    renderer.render(scene, camera)
    scene.overrideMaterial = override
    scene.background = background
    scene.fog = fog
    atmosphere.visible = atmosphereVisible
    // 2. Clouds.
    renderer.setRenderTarget(this.cloudTarget)
    renderer.render(this.marchScene, this.quadCamera)
    // 3. Composite.
    renderer.setRenderTarget(previousTarget)
    renderer.setClearColor(previousClear, previousAlpha)
    renderer.render(this.compositeScene, this.quadCamera)
  }

  // The high cloud's fibres or cells, for its share of cirrocumulus (see the fibreTiles uniform). The east
  // periods divide the equator (of the planet's equatorial radius), so there is no seam at the date line.
  updateFibres() {
    const u = this.uniforms, cc = u.cirrocumulus.value
    const a = u.slParams.value.z || 6378137
    const east = (tile) => 1 / (2 * Math.PI * a / Math.round(2 * Math.PI * a / tile))
    const mix = (x, y) => x + (y - x) * cc
    this._fibreStats ??= smearStats(2, 0, FIBRE_WEIGHTS, FIBRE_EDGES)
    this._cellStats ??= smearStats(2, 0, CELLS_WEIGHTS, FIBRE_EDGES)
    const f = this._fibreStats, c = this._cellStats
    const tile = mix(FIBRE_TILE, CELLS_TILE)
    u.fibreTiles.value.set(east(mix(FIBRE_STRETCH, 1) * tile), 1 / tile, FIBRE_BEND / 0.1 * (1 - cc), 0)
    u.fibreWeights.value.set(...FIBRE_WEIGHTS.map((w, i) => mix(w, CELLS_WEIGHTS[i])))
    u.fibreStats.value.set(mix(f.mean, c.mean), 1 / mix(f.sd, c.sd), 1 / Math.sqrt(mix(f.filled, c.filled)))
  }

  // The shader's optional parts, for the graphics quality (names of its defines: CLOUD_LITE_LIGHT,
  // CLOUD_LITE_MURK, ...); a change recompiles it.
  setFeatures(defines) {
    const material = this.marchScene.children[0].material
    const current = Object.keys(material.defines).filter((k) => k.startsWith('CLOUD_LITE') || k.startsWith('CLOUD_NO_')).sort().join(',')
    if (current === [...defines].sort().join(',')) return
    for (const k of Object.keys(material.defines)) if (k.startsWith('CLOUD_LITE') || k.startsWith('CLOUD_NO_')) delete material.defines[k]
    for (const k of defines) material.defines[k] = ''
    material.needsUpdate = true
  }

  // Fills the sky with one cloud type (its name in CLOUD_TYPES), for testing; null: the weather's clouds.
  // Or a sky of its own: an object of CLOUD_TYPES's form (layers of several types together, as in a photograph).
  setCloudTypeTest(name) {
    const index = typeof name === 'string' ? CLOUD_TYPES.findIndex((t) => t.name === name) : -1
    const type = name && typeof name === 'object' ? name : CLOUD_TYPES[index]
    this.uniforms.cloudTypeTest.value = type ? 1 : 0
    this.uniforms.midTest.value.fromArray(type?.mid ?? [0, 0, 3500])
    const low = type?.low ?? [0, 0, 0, 1000, 2000]
    this.uniforms.lowTest.value.fromArray(low)
    this.uniforms.lowTest2.value.set(low[4], type?.rain ?? -1, type?.humidity ?? 0)
    this.uniforms.highTest.value.fromArray(type?.high ?? [0, 0, 9000])
    this.uniforms.cirrocumulus.value = type?.cells ?? 0
  }

  // Draws (into the cloud target, not the screen) how much work each pixel took, for profiling: see
  // costReadback.
  setCostView(on) {
    const material = this.marchScene.children[0].material
    if (on === ('CLOUD_COST' in material.defines)) return
    if (on) material.defines.CLOUD_COST = ''
    else delete material.defines.CLOUD_COST
    material.needsUpdate = true
  }

  // With the cost view on, after a frame: the cloud target's counts for each pixel (Float32Array, 6 per
  // pixel: columns, densities, light samples, fine cells, high cloud with fibres, shadow samples) and its size.
  costReadback(renderer) {
    const gl = renderer.getContext(), { width, height } = this.cloudTarget
    const previous = renderer.getRenderTarget()
    renderer.setRenderTarget(this.cloudTarget)
    const planes = [0, 1].map((i) => {
      const data = new Float32Array(width * height * 4)
      gl.readBuffer(gl.COLOR_ATTACHMENT0 + i)
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.FLOAT, data)
      return data
    })
    gl.readBuffer(gl.COLOR_ATTACHMENT0)
    renderer.setRenderTarget(previous)
    const counts = new Float32Array(width * height * 6)
    for (let i = 0; i < width * height; i++) {
      for (let k = 0; k < 4; k++) counts[i * 6 + k] = planes[0][i * 4 + k]
      counts[i * 6 + 4] = planes[1][i * 4 + 2]
      counts[i * 6 + 5] = planes[1][i * 4 + 3]
    }
    return { counts, width, height }
  }

  dispose() {
    this.weatherMap.dispose()
    this.distanceTarget.dispose()
    this.cloudTarget.dispose()
  }
}
