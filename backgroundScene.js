import * as THREE from 'three'

export class backgroundScene {
  constructor (width, height, backgroundTexture) {
    this.preserveVisibility = [] // Array to store the visibility of the objects

    if (backgroundTexture) {
      this.scene = new THREE.Scene()
      this.camera = new THREE.OrthographicCamera( - width / 2, width / 2, height / 2, - height / 2, 1, 100 );
      this.camera.position.z = 10
      this.scene.add(this.camera)
      // const backgroundTextureLo  ader = new THREE.TextureLoader()
      // const backgroundTexture = backgroundTextureLoader.load('./textures/googleEarthImages/NewZealandLaunchSite_000.jpeg')
      // Hack for Olymus Mons
      // backgroundMaterial = new THREE.MeshBasicMaterial( { map: backgroundTexture[0] } )
      this.backgroundMaterial = new THREE.MeshBasicMaterial( { map: backgroundTexture } )
      // const backgroundWidth = this.backgroundMaterial.map.image.width
      // const backgroundHeight = this.backgroundMaterial.map.image.height
      const backgroundWidth = backgroundTexture.source.data.naturalWidth
      const backgroundHeight = backgroundTexture.source.data.naturalHeight
      this.sprite = new THREE.Sprite( this.backgroundMaterial )
      this.sprite.center.set( 0.5, 0.5 )
      this.sprite.scale.set( backgroundWidth, backgroundHeight, 1 )
      this.scene.add( this.sprite )
    }
  }

  hidePlanet(objectList) {

    this.preserveVisibility = [] // Array to store the visibility of the objects
    objectList.forEach((object) => {
      if (object) {
        object.traverse((child) => {
          this.preserveVisibility.push({object: child, visible: child.visible}) // Preserve the visibility
          object.visible = false // Hide the object
        })
      }
    })

  }

  restorePlanet(objectList) {

    objectList.forEach((object) => {
      if (object) {
        object.traverse((child) => {
          object.visible = this.preserveVisibility.find((element) => element.object === object).visible // Restore the visibility
          // ToDo: Haven't handled the error conditin where the object is not found
        })
      }
    })
    this.preserveVisibility.splice(0, this.preserveVisibility.length) // Clear the array

  }

  remove() {
    if (this.scene) {
      if (this.camera) this.scene.remove(this.camera)
      if (this.sprite) this.scene.remove(this.sprite)
      this.camera = null
      this.sprite = null
      this.scene = null
    }
  }
}