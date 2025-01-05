

export function googleEarthStudioESPModifier(googleEarthProjectFile, cameraPositions) {
  function updateKeyframes(attribute, cameraPositions, valueTransform, inverseTransform) {
    // console.log(attribute.type, attribute.keyframes);
  
    // Log existing keyframes with inverse transform to restore original values
    // attribute.keyframes.forEach((keyframe) => {
    //   console.log(keyframe.time, inverseTransform(keyframe.value));
    // });
  
    // Clear existing keyframes and populate new ones
    attribute.keyframes = cameraPositions.map((cameraPosition) => ({
      time: cameraPosition.time,
      value: valueTransform(cameraPosition)
      // transitionIn: {x: -0.011405431682737088, y: 0, type: 'auto'},  // These create a jerky effect
      // transitionOut: {x: 0.011552184321784505, y: 0, type: 'auto'}
    }));
  }
  
  googleEarthProjectFile.scenes[0].attributes
    .filter((attribute) => attribute.type === "cameraGroup")
    .forEach((cameraGroup) => {
      cameraGroup.attributes
        .filter((attribute) => attribute.type === "cameraPositionGroup")
        .forEach((cameraPositionGroup) => {
          cameraPositionGroup.attributes
            .filter((attribute) => attribute.type === "position")
            .forEach((positionAttribute) => {
              console.log(positionAttribute.type, positionAttribute.attributes);
  
              positionAttribute.attributes.forEach((attribute) => {
                switch (attribute.type) {
                  case "longitude":
                    updateKeyframes(
                      attribute,
                      cameraPositions,
                      (cameraPosition) => (cameraPosition.longitude + 180) / 360, // Transform
                      (value) => -180 + value * 360 // Inverse Transform
                    );
                    break;
                  case "latitude":
                    updateKeyframes(
                      attribute,
                      cameraPositions,
                      (cameraPosition) => (cameraPosition.latitude + 90) / 180, // Transform
                      (value) => -90 + value * 180 // Inverse Transform
                    );
                    break;
                  case "altitude":
                    // Overwrite the min and max values since Google Earth Studio doesn't seem to support negative altitudes
                    const min = attribute.value.minValueRange;
                    const max = attribute.value.maxValueRange;
                    console.log(min, max);
                    updateKeyframes(
                      attribute,
                      cameraPositions,
                      (cameraPosition) => (cameraPosition.altitude - min) / (max - min), // Transform
                      (value) => min + value * (max - min) // Inverse Transform
                    );
                    break;
                }
              });
            });
        });
    });
    
}

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
