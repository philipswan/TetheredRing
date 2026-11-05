import * as THREE from 'three'

// Compiling shader programs ahead of their first use. three.js compiles a program the first time
// something is drawn with it, which stalls that frame (by up to a second when several are needed at
// once, e.g. on first coming up out of the sea). renderer.compileAsync compiles them in the background
// instead (with KHR_parallel_shader_compile, where there is one), but on a whole scene it works out the
// program for each of its thousands of objects, which takes tens of milliseconds each time. So it is
// given a scene of stand-ins: one for each pairing of a material with a kind of object (a program
// depends on both: instanced or not, and so on), and only for pairings not compiled before with the
// scene's present lights and fog (programs depend on those too).
//
// A stand-in has its object's properties (it inherits from it) but no children, and optionally another
// material (for passes that draw a scene with an override material).

// Programs differ by these properties of an object as well as by its material. (Not by its type alone:
// some instanced meshes say they are of type Mesh.)
const kindOf = (object) => [
  object.type, !!object.isInstancedMesh, !!object.isBatchedMesh, !!object.isSkinnedMesh, !!object.instanceColor, !!object.morphTexture,
  Object.keys(object.geometry?.morphAttributes ?? {}).length,
].join()

// Returns a scene of stand-ins for the objects in `scene` (drawn or not) with pairings not in `seen` (a
// Set, updated), or null if there are none. material: draw them all with this instead of their own.
export function standInScene(scene, { material = null, seen = new Set() } = {}) {
  const standIns = new THREE.Scene()
  const lights = []
  scene.traverseVisible((object) => { if (object.isLight) lights.push(`${object.type}${object.castShadow ? '*' : ''}`) })
  const context = `${lights.sort().join()}|${scene.fog ? (scene.fog.isFogExp2 ? 'exp2' : 'linear') : ''}`
  scene.traverse((object) => {
    if (!(object.isMesh || object.isPoints || object.isLine || object.isSprite)) return
    const used = material ?? object.material
    if (!used) return
    const key = context + '|' + (Array.isArray(used) ? used.map((m) => `${m.uuid}:${m.version}`).join('+') : `${used.uuid}:${used.version}`) + '|' + kindOf(object)
    if (seen.has(key)) return
    seen.add(key)
    const standIn = Object.create(object)
    standIn.children = []
    if (material) standIn.material = material
    standIns.children.push(standIn)
  })
  return standIns.children.length ? standIns : null
}

// The first time three.js draws with a program it also reads the program's logs and looks up its
// uniforms and attributes (WebGLProgram.getUniforms), which waits for the driver to finish building it:
// up to ~30 ms each, even well after renderer.compileAsync has said it is ready. warmPrograms does that
// ahead of time for programs that are ready, until `budget` ms have gone in this frame.
const warmed = new WeakSet()

export function warmPrograms(renderer, budget = 2) {
  const start = performance.now()
  for (const program of renderer.info.programs) {
    // (three.js's list of programs has held an empty slot now and then, after a program was released.)
    if (!program || warmed.has(program) || !program.isReady()) continue
    warmed.add(program)
    program.getUniforms()
    if (performance.now() - start > budget) return
  }
}
