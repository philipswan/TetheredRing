import * as THREE from 'three'

export class planet {

  constructor(dParamWithUnits, planetSpec, enableVR, nonGUIParams) {
    let planetWidthSegments = 768
    let planetHeightSegments = 192
    const radiusOfPlanet = planetSpec.radiusOfPlanet


    let eightTextureMode = false
    let TextureMode24x12 = true
    let TextureModeOpenLayers = false
    if (enableVR) {
      eightTextureMode = false
      TextureMode24x12 = true
    }
    else {
      eightTextureMode = false
      TextureMode24x12 = true
    }

    const useShaders = false
    if (dParamWithUnits['earthTextureOpacity'].value!==1 && useShaders) {
      console.log("Warning useShaders should be set to false when earthTextureOpacity is set less than one.")
    }


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

        const w = 24
        const h = 12
        for (let j=0; j<h; j++) {
          for (let i = 0; i<w; i++) {
            const pointOnEarthsSurface = new THREE.Vector3().setFromSphericalCoords(
              radiusOfPlanet, 
              Math.PI * (1+2*j)/(2*h),
              Math.PI * (1 + (1+2*i)/w)
            )

            // ToDo: The thresholds in the statement below should be calculated from the equivalent latitude of the ring
            //const farFromRing = (localPoint.y < 0.45 * radiusOfPlanet) || (localPoint.y > 0.7 * radiusOfPlanet)
            // Hack
            const farFromRing = // Just render these regions area in high-res 
              // ((i!=3) || (j!=2)) &&
              // ((i!=1) || (j!=4)) &&
              // ((i!=18) || (j!=3)) &&
              // ((i!=18) || (j!=4)) &&
              // ((i!=23) || (j!=8)) &&  // New Zealand North Island
              // ((i!=0) || (j!=8)) &&  // Ocean east of New Zealand North Island
              nonGUIParams['getCapturePresetRegions'](i, j)

            if (farFromRing) {
              textureFilename = `./textures/24x12/LR/earth_LR_${w}x${h}_${i}x${j}.jpg`
            }
            else {
              textureFilename = `./textures/24x12/HR/earth_HR_${w}x${h}_${i}x${j}.jpg`
            }
            //console.log(filename)
            const texture = new THREE.TextureLoader().load(textureFilename)
            texture.generateMipmaps = generateMipmaps

            if (farFromRing) {
              displacementMap = null
            }
            else {
              const displacementFilename = `./textures/DisplacementMaps/24x12/HR/earth_HR_${w}x${h}_${i}x${j}.png`
              displacementMap = new THREE.TextureLoader().load(displacementFilename)
            }

            planetWidthSegments = (farFromRing) ? 768 : 768*64
            planetHeightSegments = (farFromRing) ? 192 : 192*64
            const planetGeometry = new THREE.SphereGeometry(radiusOfPlanet, planetWidthSegments/w, planetHeightSegments/h, i*Math.PI*2/w, Math.PI*2/w, j*Math.PI/h, Math.PI/h)
            const planetMesh = new THREE.Mesh(
              planetGeometry,
              (useShaders) ? 
                new THREE.ShaderMaterial({
                  //vertexShader: vertexShader,
                  //fragmentShader: fragmentShader,
                  vertexShader: document.getElementById( 'vertexShader' ).textContent,
                  fragmentShader: document.getElementById( 'fragmentShader' ).textContent,
                  //fragmentShader: document.getElementById( 'fragmentShaderInv' ).textContent,
                  uniforms: {
                    planetTexture: {
                      value: texture,
                    }
                  } } ) :
                new THREE.MeshStandardMaterial({
                  map: texture,
                  displacementMap: displacementMap,
                  displacementScale: 8100,
                  displacementBias: dParamWithUnits['displacementBias'].value,
                  transparent: (dParamWithUnits['earthTextureOpacity'].value!==1) ? true : false,
                  opacity: dParamWithUnits['earthTextureOpacity'].value,
                  wireframe: false
                })
              //displacementMap: new THREE.TextureLoader().load( './textures/HighRes/EARTH_DISPLACE_42K_16BITS_preview.jpg' ),
              //displacementScale: 500000,
            )
            planetMesh.name = 'planet'
            planetMesh.rotation.y = -Math.PI/2  // This is needed to have the planet's texture align with the planet's Longintitude system
            planetMesh.matrixValid = false
            if (dParamWithUnits['perfOptimizedThreeJS'].value) planetMesh.freeze()
            planetMeshes.add(planetMesh)
          }
        }
      }
      // else if (TextureModeOpenLayers) {
      //   const planetMesh = new THREE.Mesh(
      //     new THREE.SphereGeometry(radiusOfPlanet, planetWidthSegments, planetHeightSegments),
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
      //   makePlanetTexture(planetMesh, orbitControls, camera, radiusOfPlanet, false, (planetTexture) => {
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
            //if ((j==0) && ((i==0) || (i==3))) {
            if ((j==0) && (i==0)) {
              letter = String.fromCharCode(65+i)
              filename = `./textures/world.topo.200404.3x21600x21600.${letter}${j+1}.jpg`
              //filename = `./textures/world.topo.200404.3x16384x16384.${letter}${j+1}.jpg`
              if (verbose) console.log(letter, filename)
              const planetMesh = new THREE.Mesh(
                new THREE.SphereGeometry(radiusOfPlanet, planetWidthSegments, planetHeightSegments, i*Math.PI/2, Math.PI/2, j*Math.PI/2, Math.PI/2),
                new THREE.ShaderMaterial({
                  //vertexShader: vertexShader,
                  //fragmentShader: fragmentShader,
                  vertexShader: document.getElementById( 'vertexShader' ).textContent,
                  fragmentShader: document.getElementById( 'fragmentShader' ).textContent,
                  uniforms: {
                    planetTexture: {
                      //value: new THREE.TextureLoader().load( './textures/bluemarble_16384.png' )
                      value: new THREE.TextureLoader().load(filename),
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
              if (guidParam['perfOptimizedThreeJS']) planetMesh.freeze()
              planetMeshes.add(planetMesh)
            }
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
        texture.generateMipmaps = generateMipmaps
        const planetMesh = new THREE.Mesh(
          new THREE.SphereGeometry(radiusOfPlanet, planetWidthSegments, planetHeightSegments),
          // new THREE.MeshPhongMaterial({
          //   //roughness: 1,
          //   //metalness: 0,
          //   map: new THREE.TextureLoader().load( './textures/bluemarble_4096.jpg' ),
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
        if (guidParam['perfOptimizedThreeJS']) planetMesh.freeze()
        planetMeshes.add(planetMesh)
      }
      else {
        console.log("Basic Texture")
        const texture = new THREE.TextureLoader().load( './textures/bluemarble_4096.jpg')
        const displacementMap = new THREE.TextureLoader().load( './textures/EARTH_DISPLACE_42K_16BITS_preview.jpg' )
        //const displacementMap = new THREE.TextureLoader().load( './textures/DisplacementMaps/EARTH_DISPLACE_16BITS.png' )
        //const displacementMap = new THREE.TextureLoader().load( './textures/DisplacementMaps/Earth_Disp/Earth_Disp_1032.jpg' )
        //const texture = new THREE.TextureLoader().load( './textures/venus1280x720.jpg' ),
        //const texture = new THREE.TextureLoader().load( './textures/bluemarble_16384.png' ),
        //const texture = new THREE.TextureLoader().load( './textures/earthmap1k.jpg' ),
        texture.generateMipmaps = generateMipmaps
        const planetMesh = new THREE.Mesh(
          new THREE.SphereGeometry(radiusOfPlanet, planetWidthSegments, planetHeightSegments),
          new THREE.MeshPhongMaterial({
            //roughness: 1,
            //metalness: 0,
            map: texture,
            //bumpMap: new THREE.TextureLoader().load( './textures/earthbump.jpg' ),
            //bumpScale: 1000000,
            displacementMap: displacementMap,
            displacementScale: 30000,
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
        if (guidParam['perfOptimizedThreeJS']) planetMesh.freeze()
        planetMeshes.add(planetMesh)  
      }
    }
    //planetMesh.castShadow = true

    const atmosphereMesh = new THREE.Mesh(
      new THREE.SphereGeometry(radiusOfPlanet, planetWidthSegments/16, planetHeightSegments/16),
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

    return [planetMeshes, atmosphereMesh]

    // const water = new Water(
    //   new THREE.SphereGeometry(radiusOfPlanet, planetWidthSegments/16, planetHeightSegments/16),
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
    //   new THREE.MeshStandardMaterial(
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

    // const earth2Geometry = new THREE.SphereGeometry(radiusOfPlanet, planetWidthSegments, planetHeightSegments, 0, Math.PI/2, 0, Math.PI/2)
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