import * as THREE from 'three'

// three.js looks a directional shadow up from the receiver's float32 world position, through the light's
// shadow matrix, on the GPU. At planet scale (world coordinates of ~1.7e6 m on the Moon, ~6.4e6 m on Earth)
// that is only good to ~0.1-0.5 m, so close-up shadows are blocky at their edges and swim as the shadow
// camera moves. A receiver can instead look its shadow up from its position in its own (local) frame,
// through the light's shadow matrix times its world matrix, multiplied in float64 on the CPU
// (localShadowMatrix): the numbers on the GPU then stay small. One shadow-casting directional light (the sun).

const SHADOW_COORD = 'vDirectionalShadowCoord[ i ] = directionalShadowMatrix[ i ] * shadowWorldPosition;'
if (!THREE.ShaderChunk.shadowmap_vertex.includes(SHADOW_COORD)) console.warn('[localShadows] three.js shadowmap_vertex changed: local shadow lookups will be imprecise')

// The shadowmap_vertex chunk with the directional shadow coordinate taken from `localPosition` (a vec4
// expression in the receiver's frame) through the mat4 uniform named `matrixUniform`. The normal bias is
// applied as three.js does (a world direction).
export function localShadowmapVertex(matrixUniform, localPosition) {
  return THREE.ShaderChunk.shadowmap_vertex.replace(SHADOW_COORD,
    `vDirectionalShadowCoord[ i ] = ${matrixUniform} * ${localPosition}` +
    ' + directionalShadowMatrix[ i ] * vec4( shadowWorldNormal * directionalLightShadows[ i ].shadowNormalBias, 0.0 );')
}

// The light's shadow matrix times `object`'s world matrix (in float64) into `target`.
export function localShadowMatrix(light, object, target) {
  return target.multiplyMatrices(light.shadow.matrix, object.matrixWorld)
}
