import * as THREE from 'three'

// Real clouds, for the Earth seen from space: a day's cloud opacity over the whole planet from satellite
// imagery (assets/clouds, built by tools/sources/build_clouds.py: one snapshot per DATE in its
// manifest), as a one-channel texture (equirectangular, from 180 W, north at the top). The snapshot is
// the one nearest the simulated date in the year: it is a real day, not that day's weather, so it does
// not line up with the weather near the ground (src/physics/weather.js). Without the data (not built,
// or not pulled from Git LFS) there are none, and the clouds come from the weather everywhere.

export class RealClouds {
  constructor(baseUrl = `${import.meta.env?.BASE_URL ?? '/'}assets/clouds`) {
    this.baseUrl = baseUrl
    // A placeholder until a snapshot has loaded (ready = false).
    this.texture = new THREE.DataTexture(new Uint8Array([0]), 1, 1, THREE.RedFormat)
    this.texture.needsUpdate = true
    this.ready = false
    this.date = null
    this.loading = false // (a snapshot for a new date is on its way)
    this.manifest = fetch(`${baseUrl}/manifest.json`)
      .then((response) => (response.ok ? response.json() : null))
      .catch(() => null)
      .then((manifest) => {
        if (!manifest?.dates?.length) console.info('[clouds] no real cloud imagery (assets/clouds is not on this machine, or not pulled from Git LFS)')
        return manifest
      })
  }

  /** Shows the snapshot nearest day of year `dayOfYear` (loading it if need be). Call each frame. */
  setDayOfYear(dayOfYear) {
    this.manifest.then((manifest) => {
      if (!manifest?.dates?.length) return
      const dayOf = (date) => {
        const d = new Date(`${date}T00:00:00Z`)
        return (d - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86400000 + 1
      }
      const distance = (date) => {
        const d = Math.abs(dayOf(date) - dayOfYear)
        return Math.min(d, 365.25 - d)
      }
      const date = manifest.dates.reduce((best, d) => (distance(d) < distance(best) ? d : best))
      if (date === this.date) return
      this.date = date
      this.loading = true
      this.load(date)
    })
  }

  async load(date) {
    try {
      const blob = await (await fetch(`${this.baseUrl}/${date}.jpg`)).blob()
      const image = await createImageBitmap(blob, { imageOrientation: 'flipY' })
      if (date !== this.date) return
      const texture = new THREE.Texture(image)
      texture.format = THREE.RedFormat
      texture.internalFormat = 'R8'
      texture.flipY = false // (flipped while decoding: an ImageBitmap cannot be flipped on upload)
      texture.wrapS = THREE.RepeatWrapping
      texture.wrapT = THREE.ClampToEdgeWrapping
      texture.minFilter = THREE.LinearMipmapLinearFilter
      texture.magFilter = THREE.LinearFilter
      texture.anisotropy = 4
      texture.needsUpdate = true
      this.texture.dispose()
      this.texture = texture
      this.ready = true
      this.onChange?.(texture)
    } catch (error) {
      console.warn('[clouds] could not load real clouds for', date, error)
    } finally {
      if (date === this.date) this.loading = false
    }
  }
}
