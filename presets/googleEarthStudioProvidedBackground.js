
export function googleEarthStudioProvidedBackground(guidParamWithUnits, nonGUIParams) {
  guidParamWithUnits['controlCameraFromJsonDuringCapture'].value = true
  guidParamWithUnits['maxBackgroundVideoFrames'].value = 444
  //guidParamWithUnits['jsonFileCameraControlHelper'].value = true // Let's the user navigate around the scene and displays a camera control helper to show what the camera will be looking at.
  guidParamWithUnits['earthTextureOpacity'].value = 0.25
  nonGUIParams['setResolutionFromBackgroundVideo'] = true

}

