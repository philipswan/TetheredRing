import * as tram from './tram.js'
import { googleEarthStudioESPModifier } from './googleEarthStudioTools.js'

export class trackPointLogger {

  constructor(googleEarthStudioProjectFile) {
    this.googleEarthStudioProjectFile = googleEarthStudioProjectFile  // Do we need to make a copy?
  }

  start(timeSinceStart) {
    this.cameraControlData = []
    this.startOfLogging = timeSinceStart
    this.nextCaptureTime = timeSinceStart
    this.captureInterval = .25  // Capture every second
    this.stopRequested = false
    this.active = true
  }

  capture(timeSinceStart, cameraPosition, cameraUp, orbitControlsTarget, orbitControlsUpDirection, planetSpec) {
    // Convert the coordinates to lat, lon, and altitude. Lat and lon are in radians and altitude is in meters.
    if (this.active && (timeSinceStart>=this.nextCaptureTime)) {
      const LLACoords = {}
      LLACoords["time"] = timeSinceStart
      LLACoords["cameraPosition"] = tram.ecefToGeodetic(cameraPosition.x, cameraPosition.y, cameraPosition.z, planetSpec.ellipsoid);
      LLACoords["cameraUp"] = tram.ecefToGeodetic(cameraUp.x, cameraUp.y, cameraUp.z, planetSpec.ellipsoid);
      LLACoords["orbitControlsTarget"] = tram.ecefToGeodetic(orbitControlsTarget.x, orbitControlsTarget.y, orbitControlsTarget.z, planetSpec.ellipsoid);
      LLACoords["orbitControlsUpDirection"] = tram.ecefToGeodetic(orbitControlsUpDirection.x, orbitControlsUpDirection.y, orbitControlsUpDirection.z, planetSpec.ellipsoid);

      this.cameraControlData.push(LLACoords)
      this.nextCaptureTime += this.captureInterval
      if (this.stopRequested) {
        this.endOfLogging = timeSinceStart
        this.save()
        this.active = false
      }
    }

  }

  stop(timeSinceStart) {
    this.stopRequested = true
  }

  save() {
    // Download the modified googleEarthProjectFile to the downloads folder
    const cameraControlData = []
    this.cameraControlData.forEach((cameraControl) => {
      cameraControlData.push({
        time: (cameraControl['time']-this.startOfLogging)/(this.endOfLogging-this.startOfLogging),
        longitude: cameraControl['cameraPosition'].lon,
        latitude: cameraControl['cameraPosition'].lat,
        altitude: cameraControl['cameraPosition'].alt
      })
    })
    googleEarthStudioESPModifier(this.googleEarthStudioProjectFile, cameraControlData)
    const a = document.createElement("a")
    a.href = URL.createObjectURL(new Blob([JSON.stringify(this.googleEarthStudioProjectFile)], {type: 'application/json'}))
    a.download = 'googleEarthStudioProjectFile.json'
    a.click()
  }

}