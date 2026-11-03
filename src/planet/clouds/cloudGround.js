import * as THREE from 'three'

// The ground under the clouds (cloudGround.png, built by tools/sources/build_cloud_ground.py: the land's mean
// height over each 0.125-degree cell, in steps of STEP m, equirectangular from 180 W, north at the top), as a
// texture in the weather map's layout (u = longitude / 360 + 0.5, v = (latitude + 90) / 180):
//   r: the height, as a share of HEIGHT_RANGE
//   g, b: its slope towards the east and the north (m/m), as 0.5 + slope / (2 SLOPE_RANGE)
// The slope is worked out here, once, from the heights either side (so the clouds read one texel for both).
// Until it has loaded the ground is flat at sea level.
export const STEP = 25
export const HEIGHT_RANGE = 255 * STEP
export const SLOPE_RANGE = 0.25
const URL_PNG = new URL('./cloudGround.png', import.meta.url).href
const EARTH_RADIUS = 6371000

export class CloudGround {
  constructor() {
    this.texture = new THREE.DataTexture(new Uint8Array([0, 128, 128, 255]), 1, 1, THREE.RGBAFormat)
    this.texture.needsUpdate = true
    this.ready = this.load().catch((error) => console.warn('[clouds] could not load the ground map', error))
  }

  async load() {
    const bitmap = await createImageBitmap(await (await fetch(URL_PNG)).blob())
    const w = bitmap.width, h = bitmap.height
    const canvas = new OffscreenCanvas(w, h)
    const context = canvas.getContext('2d', { willReadFrequently: true })
    context.drawImage(bitmap, 0, 0)
    const pixels = context.getImageData(0, 0, w, h).data
    const height = (x, y) => pixels[(Math.min(Math.max(y, 0), h - 1) * w + ((x % w) + w) % w) * 4] * STEP
    const data = new Uint8Array(w * h * 4)
    const cell = Math.PI * EARTH_RADIUS / h  // (m north-south)
    for (let y = 0; y < h; y++) {
      const latitude = (0.5 - (y + 0.5) / h) * Math.PI
      const east = cell * Math.max(Math.cos(latitude), 0.01)
      const row = h - 1 - y  // (the texture's first row is the south's)
      for (let x = 0; x < w; x++) {
        const o = (row * w + x) * 4
        const slopeEast = (height(x + 1, y) - height(x - 1, y)) / (2 * east)
        const slopeNorth = (height(x, y - 1) - height(x, y + 1)) / (2 * cell)
        const encode = (s) => Math.round(Math.min(Math.max(0.5 + s / (2 * SLOPE_RANGE), 0), 1) * 255)
        data[o] = pixels[(y * w + x) * 4]
        data[o + 1] = encode(slopeEast)
        data[o + 2] = encode(slopeNorth)
        data[o + 3] = 255
      }
    }
    const texture = new THREE.DataTexture(data, w, h, THREE.RGBAFormat)
    texture.wrapS = THREE.RepeatWrapping
    texture.wrapT = THREE.ClampToEdgeWrapping
    texture.minFilter = texture.magFilter = THREE.LinearFilter
    texture.needsUpdate = true
    this.texture.dispose()
    this.texture = texture
    this.onChange?.(texture)
  }
}
