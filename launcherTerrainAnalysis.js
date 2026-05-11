import * as THREE from 'three'

// Analyzes the launcher ramp altitude against terrain displacement
// This hack plots the altitude of the ramp section of the launcher alongside the distance above sea level,
// of the terrain above or below the ramp section's curve.

export function analyzeLauncherTerrainDisplacement(launchSystemObject, planetMeshes, planetSpec, tram, scene) {
  // Build a cache of displacement map pixel data from planet mesh tiles
  const tileMeshes = []
  planetMeshes.traverse(child => {
    if (child.type === 'Mesh') tileMeshes.push(child)
  })
  const tileW = 24, tileH = 12
  const displacementCache = new Map()
  
  function getDisplacementPixelData(meshIndex) {
    if (displacementCache.has(meshIndex)) return displacementCache.get(meshIndex)
    const mesh = tileMeshes[meshIndex]
    if (!mesh) { displacementCache.set(meshIndex, null); return null }
    const mat = mesh.material
    const dMap = mat.isShaderMaterial ? mat.uniforms.displacementMap.value : mat.displacementMap
    const dScale = mat.isShaderMaterial ? mat.uniforms.displacementScale.value : mat.displacementScale
    const dBias = mat.isShaderMaterial ? mat.uniforms.displacementBias.value : mat.displacementBias
    if (!dMap || !dMap.image || !dMap.image.complete) { displacementCache.set(meshIndex, null); return null }
    const img = dMap.image
    const canvas = document.createElement('canvas')
    canvas.width = img.width
    canvas.height = img.height
    const ctx = canvas.getContext('2d')
    ctx.drawImage(img, 0, 0)
    const imageData = ctx.getImageData(0, 0, img.width, img.height)
    const entry = { data: imageData.data, width: img.width, height: img.height, scale: dScale, bias: dBias }
    displacementCache.set(meshIndex, entry)
    return entry
  }
  
  function sampleTerrainDisplacement(point) {
    // Convert world point to geodetic (lat, lon) and map to tile/pixel via equirectangular projection
    const geo = tram.ecefToGeodetic(point.x, point.y, point.z, planetSpec.ellipsoid)
    let lon = geo.lon  // degrees
    if (lon < -180) lon += 360
    if (lon >= 180) lon -= 360
    const colat = 90 - geo.lat  // colatitude in degrees, 0 at north pole, 180 at south pole
    // Tile indices (24 columns by longitude, 12 rows by colatitude, each tile = 15°)
    const ti = Math.min(Math.max(Math.floor((lon + 180) / 15), 0), tileW - 1)
    const tj = Math.min(Math.max(Math.floor(colat / 15), 0), tileH - 1)
    const meshIndex = tj * tileW + ti
    const entry = getDisplacementPixelData(meshIndex)
    if (!entry) return null
    // Sub-tile fractions (0→1 within tile)
    const u = ((lon + 180) / 15) - ti
    const v = (colat / 15) - tj
    // Pixel coordinates with bilinear interpolation (matching GPU filtering)
    const fxRaw = u * (entry.width - 1)
    const fyRaw = v * (entry.height - 1)
    const fx0 = Math.floor(fxRaw), fy0 = Math.floor(fyRaw)
    const fx1 = Math.min(fx0 + 1, entry.width - 1), fy1 = Math.min(fy0 + 1, entry.height - 1)
    const dx = fxRaw - fx0, dy = fyRaw - fy0
    const sample = (px, py) => entry.data[(py * entry.width + px) * 4] / 255
    const texValue = (1 - dx) * (1 - dy) * sample(fx0, fy0) +
                     dx * (1 - dy) * sample(fx1, fy0) +
                     (1 - dx) * dy * sample(fx0, fy1) +
                     dx * dy * sample(fx1, fy1)
    return { displacement: texValue * entry.scale + entry.bias, ti, tj, meshIndex, px: Math.round(fxRaw), py: Math.round(fyRaw), texValue }
  }
  
  //console.log(launchSystemObject.launchRampCurve[0])
  for (let i = 0; i<1; i+=0.0025) {
    const point = launchSystemObject.launchRampCurve[0].getPoint(i)
    const latitude = Math.asin(point.y / point.length())
    const altitude = point.length() - planetSpec.radiusAtLatitude(latitude)  // This is the altitude above sea level of the ramp section of the launcher
    const terrainResult = sampleTerrainDisplacement(point)
    if (terrainResult !== null) {
      //console.print(i.toFixed(2), altitude, terrainResult.displacement, `tile(${terrainResult.ti},${terrainResult.tj})`, `px=${terrainResult.px}`, `py=${terrainResult.py}`, `tex=${terrainResult.texValue.toFixed(4)}`)
      console.print(i.toFixed(5), altitude, terrainResult.displacement)
      // Place a debug sphere at the terrain surface point
      const direction = point.clone().normalize()
      const terrainRadius = planetSpec.radiusAtLatitude(latitude) + terrainResult.displacement
      const terrainPoint = direction.multiplyScalar(terrainRadius)
      const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(50, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0xff0000 })
      )
      sphere.position.copy(terrainPoint)
      scene.add(sphere)
    }
  }

  // Place a debug sphere at the summit of Mauna Kea (19.8207°N, 155.4680°W, 4205m)
  const maunaKeaECEF = tram.geodeticToECEF(19.8207, -155.4680, 4205, planetSpec.ellipsoid)
  const maunaKeaPoint = new THREE.Vector3(maunaKeaECEF.x, maunaKeaECEF.y, maunaKeaECEF.z)
  const maunaKeaSphere = new THREE.Mesh(
    new THREE.SphereGeometry(500, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0x00ff00 })
  )
  maunaKeaSphere.position.copy(maunaKeaPoint)
  scene.add(maunaKeaSphere)
}
