import * as THREE from 'three'

// Relative-to-eye rendering, for geometry reaching thousands of kilometres from its object's origin (such as
// the launch trajectory, which reaches orbit). There, float32 vertex positions are only good to ~0.1 m, so a
// line close to the camera jitters as it moves.
//
// Each vertex's position (relative to the object's origin, worked out in float64) is stored as its float32
// value (`position`) plus the float32 remainder (`positionLow`, see splitPositions). The camera's position in
// the object's frame is split the same way each time the object is drawn (setCamera, from onBeforeRender).
// The vertex shader subtracts high from high and low from low, then adds them, so a vertex near the camera
// comes out exact to well under a millimetre, wherever the camera is along the geometry.
//
// Usage (see launcher.drawLaunchTrajectoryLine):
//   const { high, low } = splitPositions(offsets)   // geometry attributes 'position' and 'positionLow'
//   const material = withRelativeToEye(new THREE.LineBasicMaterial(...))
//   object.onBeforeRender = (renderer, scene, camera) => material.userData.setCamera(object, camera)
// A material serves one object: its uniforms hold that object's camera position.

// float64 offsets (any array of numbers) -> { high, low }: Float32Arrays whose sum is the offset.
export function splitPositions(offsets) {
  const high = new Float32Array(offsets.length)
  const low = new Float32Array(offsets.length)
  for (let i = 0; i < offsets.length; i++) {
    high[i] = offsets[i]
    low[i] = offsets[i] - high[i]
  }
  return { high, low }
}

export function withRelativeToEye(material) {
  const cameraHigh = { value: new THREE.Vector3() }
  const cameraLow = { value: new THREE.Vector3() }
  material.onBeforeCompile = (shader) => {
    shader.uniforms.rteCameraHigh = cameraHigh
    shader.uniforms.rteCameraLow = cameraLow
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec3 positionLow;
uniform vec3 rteCameraHigh;
uniform vec3 rteCameraLow;`)
      // (modelViewMatrix's rotation only: its translation is the camera's position, subtracted above.)
      .replace('#include <project_vertex>', `vec4 mvPosition = vec4( mat3( modelViewMatrix ) * ( ( transformed - rteCameraHigh ) + ( positionLow - rteCameraLow ) ), 1.0 );
gl_Position = projectionMatrix * mvPosition;`)
  }
  material.customProgramCacheKey = () => 'relativeToEye'

  const local = new THREE.Vector3()
  const toLocal = new THREE.Matrix4()
  material.userData.setCamera = (object, camera) => {
    local.setFromMatrixPosition(camera.matrixWorld).applyMatrix4(toLocal.copy(object.matrixWorld).invert())
    for (const axis of ['x', 'y', 'z']) {
      const high = Math.fround(local[axis])
      cameraHigh.value[axis] = high
      cameraLow.value[axis] = local[axis] - high
    }
  }
  return material
}
