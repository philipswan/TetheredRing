import * as THREE from 'three'
import { EllipsoidGeometry } from './EllipsoidGeometry.js'

export class planet {

  constructor(dParamWithUnits, planetSpec, enableVR, nonGUIParams) {

    const roughPlanetRadius = planetSpec.ellipsoid.a
    let planetWidthSegments = 768
    let planetHeightSegments = 192

    let eightTextureMode
    let TextureMode24x12
    let TextureModeOpenLayers = false
    if (enableVR) {
      eightTextureMode = false
      TextureMode24x12 = true
    }
    else {
      eightTextureMode = false // This mode is broken...
      TextureMode24x12 = true // Hack // true
    }



    // Parameters for a perfect sphere (flattening f = 0)
    const radius = 5;
    const flattening = 0; // No flattening, perfect sphere
    const ellipsoid = {
        a: radius, // Semi-major axis = radius
        f: flattening, // Flattening = 0
    };
    
    // Segments for testing
    const widthSegments = 32;
    const heightSegments = 16;
    
    // Create a sphere using THREE.SphereGeometry
    const sphereGeometry = new THREE.SphereGeometry(radius, widthSegments, heightSegments);
    
    // Create an ellipsoid with f = 0 (should match the sphere)
    const ellipsoidGeometry = new EllipsoidGeometry(ellipsoid, widthSegments, heightSegments);
    
    // Helper function to compare positions and normals
    function compareGeometries(geometryA, geometryB) {
        const positionA = geometryA.attributes.position.array;
        const positionB = geometryB.attributes.position.array;
        const normalA = geometryA.attributes.normal.array;
        const normalB = geometryB.attributes.normal.array;
    
        let positionMatches = true;
        let normalMatches = true;
    
        for (let i = 0; i < positionA.length; i++) {
            if (Math.abs(positionA[i] - positionB[i]) > 1e-6) {
                positionMatches = false;
                console.log(`Position mismatch at index ${i}: ${positionA[i]} vs ${positionB[i]}`);
            }
            if (Math.abs(normalA[i] - normalB[i]) > 1e-6) {
                normalMatches = false;
                console.log(`Normal mismatch at index ${i}: ${normalA[i]} vs ${normalB[i]}`);
            }
        }
    
        console.log(`Position match: ${positionMatches}`);
        console.log(`Normal match: ${normalMatches}`);
    }
    
    // Compare the geometries
    compareGeometries(sphereGeometry, ellipsoidGeometry);
    



    // opacity will now work with or without shaders, so warning is not needed.
    const useShaders = true;

    //tetheredRingRefCoordSys.rotation.y = Math.PI/4  // This is done so that the eccentricity adjustment is where we need it to be
    // The above line puts the reference coordinate system's y-axis at lat/lon {0, 0} when RingCenterLat==0 and RingCenterLon==0
    // This is needed because the ring will be centered around the coordinate system's y-axis
    // We want the ring centered around the y-axis because .setFromSphericalCoords's polar angle is relative to the y-axis

    const planetMeshes = new THREE.Group()
    planetMeshes.name = 'planetMeshes'
    const generateMipmaps = true // Set to true for higher quality, false for faster load time
    let textureFilename
    let displacementMap

    if (dParamWithUnits['showEarthsSurface'].value) {
      if (TextureMode24x12) {
        // const marker = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), new THREE.MeshBasicMaterial({color: 0x3f3f4f}))
        // let markerSize = 50000
        // marker.scale.set(markerSize, markerSize, markerSize)
        const colorPath = (planetSpec.name.toLowerCase() === 'earth') ? '' : '/color'  // For backward compatability with where the Earth textures were originally stored
        const displacementPath = (planetSpec.name.toLowerCase() === 'earth') ? 'DisplacementMaps/' : 'displacement/'  // For backward compatability with where the Earth textures were originally stored
        const colorFormat = planetSpec.textureColorFormat
        const displacementFormat = planetSpec.textureDisplacementFormat

        const w = 24
        const h = 12

        const displacementBias = dParamWithUnits['displacementMapOverride'].value ? dParamWithUnits['displacementBias'].value : planetSpec.displacementBias
        const displacementScale = dParamWithUnits['displacementMapOverride'].value ? dParamWithUnits['displacementScale'].value : planetSpec.displacementScale
        for (let j=0; j<h; j++) {
          for (let i = 0; i<w; i++) {
            // ToDo: The thresholds in the statement below should be calculated from the equivalent latitude of the ring
            //const farFromRing = (localPoint.y < 0.45 * roughPlanetRadius) || (localPoint.y > 0.7 * roughPlanetRadius)
            const useHiRes = nonGUIParams['getCapturePresetRegions'](i, j)
            const hiLo = (useHiRes) ? 'HR' : 'LR'
            textureFilename = `./textures/${planetSpec.texturePath}${colorPath}/${w}x${h}/${hiLo}/earth_${hiLo}_${w}x${h}_${i}x${j}.${colorFormat}`
            const texture = new THREE.TextureLoader().load(textureFilename)
            texture.colorSpace = THREE.SRGBColorSpace
            texture.generateMipmaps = generateMipmaps

            if (planetSpec.name=="Earth" && !useHiRes) {
              displacementMap = null
            }
            else {
              const displacementFilename = `./textures/${planetSpec.texturePath}${displacementPath}${w}x${h}/${hiLo}/earth_${hiLo}_${w}x${h}_${i}x${j}.${displacementFormat}`
              displacementMap = new THREE.TextureLoader().load(displacementFilename)
            }

            planetWidthSegments = (!useHiRes) ? 768 : 768*16
            planetHeightSegments = (!useHiRes) ? 192 : 192*16
            const planetGeometry = new EllipsoidGeometry(planetSpec.ellipsoid, planetWidthSegments/w, planetHeightSegments/h, i*Math.PI*2/w, Math.PI*2/w, j*Math.PI/h, Math.PI/h)
            const planetMesh = new THREE.Mesh(
              planetGeometry,
              (useShaders) ? 
                new THREE.ShaderMaterial({
                  //vertexShader: vertexShader,
                  //fragmentShader: fragmentShader,
                  vertexShader: document.getElementById( 'vertexShader' ).textContent,
                  fragmentShader: document.getElementById( 'fragmentShader' ).textContent,
                  //fragmentShader: document.getElementById( 'fragmentShaderInv' ).textContent,
                  transparent: (dParamWithUnits['earthTextureOpacity'].value!==1) ? true : false,
                  uniforms: {
                    planetTexture: { value: texture },
                    displacementMap: { value: displacementMap },
                    displacementScale: { value: displacementScale },
                    displacementBias: { value: displacementBias },
                    hasDisplacementMap: { value: displacementMap != null },
                    opacity: { value: dParamWithUnits['earthTextureOpacity'].value }
                  } } ) :
                new THREE.MeshLambertMaterial({
                  map: texture,
                  displacementMap: displacementMap,
                  displacementScale: displacementScale,
                  displacementBias: displacementBias,
                  transparent: (dParamWithUnits['earthTextureOpacity'].value!==1) ? true : false,
                  opacity: dParamWithUnits['earthTextureOpacity'].value,
                  wireframe: false
                })
              //displacementMap: new THREE.TextureLoader().load( './textures/HighRes/EARTH_DISPLACE_42K_16BITS_preview.jpg' ),
              //displacementScale: 500000,
            )
            planetMesh.name = 'planet'
            planetMesh.scale.y = 1.0 //- 1.0/planetSpec.WGS84FlattenningFactor // Squishes the earth (and everything else) by the correct flattening factor
            planetMesh.rotation.y = -Math.PI/2  // This is needed to have the planet's texture align with the planet's Longintitude system
            planetMesh.matrixValid = false
            if (dParamWithUnits['perfOptimizedThreeJS'].value) planetMesh.freeze()
            planetMeshes.add(planetMesh)
          }
        }
      }
      // else if (TextureModeOpenLayers) {
      //   const planetMesh = new THREE.Mesh(
      //     new THREE.SphereGeometry(roughPlanetRadius, planetWidthSegments, planetHeightSegments),
      //     new THREE.ShaderMaterial({
      //       vertexShader: document.getElementById('vertexShader').textContent,
      //       fragmentShader: document.getElementById('fragmentShader').textContent,
      //       uniforms: {
      //         planetTexture: {
      //           value: undefined,
      //         }
      //       }
      //     })
      //   )
      //   makePlanetTexture(planetMesh, orbitControls, camera, roughPlanetRadius, false, (planetTexture) => {
      //     planetMesh.material.uniforms.planetTexture.value = planetTexture;
      //     planetMesh.material.uniforms.planetTexture.needsUpdate = true;
      //   });

      //   planetMesh.name = 'planet'
      //   planetMesh.rotation.y = -Math.PI / 2  // This is needed to have the planet's texture align with the planet's Longintitude system
      //   planetMesh.matrixValid = false
      //   if (guidParam['perfOptimizedThreeJS']) planetMesh.freeze()
      //   planetMeshes.add(planetMesh)


      // }
      else if (eightTextureMode) {
        let letter
        for (let j=0; j<2; j++) {
          for (let i = 0; i<4; i++) {
            letter = String.fromCharCode(65+i)
            textureFilename = `./textures/world.topo.200404.3x21600x21600.${letter}${j+1}.jpg`
            //textureFilename = `./textures/world.topo.200404.3x16384x16384.${letter}${j+1}.jpg`
            const planetMesh = new THREE.Mesh(
              new THREE.SphereGeometry(roughPlanetRadius, planetWidthSegments, planetHeightSegments, i*Math.PI/2, Math.PI/2, j*Math.PI/2, Math.PI/2),
              new THREE.ShaderMaterial({
                //vertexShader: vertexShader,
                //fragmentShader: fragmentShader,
                vertexShader: document.getElementById( 'vertexShader' ).textContent,
                fragmentShader: document.getElementById( 'fragmentShader' ).textContent,
                uniforms: {
                  planetTexture: {
                    //value: new THREE.TextureLoader().load( './textures/bluemarble_16384.png' )
                    value: new THREE.TextureLoader().load(textureFilename),
                    generateMipmaps: generateMipmaps
                  }
                },
                //displacementMap: new THREE.TextureLoader().load( './textures/HighRes/EARTH_DISPLACE_42K_16BITS_preview.jpg' ),
                //displacementScale: 500000,
              })
            )
            planetMesh.name = 'planet'
            planetMesh.rotation.y = -Math.PI/2  // This is needed to have the planet's texture align with the planet's Longintitude system
            planetMesh.matrixValid = false
            if (dParamWithUnits['perfOptimizedThreeJS'].value) planetMesh.freeze()
            planetMeshes.add(planetMesh)
          }
        }
      }
      else if (useShaders) {
        //const texture = new THREE.TextureLoader().load( './textures/bluemarble_4096.jpg')
        const texture = new THREE.TextureLoader().load( './textures/bluemarble_16384.jpg' )
        //const texture = new THREE.TextureLoader().load( './textures/venus1280x720.jpg' )
        //const texture = new THREE.TextureLoader().load( './textures/Titan2000x1000.jpg' )
        //const texture = new THREE.TextureLoader().load( './textures/human_population_density_map.png' )
        //const texture = new THREE.TextureLoader().load( './textures/bluemarble_16384.jpg')
        texture.colorSpace = THREE.SRGBColorSpace
        texture.generateMipmaps = generateMipmaps
        const planetMesh = new THREE.Mesh(
          new THREE.SphereGeometry(roughPlanetRadius, planetWidthSegments, planetHeightSegments),
          // new THREE.MeshPhongMaterial({
          //   //roughness: 1,
          //   //metalness: 0,
          //   map: new THREE.TextureLoader().load( './textures/bluemarble_4096.jpg' ), <- this is broken, need texture.colorSpace = THREE.SRGBColorSpace
          //   //map: new THREE.TextureLoader().load( './textures/bluemarble_16384.png' ),
          //   //map: new THREE.TextureLoader().load( './textures/earthmap1k.jpg' ),
          //   //bumpMap: new THREE.TextureLoader().load( './textures/earthbump.jpg' ),
          //   //bumpScale: 1000000,
          //   //displacementMap: new THREE.TextureLoader().load( './textures/HighRes/EARTH_DISPLACE_42K_16BITS_preview.jpg' ),
          //   //displacementScale: 20000,
          // })
          // Hack
          new THREE.ShaderMaterial({
            //vertexShader: vertexShader,
            //fragmentShader: fragmentShader,
            vertexShader: document.getElementById( 'vertexShader' ).textContent,
            fragmentShader: document.getElementById( 'fragmentShader' ).textContent,
            blending: THREE.CustomBlending,
            blendSrcAlpha: 0.5,
            generateMipmaps: generateMipmaps,
            name: 'planet',
            uniforms: {
              planetTexture: {
                value: texture,
              }
            }
          })
        )
        planetMesh.name = 'planet'
        planetMesh.rotation.y = -Math.PI/2  // This is needed to have the planet's texture align with the planet's Longintitude system
        planetMesh.matrixValid = false
        if (dParamWithUnits['perfOptimizedThreeJS'].value) planetMesh.freeze()
        planetMeshes.add(planetMesh)
      }
      else {
        console.log("Basic Texture")
        let texture, displacementMap, displacementScale
        if (planetSpec.name == "Earth") {
          texture = new THREE.TextureLoader().load( './textures/bluemarble_4096.jpg')
          texture.colorSpace = THREE.SRGBColorSpace
          displacementMap = new THREE.TextureLoader().load( './textures/EARTH_DISPLACE_42K_16BITS_preview.jpg' )
        }
        else if (planetSpec.name == "Moon") {
          // texture = new THREE.TextureLoader().load( './textures/lroc_color_poles.png' )
          // displacementMap = new THREE.TextureLoader().load( './textures/ldem_64.png' )
          texture = new THREE.TextureLoader().load( './textures/moon.jpg' )
          texture.colorSpace = THREE.SRGBColorSpace
          displacementMap = null
        }
        else if (planetSpec.name == "Mars") {
          texture = new THREE.TextureLoader().load( './textures/mar0kuu2.jpg' )
          texture.colorSpace = THREE.SRGBColorSpace
          displacementMap = null
        }
        displacementScale = planetSpec.displacementScale

        //const displacementMap = new THREE.TextureLoader().load( './textures/DisplacementMaps/EARTH_DISPLACE_16BITS.png' )
        //const displacementMap = new THREE.TextureLoader().load( './textures/DisplacementMaps/Earth_Disp/Earth_Disp_1032.jpg' )
        //const texture = new THREE.TextureLoader().load( './textures/venus1280x720.jpg' ),
        //const texture = new THREE.TextureLoader().load( './textures/bluemarble_16384.png' ),
        //const texture = new THREE.TextureLoader().load( './textures/earthmap1k.jpg' ),
        texture.generateMipmaps = generateMipmaps
        const planetMesh = new THREE.Mesh(
          new THREE.SphereGeometry(roughPlanetRadius, planetWidthSegments, planetHeightSegments),
          new THREE.MeshLambertMaterial({
            //roughness: 1,
            //metalness: 0,
            map: texture,
            //bumpMap: new THREE.TextureLoader().load( './textures/earthbump.jpg' ),
            //bumpScale: 1000000,
            displacementMap: displacementMap,
            displacementScale: displacementScale,
            // blending: THREE.CustomBlending,
            // blendEquation: THREE.AddEquation, //default
            // blendSrc: THREE.SrcAlphaFactor, //default
            // blendDst: THREE.OneMinusSrcAlphaFactor, //default
            // blendSrcAlpha: dParamWithUnits['earthTextureOpacity'].value,
            transparent: false,
            //depthWrite: true,
            opacity: dParamWithUnits['earthTextureOpacity'].value
          })
        )
        planetMesh.name = 'planet'
        planetMesh.rotation.y = -Math.PI/2  // This is needed to have the planet's texture align with the planet's Longintitude system
        planetMesh.matrixValid = false
        if (dParamWithUnits['perfOptimizedThreeJS'].value) planetMesh.freeze()
        planetMeshes.add(planetMesh)  
      }
    }
    //planetMesh.castShadow = true

    const atmosphereMesh = new THREE.Mesh(
      new THREE.SphereGeometry(roughPlanetRadius, planetWidthSegments/16, planetHeightSegments/16),
      new THREE.ShaderMaterial({
        //vertexShader: atmosphereVertexShader,
        //fragmentShader: atmosphereFragmentShader,
        vertexShader: document.getElementById( 'atmosphereVertexShader' ).textContent,
        fragmentShader: document.getElementById( 'atmosphereFragmentShader' ).textContent,
        blending: THREE.AdditiveBlending,
        side: THREE.BackSide
      })
    )
    atmosphereMesh.name = 'atmosphere'

    // ToDo: Scaling this sphere as opposed to setting its radius directly seems a bit hacky.
    atmosphereMesh.scale.set(1.1, 1.1 * (1.0 - 1.0/planetSpec.WGS84FlattenningFactor), 1.1)
    //atmosphereMesh.receiveShadow = true
    atmosphereMesh.visible = dParamWithUnits['showEarthsAtmosphere'].value

    // const darkSphereMesh = new THREE.Mesh(
    //   new THREE.SphereGeometry(roughPlanetRadius*0.90, planetWidthSegments/4, planetHeightSegments/4),
    //   new THREE.MeshBasicMaterial({color: 0x000000})
    // )
    // darkSphereMesh.name = 'darkSphereMesh'

    // const backgroundPatchDescriptor = {
    //   // textureFilename: './textures/LundHillWashington3.jpg'
    //   // textureFilename: './textures/ZionNationalPark.jpg'
    //   // textureFilename: './textures/Mongolia.jpg'
    //   // textureFilename: './textures/myakka_oli_2022031_lrg.jpg'
    //   // textureFilename: './textures/chinasolar_oli_2020264_lrg.jpg'
    //   // textureFilename: './textures/AustraliaDesert.jpg'
    //   // textureFilename: './textures/CrepuscularRays.jpg'
    //   // textureFilename: './textures/ISS042-E-263234.jpg'
    //   patchAltitude: 2000,
    //   patchImageWidth: 2239,
    //   patchImageHeight: 1260,
    //   patchPosition: new THREE.Vector3(-3954814.892863949, 4671082.911289911, -2284901.3465206292),
    //   patchRotation: new THREE.Vector3(0, 0, 0)
    // }
    // const backgroundPatchDescriptor = {
    //   textureFilename: './textures/LundHillWashington4.jpg',
    //   patchAltitude: 3000,
    //   patchImageWidth: 2239,
    //   patchImageHeight: 1260,
    //   patchPosition: new THREE.Vector3(-3819625.2935746475, 4596971.6990394695, -2235341.3665288324),     // Washington State
    //   patchRotation: new THREE.Euler(-2.0234735226917318, -0.641906096175003, -2.1683293345531034, 'XYZ'),
    //   patchScale: 209.241648
    // }
    // const backgroundPatchDescriptor = {
    //   textureFilename: './textures/LundHillWashington3.jpg',
    //   patchAltitude: 2000,
    //   patchImageWidth: 2239,
    //   patchImageHeight: 1260,
    //   patchPosition: new THREE.Vector3(-3827945.649196222, 4596585.471598385, -2221862.1287314435),     // Washington State
    //   patchRotation: new THREE.Euler(-2.0234735226917318, -0.641906096175003, -2.1683293345531034, 'XYZ'),
    //   patchScale: 50.84
    // }
    const backgroundPatchDescriptor = {
      //textureFilename: './textures/LundHillWashington1.jpg',
      textureFilename: './textures/myakka_oli_2022031_lrg.jpg',
      //textureFilename: './textures/mars/olympusmons.jpg',
      patchAltitude: 1200,
      patchImageWidth: 2239,
      patchImageHeight: 1260,
      //patchPosition: new THREE.Vector3(-3827945.649196222, 4596585.471598385, -2221862.1287314435),     // Washington State
      patchPosition: new THREE.Vector3(-2485252.833291091, 2139838.026337634, -5469810.453140184),     // Washington State
      patchRotation: new THREE.Euler(-2.0234735226917318, -0.641906096175003, -2.1683293345531034, 'XYZ'),
      patchScale: 10
    }
    const backgroundPatchMesh = this.addBackgroundPatch(backgroundPatchDescriptor, planetSpec)

    //return [planetMeshes, atmosphereMesh, darkSphereMesh, backgroundPatchMesh]
    return [planetMeshes, atmosphereMesh, backgroundPatchMesh]

  }

