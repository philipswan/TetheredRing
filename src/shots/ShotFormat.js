// Shot files (*.shot.json) describe a repeatable piece of footage: which preset and parameter
// values to use, the simulated time it starts at (which fixes where every vehicle is), the camera
// path, any parameters that change during the shot, and the output video settings. Importing the
// same file on another computer reproduces the same frames.
//
// {
//   format: 'tethered-ring-shot', version: 1, name, createdAt,
//   preset: 'default',                      // preset id (see src/presets/presets.js)
//   parameters: { name: value, ... },       // full parameter snapshot at the start of the shot
//   simulation: { startTime, animationState },
//   camera: { interpolation: 'smooth' | 'linear' | 'linearEased', cornerSeconds, keyframes: [keyframe, ...] },
//   parameterTracks: { name: [{ time, value }] },   // optional, times relative to the shot start
//   output: { width, height, fps, duration, codec, container, bitrateMbps, waitForTerrain,
//             motionBlur,            // 'off' | 'fixed' | 'adaptive' (see src/capture/MotionBlur.js)
//             motionBlurSamples,     // sub-frames per frame ('fixed'), or the fewest ('adaptive')
//             motionBlurMaxStep,     // 'adaptive': metres the camera may move between sub-frames near things
//             motionBlurMaxPixels,   // 'adaptive': pixels nearby scenery may move between sub-frames
//             motionBlurMaxSamples,  // 'adaptive': the most sub-frames per frame
//             shutterAngle,          // degrees of each frame interval the sub-frames cover (360 = all)
//             supersample },         // render at this many times the resolution and filter down (1 = off;
//                                    // see src/capture/Supersampler.js)
// }
//
// keyframe: {
//   time,                        // video seconds from the start of the shot
//   position, target, up, orbitUp, fov,
//   anchor,                      // what position, target and up are relative to (default world)
//   lookAt,                      // optional: a different anchor that `target` is relative to
//   speed,                       // simulated seconds per video second here (default 1, see ShotTiming.js)
//   ease,                        // true: the camera comes to rest at this keyframe (see CameraPath.js)
//   motion,                      // 'auto' | 'direct' | 'orbit': how the camera moves to the next keyframe
// }
//
// anchor: { type: 'world' } or a moving object, for example { type: 'launchVehicle', launchIndex: 74,
// orient: 'follow' }; see ANCHOR_TYPES and src/shots/Anchors.js. Keyframe vectors are in the anchor's
// frame: metres from the object along its own axes. With the world anchor they are world coordinates
// in metres (planet centre at the origin). Everything is stored as JSON doubles.
//
// Version 1 files (no anchors, speeds, easing or motions) are read as world-anchored keyframes.
export const SHOT_FORMAT = 'tethered-ring-shot'
export const SHOT_VERSION = 2

// Anchor types and the fields that identify the object.
export const ANCHOR_TYPES = {
  world: [],
  launchVehicle: ['launchIndex'],
  launchSled: ['launchIndex'],
  adaptiveNut: ['launchIndex'],
  transitVehicle: ['lane', 'p'],
  elevatorCar: ['p'],
}
// How the anchor's frame turns: with the object (follow), with its heading but kept level with the
// local horizon (level), or not at all (translate: world axes, moving with the object).
export const ANCHOR_ORIENTS = ['follow', 'level', 'translate']
export const MOTIONS = ['auto', 'direct', 'orbit']
// How the camera moves between keyframes. 'linearEased' is straight lines with short eased corners
// (see CameraPath.js); the corner length is the shot's camera.cornerSeconds.
export const CAMERA_INTERPOLATIONS = ['smooth', 'linear', 'linearEased']
export const SHOT_FILE_EXTENSION = '.shot.json'

export const DEFAULT_OUTPUT = {
  width: 1920,
  height: 1080,
  fps: 60,
  duration: 10,
  codec: 'av1',
  container: 'mp4',
  bitrateMbps: null, // null = derive a high default from resolution and frame rate
  waitForTerrain: true,
  motionBlur: 'off',
  motionBlurSamples: 16,
  motionBlurMaxStep: 1,
  motionBlurMaxPixels: 2,
  motionBlurMaxSamples: 1024,
  shutterAngle: 360,
  supersample: 1,
}

export const MOTION_BLUR_MODES = ['off', 'fixed', 'adaptive']

export function createShot({ name = 'Untitled shot', preset, parameters, startTime, animationState = null }) {
  return {
    format: SHOT_FORMAT,
    version: SHOT_VERSION,
    name,
    createdAt: new Date().toISOString(),
    preset,
    parameters: { ...parameters },
    simulation: { startTime, animationState },
    camera: { interpolation: 'smooth', keyframes: [] },
    parameterTracks: {},
    output: { ...DEFAULT_OUTPUT },
  }
}

export function shotDuration(shot) {
  const keyframes = shot.camera.keyframes
  const lastKey = keyframes.length ? keyframes[keyframes.length - 1].time : 0
  return Math.max(shot.output.duration ?? 0, lastKey)
}

const isVec3 = (v) => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite)

export const WORLD_ANCHOR = Object.freeze({ type: 'world' })

export function isWorldAnchor(anchor) {
  return !anchor || anchor.type === 'world'
}

export function sameAnchor(a, b) {
  if (isWorldAnchor(a) || isWorldAnchor(b)) return isWorldAnchor(a) && isWorldAnchor(b)
  return a.type === b.type && (a.orient ?? 'follow') === (b.orient ?? 'follow') && (ANCHOR_TYPES[a.type] ?? []).every(f => a[f] === b[f])
}

