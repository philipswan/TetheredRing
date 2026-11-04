import * as THREE from 'three'
import glowTubeVertexShader from '../shaders/glowTube.vert.glsl?raw'
import glowTubeFragmentShader from '../shaders/glowTube.frag.glsl?raw'

// Materials for light without a surface (the launch vehicles' plasma and exhaust), tested against the
// scene's depth but not writing it. Shared by every object that uses them.
//
// The light is added to what is behind it by screen blending, src + dst (1 - src). The canvas holds
// sRGB-encoded colours, so plain addition of the (encoded) light would brighten a bright background,
// such as sunlit cloud, far more than adding the same light in linear terms does; screening keeps a
// faint glow faint over it, and is plain addition over the dark.
const screen = {
  blending: THREE.CustomBlending,
  blendEquation: THREE.AddEquation,
  blendSrc: THREE.OneFactor,
  blendDst: THREE.OneMinusSrcColorFactor,
}

let glowTube = null

// GlowTube (src/scene/GlowTube.js): drawn on the bounding tube's far side only. Set
// uniforms.glowPixelAngle (radians per drawing-buffer pixel) before drawing.
export function glowTubeMaterial() {
  glowTube ??= new THREE.ShaderMaterial({
    name: 'glowTube',
    uniforms: { glowPixelAngle: { value: 0 } },
    vertexShader: glowTubeVertexShader,
    fragmentShader: glowTubeFragmentShader,
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    ...screen,
  })
  glowTube.userData.keep = true
  return glowTube
}