  addBackgroundPatch(descriptor, planetSpec) {
    // Add a patch of high res texture on the ground as a background for some downward looking shots 
    const roughPlanetRadius = planetSpec.ellipsoid.a
    const backgroundPatchGeometry = new THREE.PlaneGeometry(descriptor.patchImageWidth, descriptor.patchImageHeight)
    
    //const backgroundPatchGeometry = new THREE.SphereGeometry(100000, 32, 32)
    const texture = new THREE.TextureLoader().load( descriptor.textureFilename )
    texture.colorSpace = THREE.SRGBColorSpace
    const backgroundPatchMaterial = new THREE.MeshBasicMaterial({
      side: THREE.DoubleSide,
      map: texture,
      transparent: true,
      opacity: 0.95
    })
    backgroundPatchMaterial.map.name = 'backeroundPatch'
    const backgroundPatchMesh = new THREE.Mesh(
      backgroundPatchGeometry,
      backgroundPatchMaterial
      // new THREE.ShaderMaterial({
      //   vertexShader: document.getElementById( 'vertexShader' ).textContent,
      //   fragmentShader: document.getElementById( 'fragmentShader' ).textContent,
      //   uniforms: {
      //     planetTexture: {
      //       value: new THREE.TextureLoader().load( './textures/bluemarble_16384.png' )
      //     }
      //   }
      // })
    )

    backgroundPatchMesh.position.copy(descriptor.patchPosition).normalize().multiplyScalar(roughPlanetRadius+descriptor.patchAltitude)
    backgroundPatchMesh.lookAt(backgroundPatchMesh.position.clone().multiplyScalar(2))
    backgroundPatchMesh.rotation.copy(descriptor.patchRotation)
    //backgroundPatchMesh.rotateZ(descriptor.patchRotation)
    backgroundPatchMesh.scale.set(descriptor.patchScale, descriptor.patchScale, descriptor.patchScale)

    return backgroundPatchMesh
    // this.backgroundPatchActive = false // State variable to keep track of whether the background patch is currently active
    // this.updateBackgroundPatch()

  }

