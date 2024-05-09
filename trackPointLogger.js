import * as tram from './tram.js'

export class trackPointLogger {

  constructor() {
    // Time interval between captures
  }

  start(googleEarthStudioProjectFile) {

    // Code that "hooks" the current time and initializes the frame count for capture.
    //_startTime = window.Date.now();

    //_frameCount / _settings.framerate;

    // This method will needs to initialize the model's time the same way that the CCApture class does (see CCapture.js:function _updateTime() ).

    // Search googleEarthStudioProjectFile for the scenes element and check that it contais only one scene
    // Search that scene's attributes for the element with the type: "cameraGroup"
    // Search that element's attributes for an element with the type: "cameraPositionGroup"
    // Search that element's attributes for an element with the type: "position"
    // Search that element's attributes for an element with the type: "longtitude" (or latitude, or altitude)
    // Search that element's attributes for an element with the type: "keyframes"
    // Search that element's attributes for an element with the type: "value"
    // Search that element's attributes for elements with the type: "minValueRange" and "maxValueRange" (currently 1 and 65117481)
    // Save these values to... 
    this.googleEarthStudioProjectFile = googleEarthStudioProjectFile  // Do we need to make a copy?
    this.minAltValue = 1
    this.maxAltValue = 65117481
  }

  capture(cameraPosition, cameraUp, orbitControlsTarget, orbitControlsUpDirection) {
    // Convert the coordinates to lat, lon, and altitude. Lat and lon are in radians and altitude is in meters.
    const LLACoords = {}
    LLACoords["cameraPosition"] = tram.xyz2lla(cameraPosition.x, cameraPosition.y, cameraPosition.z);
    LLACoords["cameraUp"] = tram.xyz2lla(cameraUp.x, cameraUp.y, cameraUp.z);
    LLACoords["orbitControlsTarget"] = tram.xyz2lla(orbitControlsTarget.x, orbitControlsTarget.y, orbitControlsTarget.z);
    LLACoords["orbitControlsUpDirection"] = tram.xyz2lla(orbitControlsUpDirection.x, orbitControlsUpDirection.y, orbitControlsUpDirection.z);

    Object.entries(LLACoords).forEach(entry => {
      entry.lat = (entry.lat + 180)/360
      entry.lon = (entry.lon + 90)/180
      entry.alt = (entry.alt - this.minAltValue) / (this.maxAltValue - this.minAltValue)
    });

    // Clues to conversion found here: https://www.reddit.com/r/GoogleMaps/comments/ydhdze/reverseengineering_esp_file_with_coordinates/
    // (lat, long) = [ 180 * (ESP_LAT - 0.5) ] , [ 360 * (ESP_LONG - 0.5) ]
    // Checking...
    // Hawaii longitude value from esp file is {relative: 0.0577741671258399}
    // Hawaii latitude value from esp file is {relative: 0.6041664587831533}

    // Longitude formula
    // 0.0577741671258399 * 360 - 180 = -159.201299834697636 degrees (155.6659° W according to Google - which is ok since the launcher starts west of the island)

    // Latitude formula
    // 0.6041664587831533 * 180 - 90 = 18.749962580967594 degrees (19.5429° N according to Google)

    // Every 'N' frames, we should save cameraPosition and orbitControlsTarget relative values into the keyframes elements' value->relative elements
    // I don't think we'll need the cameraUp and orbitControlsUpDirection values, but I computed them anyway just in case.

  }

  stop() {
    
  }

  save() {
    // Output the modified googleEarthStudioProjectFile to a new file
  }

}