// Returns a description of what is wrong with an anchor, or null.
function anchorProblem(anchor) {
  if (anchor === undefined || anchor === null) return null
  if (typeof anchor !== 'object' || !(anchor.type in ANCHOR_TYPES)) return `unknown anchor type ${JSON.stringify(anchor?.type)}`
  for (const field of ANCHOR_TYPES[anchor.type]) if (!Number.isFinite(anchor[field])) return `anchor "${anchor.type}" needs a numeric "${field}"`
  if (anchor.orient !== undefined && !ANCHOR_ORIENTS.includes(anchor.orient)) return `anchor orient must be one of ${ANCHOR_ORIENTS.join(', ')}`
  return null
}

// Throws an Error describing the first problem found; returns the (normalised) shot otherwise.
export function validateShot(shot) {
  const fail = (msg) => { throw new Error(`Invalid shot file: ${msg}`) }
  if (!shot || typeof shot !== 'object') fail('not a JSON object')
  if (shot.format !== SHOT_FORMAT) fail(`"format" must be "${SHOT_FORMAT}"`)
  if (!Number.isInteger(shot.version) || shot.version > SHOT_VERSION) fail(`unsupported version ${shot.version} (this build reads up to ${SHOT_VERSION})`)
  if (typeof shot.preset !== 'string') fail('"preset" must be a string')
  if (!shot.parameters || typeof shot.parameters !== 'object') fail('"parameters" missing')
  if (!Number.isFinite(shot.simulation?.startTime)) fail('"simulation.startTime" must be a number')
  const keyframes = shot.camera?.keyframes
  if (!Array.isArray(keyframes)) fail('"camera.keyframes" must be an array')
  keyframes.forEach((k, i) => {
    if (!Number.isFinite(k.time)) fail(`keyframe ${i} has no time`)
    for (const field of ['position', 'target', 'up']) if (!isVec3(k[field])) fail(`keyframe ${i} "${field}" must be [x, y, z]`)
    if (i > 0 && k.time < keyframes[i - 1].time) fail(`keyframe ${i} is earlier than keyframe ${i - 1}`)
    const problem = anchorProblem(k.anchor) ?? anchorProblem(k.lookAt)
    if (problem) fail(`keyframe ${i}: ${problem}`)
    if (k.speed !== undefined && !(Number.isFinite(k.speed) && k.speed >= 0)) fail(`keyframe ${i} "speed" must be a number >= 0`)
    if (k.motion !== undefined && !MOTIONS.includes(k.motion)) fail(`keyframe ${i} "motion" must be one of ${MOTIONS.join(', ')}`)
  })
  if (!CAMERA_INTERPOLATIONS.includes(shot.camera.interpolation ?? 'smooth')) fail(`"camera.interpolation" must be one of ${CAMERA_INTERPOLATIONS.join(', ')}`)
  shot.camera.interpolation ??= 'smooth'
  if (shot.camera.cornerSeconds !== undefined && !(Number.isFinite(shot.camera.cornerSeconds) && shot.camera.cornerSeconds >= 0)) fail('"camera.cornerSeconds" must be a number >= 0')
  shot.parameterTracks ??= {}
  for (const [name, track] of Object.entries(shot.parameterTracks)) {
    if (!Array.isArray(track) || track.some(s => !Number.isFinite(s.time))) fail(`parameter track "${name}" is malformed`)
  }
  shot.output = { ...DEFAULT_OUTPUT, ...(shot.output ?? {}) }
  const o = shot.output
  if (!(o.width >= 16 && o.height >= 16)) fail('"output.width/height" must be at least 16')
  if (!(o.fps > 0 && o.fps <= 240)) fail('"output.fps" must be between 0 and 240')
  if (!MOTION_BLUR_MODES.includes(o.motionBlur)) fail(`"output.motionBlur" must be one of ${MOTION_BLUR_MODES.join(', ')}`)
  for (const field of ['motionBlurSamples', 'motionBlurMaxSamples']) {
    if (!(Number.isInteger(o[field]) && o[field] >= 1 && o[field] <= 4096)) fail(`"output.${field}" must be a whole number from 1 to 4096`)
  }
  if (!(o.motionBlurMaxStep > 0) || !(o.motionBlurMaxPixels > 0)) fail('"output.motionBlurMaxStep" and "motionBlurMaxPixels" must be positive')
  if (!(o.shutterAngle >= 0 && o.shutterAngle <= 360)) fail('"output.shutterAngle" must be between 0 and 360')
  if (!(o.supersample >= 1 && o.supersample <= 4)) fail('"output.supersample" must be between 1 and 4')
  return shot
}

export function serializeShot(shot) {
  return JSON.stringify(shot, null, 2)
}

export function parseShot(text) {
  let shot
  try {
    shot = JSON.parse(text)
  }
  catch (err) {
    throw new Error(`Invalid shot file: ${err.message}`)
  }
  return validateShot(shot)
}

// Value of a parameter track at time t: numbers are interpolated linearly, anything else steps.
export function sampleParameterTrack(track, t) {
  if (!track.length) return undefined
  if (t <= track[0].time) return track[0].value
  for (let i = 1; i < track.length; i++) {
    const a = track[i - 1]
    const b = track[i]
    if (t < b.time) {
      if (typeof a.value === 'number' && typeof b.value === 'number' && b.time > a.time) {
        return a.value + (b.value - a.value) * (t - a.time) / (b.time - a.time)
      }
      return a.value
    }
  }
  return track[track.length - 1].value
}