  addWater() {
        // const water = new Water(
    //   new THREE.SphereGeometry(roughPlanetRadius, planetWidthSegments/16, planetHeightSegments/16),
    //   {
    //     textureWidth: 512,
    //     textureHeight: 512,
    //     waterNormals: new THREE.TextureLoader().load( './textures/waternormals.jpg', function ( texture ) {
    //       texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    //     } ),
    //     sunDirection: new THREE.Vector3(),
    //     sunColor: 0xffffff,
    //     waterColor: 0x001e0f,
    //     distortionScale: 3.7,
    //     fog: scene.fog !== undefined
    //   }
    // )
    // scene.add(water)

    // Experimental code
    // const plane = new THREE.mesh(new THREE.PlaneGeometry(2, 2, 512, 512), 
    //   new THREE.MeshLambertMaterial(
    //     {
    //       map: earthBaseColor,
    //       normalMap: earthNormalMap,
    //       displacementMap: earthDisplacementMap,
    //       displacementScale: 0.1,
    //       roughnessMap: earthRoughnessMap,
    //       roughness: 0.5,
    //       aoMap: earthAmbienOcclusionMap,
    //     }
    //   )
    // )
    // plane.geometry.atributes.uv2 = plane.geometry.atributes.uv
    // scene.add(plane)

    // const earth2Geometry = new THREE.SphereGeometry(roughPlanetRadius, planetWidthSegments, planetHeightSegments, 0, Math.PI/2, 0, Math.PI/2)
    // const earth2Material = new THREE.MeshPhongMaterial({
    //   roughness: 1,
    //   metalness: 0,
    //   map: new THREE.TextureLoader().load( './textures/world.topo.200404.3x21600x21600.A1.jpg' ),
    //   //map: new THREE.TextureLoader().load( './textures/bluemarble_16384.png' ),
    //   //map: new THREE.TextureLoader().load( './textures/earthmap1k.jpg' ),
    //   //bumpMap: new THREE.TextureLoader().load( './textures/earthbump.jpg' ),
    //   //bumpScale: 1000000,
    //   displacementMap: new THREE.TextureLoader().load( './textures/HighRes/EARTH_DISPLACE_42K_16BITS_preview.jpg' ),
    //   displacementScale: 20000,
    // })
    // const earth2Mesh = new THREE.Mesh(earth2Geometry, earth2Material)
    // earth2Mesh.rotation.y = -Math.PI/2  // This is needed to have the planet's texture align with the planet's Longintitude system
    //earthMesh.position = 
    //scene.add(earth2Mesh)
  }
}