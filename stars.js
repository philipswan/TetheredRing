import * as THREE from 'three'

export class stars extends THREE.Points {

  constructor(dParamWithUnits, planetSpec) {
    
    const roughPlanetRadius = planetSpec.ellipsoid.a
    const starVertices = []
    const starColors = []
    for ( let i = 0; i < 10000;) {
      // Probably should eliminate all of the stars that are too close to the planet 
      // starVertices.push( THREE.MathUtils.randFloatSpread( 2000 * radiusOfPlanet/8 ) ) // x
      // starVertices.push( THREE.MathUtils.randFloatSpread( 2000 * radiusOfPlanet/8 ) ) // y
      // starVertices.push( THREE.MathUtils.randFloatSpread( 2000 * radiusOfPlanet/8 ) ) // z
      // Better code...
      // Create stars at random positions and then push them all 2,000,000 km away from the origin
      const XYZ = new THREE.Vector3(
        THREE.MathUtils.randFloat(-1, 1),
        THREE.MathUtils.randFloat(-1, 1),
        THREE.MathUtils.randFloat(-1, 1))
      if (XYZ.length()<=1) {
        // The random position needs to be not on the origin and also within a unit sphere
        XYZ.normalize().multiplyScalar(256 * roughPlanetRadius)
        starVertices.push(XYZ.x, XYZ.y, XYZ.z)
        i++
      }
      const starBrightness = THREE.MathUtils.randFloat(0, 1)
      starColors.push(starBrightness, starBrightness, starBrightness)
    }
    const starGeometry = new THREE.BufferGeometry()
    starGeometry.setAttribute( 'position', new THREE.Float32BufferAttribute( starVertices, 3 ) )
    starGeometry.setAttribute( 'color', new THREE.Float32BufferAttribute( starColors, 3 ) )
    const starsMaterial = new THREE.PointsMaterial( { vertexColors: true } ) 

    super(starGeometry, starsMaterial);
    // Ensure the prototype chain is correct
    Object.setPrototypeOf(this, stars.prototype);

    this.name = 'stars'

    this.roughPlanetRadius = roughPlanetRadius

  }

  animate(dParamWithUnits, planetSpec, camera) {
    // To improve rendering performance when within the atmosphere, and when the atmosphere shader is on, make stars invisible
    const weAreFar1 = (camera.position.length() > (this.roughPlanetRadius + 10000))
    this.visible = dParamWithUnits['showStars'].value && (weAreFar1 || !dParamWithUnits['showEarthsAtmosphere'].value)
  }

}