// Every user-tunable parameter of the simulation, as plain data.
//
// Each entry: { value, units, autoMap, min, max, step?, tweenable?, options?, folder, onChange }
//   value     initial value (presets may override it before the GUI is built)
//   units     SI unit label shown in specs exports
//   autoMap   copy straight into the derived parameters (dParamWithUnits) used by subsystems
//   folder    GUI folder the control appears in
//   onChange  name of the App handler to run when the value changes (see App.parameterHandlers)
//   options   for dropdowns: { label: value }
//
// Angles are in degrees here; ParameterStore.derive() converts the ones subsystems need in radians.

import cameraPresets from '../data/cameraPresets.json' with { type: 'json' }
// The grappler-sequencing algorithms are owned by the launcher module that implements them; re-exported
// so presets can refer to them (e.g. grapplerSequencingModes.Original).
import { grapplerSequencingModes } from '../launcher/grapplerPlacement.js'
export { grapplerSequencingModes }

const radiusOfEarth = 6378100 // m
// 32800 km is the largest circumference a circular ring can have and still fit within the Pacific Ocean.
export const targetRingRadius = 32800000 / Math.PI / 2
export const equivalentLatitudePreset = Math.acos(targetRingRadius / (radiusOfEarth + 32000)) * 180 / Math.PI

const defaultShows = true
const massDriverShows = true

export const tetherFibers = { Custom: 'CUSTOM', CarbonFiber: 'CARBON_FIBER', Graphene: 'GRAPHENE' }
export const coilConductorMaterials = { Aluminum: 'ALUMINUM', Copper: 'COPPER', Custom: 'CUSTOM' }

export function createParameterDefinitions() {
  return {
  planetName: {value: 'Earth', units: '', autoMap: true, onChange: 'adjustRingDesign', folder: 'Geography'},
  equivalentLatitude: {value: equivalentLatitudePreset, units: "degrees", autoMap: false, min: 0, max: 89.9999, onChange: 'adjustRingDesign', folder: 'Geography'},
  buildLocationRingCenterLatitude: {value: -19.2, units: "degrees", autoMap: true, min: -90, max: 90, onChange: 'adjustRingLatLon', folder: 'Geography'},
  buildLocationRingCenterLongitude: {value: 213.7, units: "degrees", autoMap: true, min: 0, max: 360, onChange: 'adjustRingLatLon', folder: 'Geography'},
  finalLocationRingCenterLatitude: {value: 14.33, units: "degrees", autoMap: true, min: -90, max: 90, onChange: 'adjustRingLatLon', folder: 'Geography'},
  finalLocationRingCenterLongitude: {value: 186.26, units: "degrees", autoMap: true, min: 0, max: 360, onChange: 'adjustRingLatLon', folder: 'Geography'},
  moveRingFactor: {value: 1, units: "", autoMap: true, min: 0, max: 1, tweenable: true, onChange: 'adjustRingLatLon', folder: 'Geography'},

  buildLocationRingCenterLatitude2: {value: 14.3, units: "degrees", autoMap: true, min: -90, max: 90, onChange: 'adjustRingLatLon2', folder: 'Geography'},
  buildLocationRingCenterLongitude2: {value: 186.3, units: "degrees", autoMap: true, min: 0, max: 360, onChange: 'adjustRingLatLon2', folder: 'Geography'},
  finalLocationRingCenterLatitude2: {value: 20.7, units: "degrees", autoMap: true, min: -90, max: 90, onChange: 'adjustRingLatLon2', folder: 'Geography'},
  finalLocationRingCenterLongitude2: {value: 303.12, units: "degrees", autoMap: true, min: 0, max: 360, onChange: 'adjustRingLatLon2', folder: 'Geography'},
  moveRingFactor2: {value: 1, units: "", autoMap: true, min: 0, max: 1, tweenable: true, onChange: 'adjustRingLatLon2', folder: 'Geography'},

  // Build location (assumes equivalentLatitude = 35)
  buildLocationRingEccentricity: {value: 1, units: "", autoMap: false, min: 0.97, max: 1.03, step: 0.001, onChange: 'adjustRingDesign', folder: 'Geography'},
  finalLocationRingEccentricity: {value: 1, units: "", autoMap: false, min: 0.97, max: 1.03, step: 0.001, onChange: 'adjustRingDesign', folder: 'Geography'},
  // ToDo: moveRingFactor needs to call adjustRingDesign when buildLocationRingEccentricity differs from finalLocationRingEccentricity
  locationPresetIndex: {value: 2, units: "", autoMap: true, min: 0, max: 6, step: 1, tweenable: false, onChange: 'setRingLatLonWithPreset', folder: 'Geography'},
  displacementMapOverride: {value: false, units: "", autoMap: true, folder: 'Geography'},
  terrainExaggeration: {value: 1, units: '', autoMap: true, min: 0, max: 20, onChange: 'adjustTerrainExaggeration', folder: 'Geography'},

  // Physical Constants
  transitSystemForwardOffset: {value: 0.816, units: 'm', autoMap: true, min: -1, max: 1, onChange: 'updateTransitsystem', folder: 'Engineering'},
  transitVehicleForwardOffset: {value: 2.0, units: 'm', autoMap: true, min: 1, max: 3, onChange: 'updateTransitsystem', folder: 'Engineering'},

  permeabilityOfFreeSpace: {value: 4*Math.PI*1e-7, units: "N/A2", autoMap: true, min: 0, max: 0.0001, onChange: 'adjustRingDesign', folder: 'Engineering'},
  launchSledElectromagnetCoreDensity: {value: 7800, units: "kg/m3", autoMap: true, min: 1000, max: 20000, onChange: 'adjustRingDesign', folder: 'Engineering'},
  stefanBoltzmannConstant: {value: 5.670374419e-8, units: "W/m2/K4", autoMap: true, min: 0, max: 1e-6, onChange: 'adjustRingDesign', folder: 'Engineering'},

  // Engineering Parameters - Ring
  ringFinalAltitude: {value: 32000, units: "m", autoMap: true, min: 0, max: 200000, onChange: 'adjustRingDesign', folder: 'Engineering'},
  ringAmountRaisedFactor: {value: 1, units: "", autoMap: true, min: 0, max: 5, tweenable: true, onChange: 'adjustRingDesign', folder: 'Engineering'},
  //movingRingsRotationalPeriod: {value: 1800, units: "s", autoMap: true, min: 0, max: 3600, onChange: 'adjustRingDesign', folder: 'Engineering'},
  movingRingsMassPortion: {value: 0.382, units: "", autoMap: true, min: 0, max: 1, onChange: 'adjustRingDesign', folder: 'Engineering'},
  numControlPoints: {value: 256, units: '', autoMap: true, min: 4, max: 1024, step: 1, onChange: 'adjustRingDesign', folder: 'Engineering'},
  totalMassPerMeterOfRings: {value: 100, units: "kg", autoMap: true, min: 1, max: 1000, onChange: 'adjustRingDesign', folder: 'Engineering'},
  statorMassPerUnitOfLoad: {value: 0.02, units: "kg/N", autoMap: true, min: 0, max: 1, onChange: 'adjustRingDesign', folder: 'Engineering'},
  relativePermeabilityOfCore: {value: 8000, units: "", autoMap: true, min: 0, max: 100000, onChange: 'adjustRingDesign', folder: 'Engineering'},
  ringMaglevFieldLoopLength: {value: 0.1, units: "m", autoMap: true, min: 0, max: 1, onChange: 'adjustRingDesign', folder: 'Engineering'},
  ringMaglevCoreCrossSectionLength: {value: 0.02, units: "m", autoMap: true, min: 0, max: 1, onChange: 'adjustRingDesign', folder: 'Engineering'},
  ringMaglevCoreCrossSectionWidth: {value: 0.02, units: "m", autoMap: true, min: 0, max: 1, onChange: 'adjustRingDesign', folder: 'Engineering'},
  ringMaglevAirGap: {value: 0.0005, units: "m", autoMap: true, min: 0, max: 0.01, onChange: 'adjustRingDesign', folder: 'Engineering'},
  ringMaglevCoilsNumLoops: {value: 100, units: "", autoMap: true, min: 0, max: 1000, onChange: 'adjustRingDesign', folder: 'Engineering'},
  wireRadius: {value: 0.0013, units: "", autoMap: true, min: 0, max: 0.01, onChange: 'adjustRingDesign', folder: 'Engineering'},
  portionOfCoreOnStationaryRing: {value: 0.7, units: "", autoMap: true, min: 0, max: 1, onChange: 'adjustRingDesign', folder: 'Engineering'},

  // Engineering Parameters - Tethers
  numTethers: {value: 3600, units: "", autoMap: true, min: 4, max: 7200, step: 2, onChange: 'adjustRingDesign', folder: 'Engineering'},
  numForkLevels: {value: 7, units: "", autoMap: true, min: 0, max: 10, step: 1, onChange: 'adjustRingDesign', folder: 'Engineering'},       // The number of times the we want to fork the tethers (i.e. num time you will encounter a fork when traveling from base to a single attachment point)
  whenToForkVertically: {value: 2, units: "", autoMap: true, min: 0, max: 10, step: 1, onChange: 'adjustRingDesign', folder: 'Engineering'},       // The number of times the we want to fork the tethers (i.e. num time you will encounter a fork when traveling from base to a single attachment point)
  tetherSpanOverlapFactor: {value: 2, units: "%", autoMap: true, min: 0.5, max: 4, tweenable: true, onChange: 'adjustRingDesign', folder: 'Engineering'},
  tetherPointBxAvePercent: {value: 50, units: "%", autoMap: true, min: 0, max: 100, tweenable: true, onChange: 'adjustRingDesign', folder: 'Engineering'},
  tetherPointBxDeltaPercent: {value: 40, units: "%", autoMap: true, min: 0, max: 50, tweenable: true, onChange: 'adjustRingDesign', folder: 'Engineering'},
  tetherEngineeringFactor: {value: 2.0, units: "", autoMap: true, min: 0.1, max: 10, tweenable: true, onChange: 'adjustRingDesign', folder: 'Engineering'},
  defaultcapitalCostPerKgSupported: {value: 100.0, units: "USD/kg", autoMap: true, min: 1, max: 1000, tweenable: true, onChange: 'adjustRingDesign', folder: 'Engineering'},

  // Engineering Parameters - Stationary Rings
  transitSystemNumZones: {value: 1024, units: "", autoMap: true, min: 1, max: 7, step: 1, onChange: 'updateTransitsystem', folder: 'Engineering'},
  numMainRings: {value: 5, units: "", autoMap: true, min: 1, max: 7, step: 1, onChange: 'adjustRingDesign', folder: 'Engineering'},

  mainRingTubeRadius: {value: 0.5, units: "m", autoMap: true, min: .1, max: 5, onChange: 'updateTransitsystem', folder: 'Engineering'}, // ToDo - Retire this parameter

  mainRingSpacing: {value: 10, units: "m", autoMap: true, min: 0, max: 30, onChange: 'updateTransitsystem', folder: 'Engineering'},

  mainRingUpwardOffset: {value: 0, units: "m", autoMap: true, min: -100, max: 100, step: 0.001, onChange: 'updateTransitsystem', folder: 'Engineering'},
  mainRingOutwardOffset: {value: 0, units: 'm', autoMap: true, min: -10, max: 10, step: 0.001, onChange: 'updateTransitsystem', folder: 'Engineering'},
  stationaryRingTubeRadius: {value: 0.25, units: 'm', autoMap: true, min: 0.1, max: 20, onChange: 'updateTransitsystem', folder: 'Engineering'},
  movingRingHeight: {value: 0.3, units: 'm', autoMap: true, min: 0.01, max: 20, onChange: 'updateTransitsystem', folder: 'Engineering'},
  movingRingThickness: {value: 0.05, units: 'm', autoMap: true, min: 0.01, max: 20, onChange: 'updateTransitsystem', folder: 'Engineering'},
  movingRingTubeRadius: {value: 0.4, units: 'm', autoMap: true, min: 0.1, max: 20, onChange: 'updateTransitsystem', folder: 'Engineering'},
  // ToDo: These are really a function of numMainRings. Should calculate them rather than specifying them.
  stationaryRingNumModels: {value: 512, units: "", autoMap: true, min: 0, max: 3600, step: 1, onChange: 'updateTransitsystem', folder: 'Engineering'},

  // Engineering Parameters - Moving Ring and Stationary Rings
  movingRingNumModels: {value: 512, units: "", autoMap: true, min: 0, max: 3600, step: 1, onChange: 'updateTransitsystem', folder: 'Engineering'},
  numVirtualStationaryRingSegments: {value: 40000, units: "", autoMap: true, min: 0, max: 400000, step: 1, onChange: 'updateTransitsystem', folder: 'Engineering'},
  numVirtualMovingRingSegments: {value: 400000, units: "", autoMap: true, min: 0, max: 400000, step: 1, onChange: 'updateTransitsystem', folder: 'Engineering'},
  movingRingsAverageDensity: {value: 8000, units: 'kg/m3', autoMap: true, min: 0, max: 4000, onChange: 'updateTransitsystem', folder: 'Engineering'},

  statorMagnetHeight: {value: 0.3, units: 'm', autoMap: true, min: 0.1, max: 20, onChange: 'updateTransitsystem', folder: 'Engineering'},
  statorMagnetThickness: {value: 0.05, units: 'm', autoMap: true, min: 0.1, max: 20, onChange: 'updateTransitsystem', folder: 'Engineering'},
  statorMagnetAirGap: {value: 0.001, units: 'm', autoMap: true, min: 0.1, max: 20, onChange: 'updateTransitsystem', folder: 'Engineering'},
  statorMagnetNumModels: {value: 512, units: "", autoMap: true, min: 0, max: 3600, step: 1, onChange: 'updateTransitsystem', folder: 'Engineering'},
  numVirtualStatorMagnetSegments: {value: 400000, units: "", autoMap: true, min: 0, max: 400000, step: 1, onChange: 'updateTransitsystem', folder: 'Engineering'},
  
  // Engineering Parameters - Transit System
  transitTubeTubeRadius: {value: 6, units: 'm', autoMap: true, min: 1, max: 20, onChange: 'updateTransitsystem', folder: 'Engineering'},
  transitTubeTubeWallThickness: {value: 0.001, units: 'm', autoMap: true, min: 0, max: 1, onChange: 'updateTransitsystem', folder: 'Engineering'},
  transitTubeUpwardOffset: {value: -100, units: "m", autoMap: true, min: -200, max: 0, step: 0.001, onChange: 'updateTransitsystem', folder: 'Engineering'},
  transitTubeOutwardOffset: {value: -15, units: 'm', autoMap: true, min: -11, max: -9, step: 0.001, onChange: 'updateTransitsystem', folder: 'Engineering'},
  transitTubeNumModels: {value:256, units: "", autoMap: true, min: 0, max: 3600, step: 1, onChange: 'updateTransitsystem', folder: 'Engineering'},

  transitTrackWidth: {value: .3, units: 'm', autoMap: true, min: 0, max: 2, onChange: 'updateTransitsystem', folder: 'Engineering'},
  transitTrackHeight: {value: .1, units: 'm', autoMap: true, min: 0, max: 2, onChange: 'updateTransitsystem', folder: 'Engineering'},
  transitTrackNumModels: {value:256, units: "", autoMap: true, min: 0, max: 3600, step: 1, onChange: 'updateTransitsystem', folder: 'Engineering'},
  transitTrackUpwardOffset: {value: 2.38125, units: "m", autoMap: true, min: -200, max: 0, step: 0.001, onChange: 'updateTransitsystem', folder: 'Engineering'},
  transitTrackOutwardOffset: {value: 0, units: 'm', autoMap: true, min: -10, max: 10, step: 0.001, onChange: 'updateTransitsystem', folder: 'Engineering'},
  transitTrackUpwardSpacing: {value: 4.8125, units: "m", autoMap: true, min: -200, max: 0, step: 0.001, onChange: 'updateTransitsystem', folder: 'Engineering'},
  transitTrackOutwardSpacing: {value: 4.575, units: 'm', autoMap: true, min: 0, max: 20, step: 0.001, onChange: 'updateTransitsystem', folder: 'Engineering'},
  transitTracksNumUpwardTracks: {value: 2, units: '', autoMap: true, min: 1, max: 4, onChange: 'updateTransitsystem', folder: 'Engineering'},
  transitTracksNumOutwardTracks: {value: 2, units: '', autoMap: true, min: 1, max: 4, onChange: 'updateTransitsystem', folder: 'Engineering'},

  transitTrackOuterOffset: {value: 2.2875, units: "m", autoMap: true, min: 1.5, max: 2.5, step: 0.001, onChange: 'updateTransitsystem', folder: 'Engineering'},
  transitTrackUpperOffset1: {value: 4.7875, units: "m", autoMap: true, min: 2.5, max: 3.5, step: 0.001, onChange: 'updateTransitsystem', folder: 'Engineering'},
  transitTrackUpperOffset2: {value: -0.025, units: "m", autoMap: true, min: -1.0, max: -0.5, step: 0.001, onChange: 'updateTransitsystem', folder: 'Engineering'},
  // ToDo - Need 4 sliders for adjusting the track vertical and horizontal spacing and offsets
  ringTerminusOutwardOffset: {value: -9.75, units: 'm', autoMap: true, min: -10, max: -5, onChange: 'updateTransitsystem', folder: 'Engineering'},
  ringTerminusUpwardOffset: {value: -3.8, units: 'm', autoMap: true, min: -5, max: -3, onChange: 'updateTransitsystem', folder: 'Engineering'},
  ringTerminusCost: {value: 10000000, units: 'USD', autoMap: true, min: 0, max: 10000000, onChange: 'updateTransitsystem', folder: 'Engineering'},
  groundTerminusCost: {value: 20000000, units: 'USD', autoMap: true, min: 0, max: 10000000, onChange: 'updateTransitsystem', folder: 'Engineering'},
  groundTerminusOutwardOffset: {value: -9.75, units: 'm', autoMap: true, min: -200, max: 200, onChange: 'updateTransitsystem', folder: 'Engineering'},
  groundTerminusUpwardOffset: {value: 150, units: 'm', autoMap: true, min: -200, max: 200, onChange: 'updateTransitsystem', folder: 'Engineering'},
  
  transitVehicleUpwardOffset: {value: 1.1, units: 'm', autoMap: true, min: -1, max: 2, onChange: 'updateTransitsystem', folder: 'Engineering'},
  transitVehicleCruisingSpeed: {value: 500, units: 'm/s', autoMap: true, min: 0, max: 2000, onChange: 'updateTransitsystem', folder: 'Engineering'},
  transitVehicleMaxAcceleration: {value: 10, units: 'm/s2', autoMap: true, min: 0, max: 50, onChange: 'updateTransitsystem', folder: 'Engineering'},
  transitVehicleMergeTime: {value: 1, units: 's', autoMap: true, min: 1, max: 30, onChange: 'updateTransitsystem', folder: 'Engineering'},
  transitVehicleStopDuration: {value: 30, units: 's', autoMap: true, min: 1, max: 300, onChange: 'updateTransitsystem', folder: 'Engineering'},
  transitVehicleRandomizeStartPositions: {value: true, units: '', autoMap: true, onChange: 'updateTransitsystem', folder: 'Engineering'},

  // ToDo: There are no calculations implemented yet that use the following parameters
  transitVehicleLength: {value: 20, units: 'm', autoMap: true, min: 1, max: 100, onChange: 'updateTransitsystem', folder: 'Engineering'},
  // ToDo - Vehicle Radius doesn't do anything and probably does not match the model
  transitVehicleRadius: {value: 2, units: 'm', autoMap: true, min: 1, max: 10, onChange: 'updateTransitsystem', folder: 'Engineering'},
  transitTubeInteriorPressure: {value: 10, units: 'Pa', autoMap: true, min: .1, max: 1000, onChange: 'updateTransitsystem', folder: 'Engineering'},
  transitTubeInteriorGasMolecularWeight: {value: 29, units: 'kg/kgmole', autoMap: true, min: 1, max: 100, onChange: 'updateTransitsystem', folder: 'Engineering'},
  transitTubeInteriorTemperature: {value: 20, units: 'C', autoMap: true, min: 0, max: 40, onChange: 'updateTransitsystem', folder: 'Engineering'},
  transitSystemEfficiencyAtCruisingSpeed: {value: 0.8, units: '', autoMap: true, min: 0.1, max: 1, onChange: 'updateTransitsystem', folder: 'Engineering'},
  transitVehicleCoefficientOfDrag: {value: 0.25, units: '', autoMap: true, min: .1, max: 1, onChange: 'updateTransitsystem', folder: 'Engineering'},
  //transitSystemMassPerMeter: {value:200, units: "kg", autoMap: true, min: 0, max: 3600, step: 1, onChange: 'adjustRingDesign', folder: 'Engineering'},
  //transitSystemMaterialsCostPerMeter: {value:18000, units: "USD/m", autoMap: true, min: 1, max: 30000, onChange: 'updateTransitsystem', folder: 'Engineering'},  // https://youtu.be/PeYIo91DlWo?t=490
  transitTubeTubeWallMaterialDensity: {value: 930, units: 'kg/m3', autoMap: true, min: 0, max: 4000, onChange: 'updateTransitsystem', folder: 'Engineering'},
  transitTubeTubeWallMaterialCost: {value: 0.75, units: "USD/kg", autoMap: true, min: 0.01, max: 1, onChange: 'updateTransitsystem', folder: 'Engineering'},  // https://www.theplasticsexchange.com//Research/WeeklyReview.aspx

  // dynamicallyManagedObjectNumModels
  dynamicallyManagedObjectNumModels: {value: 256, units: "", autoMap: true, min: 0, max: 3600, step: 1, onChange: 'updateTransitsystem', folder: 'Engineering'},

  // ToDo: these parameters are not properly updated yet
  numVirtualTransitVehicles: {value: 40000, units: '', autoMap: true, min: 0, max: 400000, step: 1, onChange: 'updateTransitsystem', folder: 'Engineering'},
  transitVehicleNumModels: {value: 256, units: '', autoMap: true, min: 0, max: 3600, step: 1, onChange: 'updateTransitsystem', folder: 'Engineering'},
  numVirtualRingTerminuses: {value:1800, units: "", autoMap: true, min: 0, max: 3600, step: 1, onChange: 'updateTransitsystem', folder: 'Engineering'},
  numVirtualGroundTerminuses: {value:1800, units: "", autoMap: true, min: 0, max: 3600, step: 1, onChange: 'updateTransitsystem', folder: 'Engineering'},
  ringTerminusNumModels: {value:32, units: "", autoMap: true, min: 0, max: 3600, step: 1, onChange: 'updateTransitsystem', folder: 'Engineering'},
  groundTerminusNumModels: {value:32, units: "", autoMap: true, min: 0, max: 3600, step: 1, onChange: 'updateTransitsystem', folder: 'Engineering'},

  // Engineering Parameters - Elevators
  numElevatorCables: {value:1800, units: "", autoMap: true, min: 0, max: 3600, step: 1, onChange: 'adjustRingDesign', folder: 'Engineering'},
  numElevatorCableModels: {value:32, units: "", autoMap: true, min: 0, max: 3600, step: 1, onChange: 'adjustRingDesign', folder: 'Engineering'},
  elevatorCableCost: {value: 1000000, units: 'USD', autoMap: true, min: 0, max: 10000000, onChange: 'adjustRingDesign', folder: 'Engineering'},    // ToDo: Need a better estimate for the cost of an elevator cable and its drive system
  numVirtualElevatorCars: {value: 1800, units: "", autoMap: true, min: 0, max: 3600, step: 1, onChange: 'updateTransitsystem', folder: 'Engineering'},
  elevatorCarNumModels: {value: 32, units: "", autoMap: true, min: 0, max: 3600, step: 1, onChange: 'updateTransitsystem', folder: 'Engineering'},
  additionalUpperElevatorCable: {value: 20, units: 'm', autoMap: true, min: 0, max: 50, onChange: 'updateTransitsystem', folder: 'Engineering'},
  // Loaded elevator car; sizes the elevator cables (carbon fibre like the tethers; see ElevatorCable.js).
  elevatorCarMass: {value: 7500, units: 'kg', autoMap: true, min: 100, max: 100000, onChange: 'updateTransitsystem', folder: 'Engineering'},
  elevatorCableOutwardOffset: {value: -24, units: 'm', autoMap: true, min: -30, max: -10, onChange: 'updateTransitsystem', folder: 'Engineering'},
  elevatorCableForwardOffset: {value: -11, units: 'm', autoMap: true, min: -100, max: 0, onChange: 'updateTransitsystem', folder: 'Engineering'},
  elevatorCarUpwardOffset: {value: 0.32, units: 'm', autoMap: true, min: -10, max: 10, onChange: 'updateTransitsystem', folder: 'Engineering'},
  elevatorCarMaxSpeed: {value: 200, units: 'm/s', autoMap: true, min: 0, max: 2000, onChange: 'updateTransitsystem', folder: 'Engineering'},
  elevatorCarMaxAcceleration: {value: 2, units: 'm/s2', autoMap: true, min: 0, max: 50, onChange: 'updateTransitsystem', folder: 'Engineering'},
  elevatorCarCost: {value: 1000000, units: 'USD', autoMap: true, min: 0, max: 10000000, onChange: 'updateTransitsystem', folder: 'Engineering'},  // ToDo: Need a better estimate for the cost of an elevator car

  // Habitats
  numVirtualHabitats: {value: 17100, units: "", autoMap: true, min: 0, max: 100000, step: 1, onChange: 'updateTransitsystem', folder: 'Engineering'},
  habitatNumModels: {value: 256, units: "", autoMap: true, min: 0, max: 3600, step: 1, onChange: 'updateTransitsystem', folder: 'Engineering'},
  habitatUpwardOffset: {value: 3.66, units: 'm', autoMap: true, min: -10, max: 10, onChange: 'updateTransitsystem', folder: 'Engineering'},
  habitatOutwardOffset: {value: 14.32, units: 'm', autoMap: true, min: 0, max: 20, onChange: 'updateTransitsystem', folder: 'Engineering'},
  habitatForwardOffset: {value: 4.16, units: 'm', autoMap: true, min: 0, max: 10, onChange: 'updateTransitsystem', folder: 'Engineering'},
  //habitatBubbleMaterialTensileStress: {value: 7000000, units: 'Pa', autoMap: true, min: 0, max: 100000000, onChange: 'updateTransitsystem', folder: 'Engineering'},
  //habitatBubbleMaterialDensity: {value: 2500, units: 'kg/m3', autoMap: true, min: 0, max: 4000, onChange: 'updateTransitsystem', folder: 'Engineering'},
  // Carbon Fiber
  // habitatBubbleMaterialTensileStress: {value: 7000000000, units: 'Pa', autoMap: true, min: 0, max: 100000000, onChange: 'updateTransitsystem', folder: 'Engineering'},
  // habitatBubbleMaterialDensity: {value: 1790, units: 'kg/m3', autoMap: true, min: 0, max: 4000, onChange: 'updateTransitsystem', folder: 'Engineering'},
  // Alon (Aluminium oxynitride)  Warner, Charles & Hartnett, Thomas & Fisher, Donald & Sunne, Wayne. (2005). Characterization of ALON (TM) optical ceramic. Proceedings of SPIE - The International Society for Optical Engineering. 5786. 10.1117/12.607596. 
  habitatBubbleMaterialTensileStrength: {value: 700, units: 'MPa', autoMap: true, min: 0, max: 100000000, onChange: 'updateTransitsystem', folder: 'Engineering'},
  habitatBubbleMaterialDensity: {value: 3700, units: 'kg/m3', autoMap: true, min: 0, max: 4000, onChange: 'updateTransitsystem', folder: 'Engineering'},
  habitatBubbleMaterialEngineeringFactor: {value: 2, units: '', autoMap: true, min: 0, max: 10, onChange: 'updateTransitsystem', folder: 'Engineering'},
  habitatBubbleMaterialCost: {value: 35, units: 'USD/kg', autoMap: true, min: 0, max: 10, onChange: 'updateTransitsystem', folder: 'Engineering'},   // This is a swag - 5X the glass values from here https://exportv.ru/price-index/laminated-glass
  habitatAirPressure: {value: 100000, units: 'Pa', autoMap: true, min: 0, max: 110000, onChange: 'updateTransitsystem', folder: 'Engineering'},
  idealGasConstant: {value: 8.3145, units: 'Joules/mole/K', autoMap: true, min: 0, max: 10000, onChange: 'updateTransitsystem', folder: 'Engineering'},

  // Solar Arrays
  numVirtualSolarArrays: {value: 100000, units: "", autoMap: true, min: 0, max: 1000000, step: 1, onChange: 'adjustRingDesign', folder: 'Engineering'},
  solarArrayNumModels: {value: 2560, units: "", autoMap: true, min: 0, max: 3600, step: 1, onChange: 'adjustRingDesign', folder: 'Engineering'},
  solarArrayWidth: {value: 15, units: "m", autoMap: true, min: 0, max: 100, step: 1, onChange: 'adjustRingDesign', folder: 'Engineering'},
  solarArrayHeight: {value: 10, units: "m", autoMap: true, min: 0, max: 100, step: 1, onChange: 'adjustRingDesign', folder: 'Engineering'},
  solarArrayOutwardOffset: {value: -60, units: "m", autoMap: true, min: -100, max: 100, step: 1, onChange: 'adjustRingDesign', folder: 'Engineering'},
  solarArrayUpwardOffset: {value: -50, units: "m", autoMap: true, min: -100, max: 100, step: 1, onChange: 'adjustRingDesign', folder: 'Engineering'},
  
  // Engineering Parameters - Launch System - Performance
  evacuatedTubeEntrancePositionAroundRing: {value: 0.76081, units: "", autoMap: true, min: 0, max: 1, onChange: 'updateLauncher', folder: 'Launcher'},
  launcherMassDriverForwardAcceleration: {value: 50, units: 'm*s-2', autoMap: true, min: 1, max: 1000, onChange: 'updateLauncher', folder: 'Launcher'},
  launcherRampUpwardAcceleration: {value: 50, units: 'm*s-2', autoMap: true, min: 10, max: 1000, onChange: 'updateLauncher', folder: 'Launcher'},
  launcherMaxEyesInAcceleration: {value: 50, units: 'm*s-2', autoMap: true, min: 10, max: 1000, onChange: 'updateLauncher', folder: 'Launcher'},
  launcherMaxEyesOutAcceleration: {value: 50, units: 'm*s-2', autoMap: true, min: 10, max: 1000, onChange: 'updateLauncher', folder: 'Launcher'},
  launcherRampTurningRadius: {value: 5000, units: 'm', autoMap: true, min: 10, max: 1000000, onChange: 'updateLauncher', folder: 'Launcher'},
  launcherRampDesignMode: {value: 0, units: '', autoMap: true, min: 0, max: 1, onChange: 'updateLauncher', folder: 'Launcher'},
  launcherLocationMode: {value: 0, units: '', autoMap: true, min: 0, max: 1, onChange: 'updateLauncher', folder: 'Launcher'},
  launcherRampEndLatitude: {value: 25.9967, units: 'degrees', autoMap: true, min: -90, max: 90, onChange: 'updateLauncher', folder: 'Launcher'},
  launcherRampEndLongitude: {value: 97.1549, units: 'degrees', autoMap: true, min: -360, max: 360, onChange: 'updateLauncher', folder: 'Launcher'},
  launcherSledDownwardAcceleration: {value: 150, units: 'm*s-2', autoMap: true, min: 0, max: 1000, onChange: 'updateLauncher', folder: 'Launcher'},
  launcherAdaptiveNutRampAcceleration: {value: -1500, units: 'm*s-2', autoMap: true, min: -10000, max: 0, onChange: 'updateLauncher', folder: 'Launcher'},
  launcherMassDriverAltitude: {value: -200, units: 'm', autoMap: true, min: -10000, max: 4000, onChange: 'updateLauncher', folder: 'Launcher'},
  launcherRampExitAltitude: {value: 2700, units: 'm', autoMap: true, min: -10000, max: 50000, onChange: 'updateLauncher', folder: 'Launcher'},
  launcherEvacuatedTubeExitAltitude: {value: 31700, units: "m", autoMap: true, min: -10000, max: 100000, onChange: 'updateLauncher', folder: 'Launcher'},
  launcherMassDriver1InitialVelocity: {value: 2, units: 'm/s', autoMap: true, min: 0, max: 1000, onChange: 'updateLauncher', folder: 'Launcher'},
  launcherMassDriver2InitialVelocity: {value: 200, units: 'm/s', autoMap: true, min: 0, max: 1000, onChange: 'updateLauncher', folder: 'Launcher'},
  launcherMassDriverExitVelocity: {value: 8000-360, units: 'm/s', autoMap: true, min: 1, max: 50000, onChange: 'updateLauncher', folder: 'Launcher'},
  launchVehicleSeaLevelRocketExhaustVelocity: {value: 3590, units: 'm/s', autoMap: true, min: 0, max: 20000, onChange: 'updateLauncher', folder: 'Launcher'},
  launchVehicleVacuumRocketExhaustVelocity: {value: 4436, units: 'm/s', autoMap: true, min: 0, max: 20000, onChange: 'updateLauncher', folder: 'Launcher'},
  launchSledMass: {value: 2000, units: 'kg', autoMap: true, min: 0, max: 10000, step: 1, onChange: 'updateLauncher', folder: 'Launcher'},
  launcherAdaptiveNutMass: {value: 9000, units: 'kg', autoMap: true, min: 0, max: 10000, step: 1, onChange: 'updateLauncher', folder: 'Launcher'},
  launcherNutMass: {value: 5000, units: 'kg', autoMap: true, min: 0, max: 10000, step: 1, onChange: 'updateLauncher', folder: 'Launcher'},
  launchVehicleDesiredOrbitalAltitude: {value: 200000, units: 'm', autoMap: true, min: 0, max: 10000000, onChange: 'updateLauncher', folder: 'Launcher'},
  launchVehicleNoseConeTipRadius: {value: 0.001, units: 'm', autoMap: true, min: 0, max: 10, onChange: 'updateLauncher', folder: 'Launcher'},
  launcherPayloadDeliveredToOrbit: {value: 100, units: 'kg', autoMap: true, min: 1, max: 10000, onChange: 'updateLauncher', folder: 'Launcher'},
  numLaunchesPerMarsTransferSeason: {value: 14*4, units: '', autoMap: true, min: 1, max: 10000, onChange: 'updateLauncher', folder: 'Launcher'},
  numberOfMarsTransferSeasons: {value: 10, units: '', autoMap: true, min: 1, max: 100, onChange: 'updateLauncher', folder: 'Launcher'},
  launchFromPlanet: {value: "Earth", autoMap: true, onChange: 'updateLauncher', folder: 'Launcher'},
  launchToPlanet: {value: "Mars", autoMap: true, onChange: 'updateLauncher', folder: 'Launcher'},

  propellantNeededForLandingOnMars: {value: 1000, units: 'kg', autoMap: true, min: 1, max: 10000, onChange: 'updateLauncher', folder: 'Launcher'},
  propellantNeededForLandingOnVenus: {value: 100, units: 'kg', autoMap: true, min: 1, max: 10000, onChange: 'updateLauncher', folder: 'Launcher'},
  launchVehiclePropellantMassFlowRate: {value: 20, units: 'kg/s', autoMap: true, min: 0, max: 1000, onChange: 'updateLauncher', folder: 'Launcher'},
  launchVehicleAdaptiveThrust: {value: false, units: '', autoMap: true, onChange: 'updateLauncher', folder: 'Launcher'},
  launcherCoastTime: {value: 1250, units: 's', autoMap: true, min: 10, max: 5000, onChange: 'updateLauncher', folder: 'Launcher'},
  launcherXyChartMaxT: {value: 450, units: 's', autoMap: true, min: 10, max: 5000, onChange: 'updateLauncher', folder: 'Launcher'},
  launcherServiceLife: {value: 20, units: 'years', autoMap: true, min: 1, max: 100, onChange: 'updateLauncher', folder: 'Launcher'},
  launcherLaunchesPerYear: {value: 500, units: '', autoMap: true, min: 1, max: 10000, onChange: 'updateLauncher', folder: 'Launcher'},
  launchTrajectorySelector: {value: 0, units: '', autoMap: true, min: 0, max: 1, onChange: 'updateLauncher', folder: 'Launcher'},

  // Engineering Parameters - Launch System - Appearance
  launcherFeederRailLength: {value: 20, units: "m", autoMap: true, min: 0, max: 1000, onChange: 'updateLauncher', folder: 'Launcher'},
  launchSystemForwardScaleFactor: {value: 1, units: '', autoMap: true, min: 0.1, max: 1000, onChange: 'updateLauncher', folder: 'Launcher'},
  launchSystemUpwardScaleFactor: {value: 1, units: '', autoMap: true, min: 0.1, max: 1000, onChange: 'updateLauncher', folder: 'Launcher'},
  launchSystemRightwardScaleFactor: {value: 1, units: '', autoMap: true, min: 0.1, max: 1000, onChange: 'updateLauncher', folder: 'Launcher'},
  launchVehicleSidewaysOffset: {value: 0, units: 'm', autoMap: true, min: -20, max: 20, onChange: 'updateLauncher', folder: 'Launcher'},
  launchVehicleUpwardsOffset: {value: 0.5, units: 'm', autoMap: true, min: -20, max: 20, onChange: 'updateLauncher', folder: 'Launcher'},
  launchVehicleForwardsOffset: {value: 23, units: 'm', autoMap: true, min: -20, max: 20, onChange: 'updateLauncher', folder: 'Launcher'},
  launchVehicleRadius: {value: 1.2, units: 'm', autoMap: true, min: .1, max: 20, onChange: 'updateLauncher', folder: 'Launcher'},
  launchVehicleBodyLength: {value: 10, units: 'm', autoMap: true, min: .1, max: 200, onChange: 'updateLauncher', folder: 'Launcher'},
  launchVehicleFlameLength: {value: 15, units: 'm', autoMap: true, min: .1, max: 200, onChange: 'updateLauncher', folder: 'Launcher'},
  launchVehicleNoseconeLength: {value: 20, units: 'm', autoMap: true, min: .1, max: 50, onChange: 'updateLauncher', folder: 'Launcher'},
    
  // From page 23 of https://upcommons.upc.edu/bitstream/handle/2117/328318/REPORT_556.pdf?sequence=1&isAllowed=y
  launchVehicleCoefficientOfDrag: {value: 0.035, units: '', autoMap: true, min: 0.01, max: 2, onChange: 'updateLauncher', folder: 'Launcher'},
  launchVehicleRocketEngineLength: {value: 4.3, units: 'm', autoMap: true, min: .1, max: 50, onChange: 'updateLauncher', folder: 'Launcher'},
  launchVehicleShockwaveConeLength: {value: 30, units: 'm', autoMap: true, min: .1, max: 200, onChange: 'updateLauncher', folder: 'Launcher'},
  launchVehicleEmptyMass: {value: 1000, units: 'kg', autoMap: true, min: 0, max: 100000, onChange: 'updateLauncher', folder: 'Launcher'},
  launchVehiclePropellantMass: {value: 9500, units: 'kg', autoMap: true, min: 0, max: 100000, onChange: 'updateLauncher', folder: 'Launcher'},
  launchVehiclePayloadMass: {value: 100, units: 'kg', autoMap: true, min: 0, max: 100000, onChange: 'updateLauncher', folder: 'Launcher'},
  launchVehicleNonPayloadMass: {value: 400, units: 'kg', autoMap: true, min: 0, max: 100000, onChange: 'updateLauncher', folder: 'Launcher'},
  launchVehicleCostPerKg: {value: 1000, units: 'USD/kg', autoMap: true, min: 0, max: 100000, onChange: 'updateLauncher', folder: 'Launcher'},
  launchVehicleScaleFactor: {value: 1.5, units: 'm', autoMap: true, min: .1, max: 1000, onChange: 'updateLauncher', folder: 'Launcher'},
  // The launch cadence (launcher time between launches); the ocean terminal's ships keep up with it (src/launcher/launchCadence.js).
  launchVehicleSpacingInSeconds: {value: 20, units: 's', autoMap: true, min: 0.1, max: 7200, onChange: 'updateLauncher', folder: 'Launcher'},
  numVirtualLaunchVehicles: {value: 1, units: '', autoMap: true, min: 0, max: 3600, step: 1, onChange: 'updateLauncher', folder: 'Launcher'},
  launchVehicleNumModels: {value: 1, units: '', autoMap: true, min: 0, max: 3600, step: 1, onChange: 'updateLauncher', folder: 'Launcher'},
  launchVehicleShowCrew: {value: true, units: '', autoMap: true, onChange: 'updateLauncher', folder: 'Launcher'},
  launchVehicleCrewCapsuleDiameter: {value: 0.5, units: 'm', autoMap: true, min: 0.1, max: 3, onChange: 'updateLauncher', folder: 'Launcher'},
  launchVehicleCrewCapsuleLength: {value: 2.2, units: 'm', autoMap: true, min: 0.5, max: 10, onChange: 'updateLauncher', folder: 'Launcher'},
  launchVehicleCrewCount: {value: 4, units: '', autoMap: true, min: 0, max: 50, step: 1, onChange: 'updateLauncher', folder: 'Launcher'},
  launchVehicleCrewForwardSpacing: {value: 1.6, units: 'm', autoMap: true, min: 0.1, max: 20, onChange: 'updateLauncher', folder: 'Launcher'},
  launcherEntranceAirlockAdditionalLength: {value: 250-50, units: 'm', autoMap: true, min: 0, max: 100, onChange: 'updateLauncher', folder: 'Launcher'},
  numVirtualHumanFigures: {value: 1, units: '', autoMap: true, min: 0, max: 3600, step: 1, onChange: 'updateLauncher', folder: 'Launcher'},

  launcherSlowDownPassageOfTime: {value: 1, units: '', autoMap: true, min: 0, max: 2, onChange: 'updateLauncher', folder: 'Launcher'},
  launcherStartDelayInSeconds: {value: 25, units: 's', autoMap: true, min: 0, max: 300, onChange: 'updateLauncher', folder: 'Launcher'},
  // Launcher time each launch's vehicle and nut take to be drawn out of the ocean terminal into the tube before accelerating (src/launcher/launchCadence.js).
  launcherTerminalEgressDuration: {value: 120, units: 's', autoMap: true, min: 0, max: 600, onChange: 'updateLauncher', folder: 'Launcher'},
  numVirtualMassDriverTubes: {value: 256, units: "", autoMap: true, min: 0, max: 3600, step: 1, onChange: 'updateLauncher', folder: 'Launcher'},
  launcherMassDriverRailWidth: {value: 1.0, units: 'm', autoMap: true, min: 1, max: 2000, onChange: 'updateLauncher', folder: 'Launcher'},
  launcherMassDriverRailHeight: {value: 0.25, units: 'm', autoMap: true, min: 1, max: 2000, onChange: 'updateLauncher', folder: 'Launcher'},
  launcherMassDriverRailMaterialDensity: {value: 7930, units: "kg/m3", autoMap: true, min: 0, max: 20000, onChange: 'updateLauncher', folder: 'Launcher'},
  launcherMassDriverRailMaterialCost: {value: 1, units: "USD/kg", autoMap: true, min: 0, max: 100, onChange: 'updateLauncher', folder: 'Launcher'},
  launchRailUpwardsOffset: {value: -2.0, units: 'm', autoMap: true, min: -200, max: 200, onChange: 'updateLauncher', folder: 'Launcher'},
  numVirtualMassDriverRails: {value: 256, units: "", autoMap: true, min: 0, max: 3600, step: 1, onChange: 'updateLauncher', folder: 'Launcher'},
  launcherMassDriverBracketWidth: {value: 2.0, units: 'm', autoMap: true, min: 1, max: 2000, onChange: 'updateLauncher', folder: 'Launcher'},
  launcherMassDriverBracketHeight: {  value: 0.3, units: 'm', autoMap: true, min: 1, max: 2000, onChange: 'updateLauncher', folder: 'Launcher'},
  launcherMassDriverBracketRibWidth: {value: 0.25, units: 'm', autoMap: true, min: 1, max: 2000, onChange: 'updateLauncher', folder: 'Launcher'},
  launcherMassDriverBracketNumModels: {value: 32, units: "", autoMap: true, min: 0, max: 3600, step: 1, onChange: 'updateLauncher', folder: 'Launcher'},
  launcherMassDriverNumScrews: {value: 2, units: "", autoMap: true, min: 0, max: 4, step: 1, onChange: 'updateLauncher', folder: 'Launcher'},
  launcherMassDriverNumFlightsContactedPerScrew: {value: 2, units: "", autoMap: true, min: 0, max: 4, step: 1, onChange: 'updateLauncher', folder: 'Launcher'},
  launcherMassDriverScrewShaftInnerRadius: {value: 0.15, units: 'm', autoMap: true, min: 0, max: 2000, onChange: 'updateLauncher', folder: 'Launcher'},
  launcherMassDriverScrewShaftOuterRadius: {value: 0.228, units: 'm', autoMap: true, min: .01, max: 2000, onChange: 'updateLauncher', folder: 'Launcher'},
  launcherMassDriverScrewGrapplePadStartRadius: {value: 0.4, units: 'm', autoMap: true, min: 0, max: 2000, onChange: 'updateLauncher', folder: 'Launcher'},
  launcherMassDriverScrewThreadRadius: {value: 0.5, units: 'm', autoMap: true, min: .01, max: 2000, onChange: 'updateLauncher', folder: 'Launcher'},
  launcherMassDriverScrewMaxTipSpeed: {value: 530, units: 'm/s', autoMap: true, min: 1, max: 2000, onChange: 'updateLauncher', folder: 'Launcher'},
  launcherMassDriverScrewThreadThickness: {value: 0.07, units: 'm', autoMap: true, min: .01, max: 2000, onChange: 'updateLauncher', folder: 'Launcher'},
  launcherMassDriverScrewThreadTaperRatio: {value: 0.25, units: '', autoMap: true, min: 0, max: 1, onChange: 'updateLauncher', folder: 'Launcher'}, // This is the ratio of the thread diameter to the screw diameter
  launcherMassDriverScrewThreadStarts: {value: 4, units: '', autoMap: true, min: 0, max: 16, step: 1, onChange: 'updateLauncher', folder: 'Launcher'},   // Maximum number of individual threads (flights) in the screw. Starting from this (rounded down to even) halved while it stays even (e.g. 8: 2, 4, 8; 12: 6, 12), the screw uses the most that leave room for a grappler pad; see screwThreadLayout (0 = 8)
  // "RoughLength" should be interpreted as "RoughSpacing", or the distance from the start of one screw to the start of the next
  launcherMassDriverScrewRoughLength: {value: 5, units: "", autoMap: true, min: 0, max: 10000, step: 1, onChange: 'updateLauncher', folder: 'Launcher'},
  launcherMassDriverScrewSidewaysOffset: {value: 3, units: "m", autoMap: true, min: -100, max: 100, onChange: 'updateLauncher', folder: 'Launcher'},
  launcherMassDriverScrewUpwardsOffset: {value: 0.5, units: "m", autoMap: true, min: -100, max: 100, onChange: 'updateLauncher', folder: 'Launcher'},
  launcherMassDriverScrewRevolutionsPerSecond: {value: 169, units: "", autoMap: true, min: 0, max: 1000, onChange: 'updateLauncher', folder: 'Launcher'},
  launcherMassDriverScrewBracketThickness: {value: 0.05, units: "m", autoMap: true, min: 0, max: 1, onChange: 'updateLauncher', folder: 'Launcher'},
  launcherMassDriverScrewBracketDensity: {value: 7850, units: "kg/m3", autoMap: true, min: 0, max: 20000, onChange: 'updateLauncher', folder: 'Launcher'},
  launcherMassDriverScrewBracketMaterialCost: {value: 1, units: "USD/kg", autoMap: true, min: 0, max: 100, onChange: 'updateLauncher', folder: 'Launcher'},
  launcherMassDriverScrewNumBrackets: {value: 80000, units: "", autoMap: true, min: 0, max: 20000, step: 1, onChange: 'updateLauncher', folder: 'Launcher'},
  launcherMassDriverScrewMaterialYieldStrength: {value: 690000000, units: "Pa", autoMap: true, min: 0, max: 1000000000, onChange: 'updateLauncher', folder: 'Launcher'}, // https://www.unionfab.com/blog/2024/03/yield-strength-of-steel
  launcherMassDriverScrewMaterialDensity: {value: 7850, units: "kg/m3", autoMap: true, min: 0, max: 20000, onChange: 'updateLauncher', folder: 'Launcher'},
  launcherMassDriverScrewMaterialSpecificHeatCapacity: {value: 500, units: "J/kg/K", autoMap: true, min: 0, max: 2000, onChange: 'updateLauncher', folder: 'Launcher'},
  launcherMassDriverScrewMaterialEmissivity: {value: 0.5, units: "", autoMap: true, min: 0, max: 1, onChange: 'updateLauncher', folder: 'Launcher'},
  launcherMassDriverScrewMaterialPricePerKgBuy: {value: 1, units: "USD/kg", autoMap: true, min: 0, max: 100, onChange: 'updateLauncher', folder: 'Launcher'},
  launcherMassDriverScrewMaterialPricePerKgSell: {value: 0.5, units: "USD/kg", autoMap: true, min: 0, max: 100, onChange: 'updateLauncher', folder: 'Launcher'},
  launcherMassDriverScrewEngineeringFactor: {value: 1.5, units: "", autoMap: true, min: 0, max: 10, onChange: 'updateLauncher', folder: 'Launcher'},
  launcherMassDriverScrewMotorCost: {value: 5000, units: "USD", autoMap: true, min: 0, max: 1000000, onChange: 'updateLauncher', folder: 'Launcher'},
  launcherMassDriverScrewRotationRate: {value: 206.7, units: 's-1', autoMap: true, min: 1, max: 2000, onChange: 'updateLauncher', folder: 'Launcher'},
  launcherMassDriverScrewFlightSaturationFluxDensity: {value: 1.9, units: 'T', autoMap: true, min: 0.1, max: 20, onChange: 'updateLauncher', folder: 'Launcher'},
  launcherMassDriverScrewFlightMagneticFluxDensityPortion: {value: 0.8, units: '', autoMap: true, min: 0.1, max: 1, onChange: 'updateLauncher', folder: 'Launcher'},
  launcherMassDriverFlywheelOuterRadius: {value: 0.145, units: 'm', autoMap: true, min: 0.1, max: 100, onChange: 'updateLauncher', folder: 'Launcher'},
  launcherMassDriverFlywheelInnerRadius: {value: 0.1, units: 'm', autoMap: true, min: 0.1, max: 100, onChange: 'updateLauncher', folder: 'Launcher'},
  launcherMassDriverFlywheelLengthFactor: {value: 0.9, units: 'm', autoMap: true, min: 0.1, max: 100, onChange: 'updateLauncher', folder: 'Launcher'},
  launcherMassDriverFlywheelMaterialDensity: {value: 7850, units: 'kg/m3', autoMap: true, min: 0, max: 20000, onChange: 'updateLauncher', folder: 'Launcher'},
  launcherMassDriverFlywheelMaterialYieldStrength: {value: 690000000, units: 'Pa', autoMap: true, min: 0, max: 1000000000, onChange: 'updateLauncher', folder: 'Launcher'},
  launcherMassDriverFlywheelEngineeringFactor: {value: 1.5, units: "", autoMap: true, min: 0, max: 10, onChange: 'updateLauncher', folder: 'Launcher'},

  // Assuming Concrete with a stainless steel outer liner for the ,assdriver tube
  launcherMassDriverTubeInnerRadius: {value: 4.5, units: 'm', autoMap: true, min: 1, max: 2000, onChange: 'updateLauncher', folder: 'Launcher'},
  exagerateNonElevatedTubeFactor: {value: 1, units: '', autoMap: true, min: 1, max: 10, onChange: 'updateLauncher', folder: 'Launcher'},
  // Where the tube is under the sea it is buoyant, held down by cables to the sea floor in inverted Vs (to resist currents).
  launcherMassDriverMooringSpacing: {value: 1000, units: 'm', autoMap: true, min: 20, max: 5000, onChange: 'updateLauncher', folder: 'Launcher'},
  launcherMassDriverMooringCableRadius: {value: 0.1, units: 'm', autoMap: true, min: 0.01, max: 1, onChange: 'updateLauncher', folder: 'Launcher'},
  launcherMassDriverMooringSpread: {value: 1, units: '', autoMap: true, min: 0, max: 3, onChange: 'updateLauncher', folder: 'Launcher'},   // sideways distance of each anchor per metre of depth below the tube (1 = 45 degree legs)
  launcherMassDriverMooringForkLevels: {value: 4, units: '', autoMap: true, min: 0, max: 8, step: 1, onChange: 'updateLauncher', folder: 'Launcher'},   // times each mooring leg forks on its way up (like the ring's tethers): it holds the tube at 2^levels points spread over the mooring spacing
  launcherMassDriverMooringCatenary: {value: 2, units: '', autoMap: true, min: 0.3, max: 20, onChange: 'updateLauncher', folder: 'Launcher'},   // catenary constant of each leg as a multiple of its length (larger = straighter)
  launcherMassDriverTubeLinerThickness: {value: 0.002, units: 'm', autoMap: true, min: 1, max: 2000, onChange: 'updateLauncher', folder: 'Launcher'},
  launcherMassDriverTubeWallThickness: {value: 0.01, units: 'm', autoMap: true, min: 0, max: 2000, onChange: 'updateLauncher', folder: 'Launcher'},
  launcherMassDriverTubeMaterial0Density: {value: 7930, units: "kg/m3", autoMap: true, min: 0, max: 20000, onChange: 'updateLauncher', folder: 'Launcher'},
  // For example plate steel is trading at $1000 per ton and Hot Rolled Coil (HRC) is trading roughly at $700, according to Ian Smith, Supply Chain Manager at Keystone
  launcherMassDriverTubeMaterial0Cost: {value: 1, units: "USD/kg", autoMap: true, min: 0, max: 100, onChange: 'updateLauncher', folder: 'Launcher'},
  launcherMassDriverTubeMaterial1Density: {value: 2400, units: "kg/m3", autoMap: true, min: 0, max: 20000, onChange: 'updateLauncher', folder: 'Launcher'},
  launcherMassDriverTubeMaterial1Cost: {value: 0.022425547, units: "USD/kg", autoMap: true, min: 0, max: 100, onChange: 'updateLauncher', folder: 'Launcher'},
  launcherEvacuatedTubeNumModels: {value:32, units: "", autoMap: true, min: 0, max: 3600, step: 1, onChange: 'updateLauncher', folder: 'Launcher'},
  launcherMarkerRadius: {value: 50, units: "m", autoMap: true, min: 1, max: 10000, step: 1, onChange: 'updateLauncher', folder: 'Launcher'},

  elevatedEvacuatedTubeInnerRadius: {value: 4.5, units: 'm', autoMap: true, min: 1, max: 2000, onChange: 'updateLauncher', folder: 'Launcher'},
  elevatedEvacuatedTubeThickness: {value: 0.002, units: 'm', autoMap: true, min: 1, max: 2000, onChange: 'updateLauncher', folder: 'Launcher'},

  elevateEvacuatedTubeInnerRadius: {value: 4.5, units: 'm', autoMap: true, min: 1, max: 2000, onChange: 'updateLauncher', folder: 'Launcher'},
  elevateEvacuatedTubeThickness: {value: 0.002, units: 'm', autoMap: true, min: 1, max: 2000, onChange: 'updateLauncher', folder: 'Launcher'},
  evacuatedTubeInteriorPressure: {value: 1, units: 'Pa', autoMap: true, min: 0, max: 2000, onChange: 'updateLauncher', folder: 'Launcher'},
  evacuatedTubeInteriorTemperature: {value: 273.15+20, units: 'K', autoMap: true, min: 0, max: 400, onChange: 'updateLauncher', folder: 'Launcher'},
  elevatedEvacuatedTubeHvdcCableVoltage: {value: 1100000, units: 'V', autoMap: true, min: 0, max: 10000000, onChange: 'updateLauncher', folder: 'Launcher'},
  elevatedEvacuatedTubeHvdcCableCurrentDensity: {value: 2e6, units: 'A/m2', autoMap: true, min: 0, max: 10000000, onChange: 'updateLauncher', folder: 'Launcher'},
  elevatedEvacuatedTubeHvdcCableMaterialDensity: {value: 2700, units: 'kg/m3', autoMap: true, min: 0, max: 20000, onChange: 'updateLauncher', folder: 'Launcher'},
  elevatedEvacuatedTubeHvdcCableMaterialCost: {value: 2.5, units: 'USD/kg', autoMap: true, min: 0, max: 100, onChange: 'updateLauncher', folder: 'Launcher'},

  launchSledSpacingInSeconds: {value: 5, units: 's', autoMap: true, min: 0.1, max: 60, onChange: 'updateLauncher', folder: 'Launcher'},
  launchSledWidth: {value: 2, units: 'm', autoMap: true, min: .1, max: 20, onChange: 'updateLauncher', folder: 'Launcher'},
  launchSledHeight: {value: .25, units: 'm', autoMap: true, min: .1, max: 20, onChange: 'updateLauncher', folder: 'Launcher'},
  launchSledBodyLength: {value: 10, units: 'm', autoMap: true, min: .1, max: 200, onChange: 'updateLauncher', folder: 'Launcher'},
  launchSledAirgapWidth: {value: 0.48, units: 'm', autoMap: true, min: .001, max: 1, onChange: 'updateLauncher', folder: 'Launcher'},
  launchSledSidewaysOffset: {value: 0, units: 'm', autoMap: true, min: -200, max: 200, onChange: 'updateLauncher', folder: 'Launcher'},
  launchSledUpwardsOffset: {value: 0.5, units: 'm', autoMap: true, min: -200, max: 200, onChange: 'updateLauncher', folder: 'Launcher'},
  launchSledForwardsOffset: {value: 13, units: 'm', autoMap: true, min: -200, max: 200, onChange: 'updateLauncher', folder: 'Launcher'},
  launchSledScaleFactor: {value: 1, units: '', autoMap: true, min: 0.1, max: 1000, onChange: 'updateLauncher', folder: 'Launcher'},
  numVirtualLaunchSleds: {value: 1, units: '', autoMap: true, min: 0, max: 3600, step: 1, onChange: 'updateLauncher', folder: 'Launcher'},
  launchSledNumModels: {value: 40, units: '', autoMap: true, min: 0, max: 3600, step: 1, onChange: 'updateLauncher', folder: 'Launcher'},

  adaptiveNutSpacingInSeconds: {value: 5, units: 's', autoMap: true, min: 0.1, max: 60, onChange: 'updateLauncher', folder: 'Launcher'},
  adaptiveNutWidth: {value: 2, units: 'm', autoMap: true, min: .1, max: 20, onChange: 'updateLauncher', folder: 'Launcher'},
  adaptiveNutHeight: {value: 3.7, units: 'm', autoMap: true, min: .1, max: 20, onChange: 'updateLauncher', folder: 'Launcher'},
  adaptiveNutBodyLength: {value: 20, units: 'm', autoMap: true, min: .1, max: 200, onChange: 'updateLauncher', folder: 'Launcher'},
  adaptiveNutGrapplerLength: {value: 20, units: 'm', autoMap: true, min: .1, max: 200, onChange: 'updateLauncher', folder: 'Launcher'},
  adaptiveNutSidewaysOffset: {value: 0, units: 'm', autoMap: true, min: -200, max: 200, onChange: 'updateLauncher', folder: 'Launcher'},
  adaptiveNutUpwardsOffset: {value: 0.5, units: 'm', autoMap: true, min: -200, max: 200, onChange: 'updateLauncher', folder: 'Launcher'},
  adaptiveNutForwardsOffset: {value: -3, units: 'm', autoMap: true, min: -200, max: 200, onChange: 'updateLauncher', folder: 'Launcher'},
  adaptiveNutScaleFactor: {value: 1, units: '', autoMap: true, min: 0.1, max: 1000, onChange: 'updateLauncher', folder: 'Launcher'},
  numVirtualAdaptiveNuts: {value: 1, units: '', autoMap: true, min: 0, max: 3600, step: 1, onChange: 'updateLauncher', folder: 'Launcher'},
  adaptiveNutNumModels: {value: 40, units: '', autoMap: true, min: 0, max: 3600, step: 1, onChange: 'updateLauncher', folder: 'Launcher'},

  // ToDo: Values for launchVehicleEmptyMass and launchVehiclePropellantMass will be calculated later from other parameters 
  launcherFlywheelRadius: {value: 0.225, units: 'm', autoMap: true, min: 0.01, max: 2, onChange: 'updateLauncher', folder: 'Launcher'},
  launcherFlywheelThickness: {value: 0.06, units: 'm', autoMap: true, min: 0.01, max: 2, onChange: 'updateLauncher', folder: 'Launcher'},
  launcherFlywheelDensity: {value: 8000, units: 'kg/m3', autoMap: true, min: 1000, max: 20000, onChange: 'updateLauncher', folder: 'Launcher'},
  //launcherFlywheelMassPerMeter: {value: 1020, units: 'kg/m', autoMap: true, min: 0, max: 1000, onChange: 'updateLauncher', folder: 'Launcher'},
  launcherBracketsMassPerMeter: {value: 40, units: 'kg/m', autoMap: true, min: 0, max: 1000, onChange: 'updateLauncher', folder: 'Launcher'},
  launcherRailsMassPerMeter: {value: 100, units: 'kg/m', autoMap: true, min: 0, max: 1000, onChange: 'updateLauncher', folder: 'Launcher'},
  launcherTorqueConvertorsMassPerMeter: {value: 100, units: 'kg/m', autoMap: true, min: 0, max: 1000, onChange: 'updateLauncher', folder: 'Launcher'},
  launcherMotorMass: {value: 100, units: 'kg', autoMap: true, min: 0, max: 1000, onChange: 'updateLauncher', folder: 'Launcher'},
  launcherMotorCost: {value: 2000, units: 'USD', autoMap: true, min: 0, max: 10000, onChange: 'updateLauncher', folder: 'Launcher'},
  launcherMotorsPerMeter: {value: 0.02, units: '', autoMap: true, min: 0, max: 1, onChange: 'updateLauncher', folder: 'Launcher'},
  launcherVacuumPumpMass: {value: 100, units: 'kg', autoMap: true, min: 0, max: 1000, onChange: 'updateLauncher', folder: 'Launcher'}, 
  launcherVacuumPumpCost: {value: 2000, units: 'USD', autoMap: true, min: 0, max: 10000, onChange: 'updateLauncher', folder: 'Launcher'},
  launcherVacuumPumpsPerMeter: {value: 0.02, units: '', autoMap: true, min: 0, max: 100, onChange: 'updateLauncher', folder: 'Launcher'},
  launcherSuspendedTubeMassPerMeter: {value: 100, units: 'kg/m', autoMap: true, min: 0, max: 1000, onChange: 'updateLauncher', folder: 'Launcher'},
  launcherAccelerationEfficiency: {value: 0.8, units: '', autoMap: true, min: 0, max: 1, onChange: 'updateLauncher', folder: 'Launcher'},
  launcherDecelerationEfficiency: {value: 0.8, units: '', autoMap: true, min: 0, max: 1, onChange: 'updateLauncher', folder: 'Launcher'},
  launcherMassDriverConcreteTubeInnerRadius: {value: 1, units: 'm', autoMap: true, min: 0.01, max: 2, onChange: 'updateLauncher', folder: 'Launcher'},
  launcherMassDriverConcreteTubeOuterRadius: {value: 1.125, units: 'm', autoMap: true, min: 0.01, max: 2, onChange: 'updateLauncher', folder: 'Launcher'},
  launcherMassDriverConcreteTubeJacketThickness: {value: 0.002, units: 'm', autoMap: true, min: 0, max: 1000, onChange: 'updateLauncher', folder: 'Launcher'},

  massDriverCameraRange: {value: 500, units: 'm', autoMap: true, min: 0, max: 1000000, onChange: 'updateLauncher', folder: 'Launcher'},
  launchSledCameraRange: {value: 2000, units: 'm', autoMap: true, min: 0, max: 1000000, onChange: 'updateLauncher', folder: 'Launcher'},
  vehicleInTubeCameraRange: {value: 1000000, units: 'm', autoMap: true, min: 0, max: 1000000, onChange: 'updateLauncher', folder: 'Launcher'},
  lauchVehicleCameraRange: {value: 1000000, units: 'm', autoMap: true, min: 0, max: 1000000, onChange: 'updateLauncher', folder: 'Launcher'},

  // Grapplers
  adaptiveNutNumGrapplers: {value: 64, units: '', autoMap: true, min: 0, max: 3600, step: 1, onChange: 'updateLauncher', folder: 'Grapplers'},
  adaptiveNutGrapplerMagnetThickness: {value: 0.1, units: '', autoMap: true, min: 0, max: 1, step: 1, onChange: 'updateLauncher', folder: 'Grapplers'},
  adaptiveNutBetweenGrapplerFactor: {value: 0.5, units: '', autoMap: true, min: 0, max: 1, step: 1, onChange: 'updateLauncher', folder: 'Grapplers'},
  adaptiveNutShaftToGrapplerPad: {value: 0.172, units: 'm', autoMap: true, min: 0, max: 1, step: 1, onChange: 'updateLauncher', folder: 'Grapplers'},
  adaptiveNutGrapplerPadLiftAwayDistance: {value: 0.01, units: 'm', autoMap: true, min: 0, max: 1, step: 1, onChange: 'updateLauncher', folder: 'Grapplers'},
  // Which algorithm sequences the grapplers' flight-to-flight hops (see src/launcher/grapplerPlacement.js).
  adaptiveNutGrapplerSequencingMode: {value: grapplerSequencingModes.Original, units: '', autoMap: true, options: grapplerSequencingModes, onChange: 'updateLauncher', folder: 'Grapplers'},
  // Both original modes split each hop's switchover into three successive portions: the pad lifts
  // off the flight (padLiftAwayPortion), untwists to neutral (padTwistPortion), then swings back to the
  // middle of its travel (the remainder). Fractions of the whole switchover, so their sum must be < 1.
  adaptiveNutGrapplerPadLiftAwayPortion: {value: 0.1, units: '', autoMap: true, min: 0, max: 1, onChange: 'updateLauncher', folder: 'Grapplers'},
  adaptiveNutGrapplerPadTwistPortion: {value: 0.1, units: '', autoMap: true, min: 0, max: 1, onChange: 'updateLauncher', folder: 'Grapplers'},
  // Hop duration for Scheduled and OriginalConstantRate; the latter budgets half before phase handover
  // and half after it, using the original pose mapping (see grapplerPlacement.js).
  adaptiveNutGrapplerSwitchoverTime: {value: 0.6, units: 's', autoMap: true, min: 0.001, max: 10, onChange: 'updateLauncher', folder: 'Grapplers'},
  adaptiveNutGrapplerClearanceFactor: {value: 0.1, units: '', autoMap: true, min: 0, max: 1, step: 1, onChange: 'updateLauncher', folder: 'Grapplers'},
  adaptiveNutGrapplerBallJointClearance: {value: 0.1, units: 'm', autoMap: true, min: 0, max: 1, step: 1, onChange: 'updateLauncher', folder: 'Grapplers'},
  adaptiveNutGrapplerBallJointRadius: {value: 0.06, units: 'm', autoMap: true, min: 0, max: 1, step: 1, onChange: 'updateLauncher', folder: 'Grapplers'},
  adaptiveNutGrapplerCylinderRadius: {value: 0.04, units: 'm', autoMap: true, min: 0, max: 1, step: 1, onChange: 'updateLauncher', folder: 'Grapplers'},
  adaptiveNutGrapplerRangeFactor: {value: .01, units: '', autoMap: true, min: 0, max: 1, onChange: 'updateLauncher', folder: 'Grapplers'},
  adaptiveNutGrapplerMaxRangeOfMotion: {value: 0.125, units: '', autoMap: true, min: 0, max: 0.5, onChange: 'updateLauncher', folder: 'Grapplers'},
  adaptiveNutGrapplerTopDeadCenterRotation: {value: 0.5, units: '', autoMap: true, min: 0, max: 1, onChange: 'updateLauncher', folder: 'Grapplers'},
  adaptiveNutIntraAnchorUpwardsSeparation: {value: 0.85, units: 'm', autoMap: true, min: 0, max: 1, onChange: 'updateLauncher', folder: 'Grapplers'},
  adaptiveNutInterAnchorUpwardsSeparation: {value: 0.12, units: 'm', autoMap: true, min: 0, max: 1, onChange: 'updateLauncher', folder: 'Grapplers'},

  // Rocket Launch
  rocketLaunchPadLatitude: {value: 25.9967, units: 'degrees', autoMap: true, min: -90, max: 90, onChange: 'updateLauncher', folder: 'Launcher'},
  rocketLaunchPadLongitude: {value: 97.1549, units: 'degrees', autoMap: true, min: 0, max: 360, onChange: 'updateLauncher', folder: 'Launcher'},
  rocketLaunchPadAltitude: {value: 20, units: 'm', autoMap: true, min: 0, max: 10000, onChange: 'updateLauncher', folder: 'Launcher'},
  rocketStage1DryMass: {value: 300000, units: 'kg', autoMap: true, min: 0, max: 500000, onChange: 'updateLauncher', folder: 'Rocket'},
  rocketStage2DryMass: {value: 160000, units: 'kg', autoMap: true, min: 0, max: 500000, onChange: 'updateLauncher', folder: 'Rocket'},
  rocketStage1PropellantMass: {value: 3400000, units: 'kg', autoMap: true, min: 0, max: 5000000, onChange: 'updateLauncher', folder: 'Rocket'},
  rocketStage2PropellantMass: {value: 1200000, units: 'kg', autoMap: true, min: 0, max: 5000000, onChange: 'updateLauncher', folder: 'Rocket'},
  rocketStage1RecoveryPropellantMass: {value: 660000, units: 'kg', autoMap: true, min: 0, max: 1000000, onChange: 'updateLauncher', folder: 'Rocket'},
  rocketStage2RecoveryPropellantMass: {value: 35000+13000, units: 'kg', autoMap: true, min: 0, max: 1000000, onChange: 'updateLauncher', folder: 'Rocket'},
  rocketFuelPortion: {value: 0.2, units: '', autoMap: true, min: 0, max: 1, onChange: 'updateLauncher', folder: 'Rocket'},
  rocketPayloadMass: {value: 1, units: 'kg', autoMap: true, min: 0, max: 500000, onChange: 'updateLauncher', folder: 'Rocket'},
  rocketStage1StructuralLoadLimit: {value: 25000000, units: 'N', autoMap: true, min: 0, max: 2e8, onChange: 'updateLauncher', folder: 'Rocket'},
  rocketStage2StructuralLoadLimit: {value: 5000000, units: 'N', autoMap: true, min: 0, max: 2e8, onChange: 'updateLauncher', folder: 'Rocket'},
  rocketStage2MaxAcceleration: {value: 4.5*9.807, units: 'm/s^2', autoMap: true, min: 0, max: 100, onChange: 'updateLauncher', folder: 'Rocket'},
  rocketExhaustVelocityVacEngInVac: {value: 380*9.807, units: 'm/s', autoMap: true, min: 0, max: 5000, onChange: 'updateLauncher', folder: 'Rocket'},
  rocketExhaustVelocityVacEngAtSeaLevel: {value: 320*9.807*7607/8227, units: 'm/s', autoMap: true, min: 0, max: 5000, onChange: 'updateLauncher', folder: 'Rocket'},
  rocketExhaustVelocitySLEngInVac: {value: 350*9.807, units: 'm/s', autoMap: true, min: 0, max: 5000, onChange: 'updateLauncher', folder: 'Rocket'},
  rocketExhaustVelocitySLEngAtSeaLevel: {value: 320*9.807*7607/8227, units: 'm/s', autoMap: true, min: 0, max: 5000, onChange: 'updateLauncher', folder: 'Rocket'},
  rocketVacuumEnginePropellantFlowRate: {value: 650, units: 'kg/s', autoMap: true, min: 0, max: 1000, onChange: 'updateLauncher', folder: 'Rocket'},
  rocketSeaLevelEnginePropellantFlowRate: {value: 650, units: 'kg/s', autoMap: true, min: 0, max: 1000, onChange: 'updateLauncher', folder: 'Rocket'},
  rocketStage1SeaLevelEngines: {value: 33, units: '', autoMap: true, min: 0, max: 100, onChange: 'updateLauncher', folder: 'Rocket'},
  rocketStage1VacuumEngines: {value: 0, units: '', autoMap: true, min: 0, max: 100, onChange: 'updateLauncher', folder: 'Rocket'},
  rocketStage2SeaLevelEngines: {value: 3, units: '', autoMap: true, min: 0, max: 100, onChange: 'updateLauncher', folder: 'Rocket'},
  rocketStage2VacuumEngines: {value: 3, units: '', autoMap: true, min: 0, max: 100, onChange: 'updateLauncher', folder: 'Rocket'},
  rocketSeaLevelEngineRadius: {value: 0.65, units: 'm', autoMap: true, min: 0, max: 10, onChange: 'updateLauncher', folder: 'Rocket'},
  rocketVacuumEngineRadius: {value: 1.2, units: 'm', autoMap: true, min: 0, max: 10, onChange: 'updateLauncher', folder: 'Rocket'},
  rocketCoefficientOfDrag: {value: 0.75, units: '', autoMap: true, min: 0, max: 1, onChange: 'updateLauncher', folder: 'Rocket'},
  rocketRadius: {value: 4.5, units: 'm', autoMap: true, min: 0, max: 10, onChange: 'updateLauncher', folder: 'Rocket'},
  rocketEffectiveRadius: {value: 1, units: 'm', autoMap: true, min: 0, max: 10, onChange: 'updateLauncher', folder: 'Rocket'},
  rocketStage1BodyLength: {value: 71, units: 'm', autoMap: true, min: .1, max: 200, onChange: 'updateLauncher', folder: 'Rocket'},
  rocketStage2BodyLength: {value: 36.28, units: 'm', autoMap: true, min: .1, max: 200, onChange: 'updateLauncher', folder: 'Rocket'},
  rocketNoseConeLength: {value: 13.72, units: 'm', autoMap: true, min: .1, max: 200, onChange: 'updateLauncher', folder: 'Rocket'},
  rocketDesiredOrbitalAltitude: {value: 200000, units: 'm', autoMap: true, min: 0, max: 10000000, onChange: 'updateLauncher', folder: 'Rocket'},
  rocketSeparationDelay: {value: 5, units: 's', autoMap: true, min: 0, max: 20, onChange: 'updateLauncher', folder: 'Rocket'},
  rocketCoastTime: {value: 1250, units: 's', autoMap: true, min: 10, max: 5000, onChange: 'updateLauncher', folder: 'Rocket'},
  showStarshipIFT6Telemetry: {value: true, autoMap: true, onChange: 'updateLauncher', folder: 'Rocket'},

  // Engineering Parameters - Power
  powerRequirement: {value: 1000, units: "W/m", autoMap: true, min: 1, max: 10000, onChange: 'adjustRingDesign', folder: 'Engineering'},   // This is the power that is consumed by the rings maglev systems and all equipment supported by the ring, per meter length of the ring.
  powerConductorDensity: {value: 2710, units: "kg*m-3", autoMap: true, min: 10, max: 10000, onChange: 'adjustRingDesign', folder: 'Engineering'},  // Value for aluminum
  powerConductorConductivity: {value: 36900000, units: "Siemens*m-1", autoMap: true, min: 10000000, max: 100000000, onChange: 'adjustRingDesign', folder: 'Engineering'}, // Value for Aliminum. One siemen is kg−1⋅m−2⋅s3⋅A2
  powerVoltageAcrossLoad: {value: 100000, units: "Volts", autoMap: true, min: 1, max: 10000000, onChange: 'adjustRingDesign', folder: 'Engineering'},
  powerLostInConductorFactor: {value: 0.01, units: "", autoMap: true, min: 0, max: 1, onChange: 'adjustRingDesign', folder: 'Engineering'},

  movingRingLinearMotorEfficiency: {value: 0.9, units: "", autoMap: true, min: 0, max: 1, onChange: 'adjustRingDesign', folder: 'Engineering'},
  solarPanelReferenceTemperature: {value: 25, units: "C", autoMap: true, min: -100, max: 100, onChange: 'adjustRingDesign', folder: 'Engineering'},
  solarPanelAverageTemperature: {value: -40, units: "C", autoMap: true, min: -100, max: 100, onChange: 'adjustRingDesign', folder: 'Engineering'},
  solarPanelTemperatureEfficiencyFactor: {value: 0.0045, units: "C-1", autoMap: true, min: 0, max: 1, onChange: 'adjustRingDesign', folder: 'Engineering'},
  solarPanelTemperatureCoefficient: {value: -0.47, units: "%/C", autoMap: true, min: -1, max: 1, onChange: 'adjustRingDesign', folder: 'Engineering'},
  solarPanelEfficiencyAtReferenceTemperature: {value: 0.2, units: "", autoMap: true, min: 0, max: 1, onChange: 'adjustRingDesign', folder: 'Engineering'},
  solarPanelMassPerMeterSquared: {value: 0.28, units: "kg/m2", autoMap: true, min: 0, max: 100, onChange: 'adjustRingDesign', folder: 'Engineering'},
  solarPanelMountMassPerMeterSquared: {value: 0.1, units: "kg/m2", autoMap: true, min: 0, max: 100, onChange: 'adjustRingDesign', folder: 'Engineering'},
  solarPanelCostPerWatt: {value: 2.5, units: "USD/W", autoMap: true, min: 0, max: 10, onChange: 'adjustRingDesign', folder: 'Engineering'},
  solarPanelPeakSolarPowerPerMeterSquared: {value: 1361, units: "W/m2", autoMap: true, min: 0, max: 10000, onChange: 'adjustRingDesign', folder: 'Engineering'},
  solarPowerAvailibilityFactor: {value: 0.5, units: "", autoMap: true, min: 0, max: 1, onChange: 'adjustRingDesign', folder: 'Engineering'},
  solarPanelWidth: {value: 10, units: "m", autoMap: true, min: 0, max: 10, onChange: 'adjustRingDesign', folder: 'Engineering'},

  // Material Parameters - Tethers
  tetherFiberDensityCarbonFiber: {value: 1790, units: "kg*m-3", autoMap: false, min: 10, max: 20000, onChange: 'adjustRingDesign', folder: 'Materials'},        // Toray1100GC, https://www.youtube.com/watch?v=yNsjVEm_9TI&t=129s
  tetherFiberTensileStrengthCarbonFiber: {value: 7000, units: "MPa", autoMap: false, min: 10, max: 100000, onChange: 'adjustRingDesign', folder: 'Materials'},   // Toray1100GC, https://www.youtube.com/watch?v=yNsjVEm_9TI&t=129s
  tetherFiberCostCarbonFiber: {value: 22, units: "USD/kg", autoMap: false, min: .01, max: 1000, onChange: 'adjustRingDesign', folder: 'Materials'},           // Note: Probably not accurate for Toray1100GC
  tetherFiberDensityGraphene: {value: 2090, units: "kg*m-3", autoMap: false, min: 10, max: 20000, onChange: 'adjustRingDesign', folder: 'Materials'},        // 
  tetherFiberTensileStrengthGraphene: {value: 130500, units: "MPa", autoMap: false, min: 10, max: 100000, onChange: 'adjustRingDesign', folder: 'Materials'},   // 
  tetherFiberCostGraphene: {value: 220, units: "USD/kg", autoMap: false, min: .01, max: 1000, onChange: 'adjustRingDesign', folder: 'Materials'},           // 
  tetherFiberDensityCustom: {value: 1790, units: "kg*m-3", autoMap: false, min: 10, max: 20000, onChange: 'adjustRingDesign', folder: 'Materials'},
  tetherFiberTensileStrengthCustom: {value: 7000, units: "MPa", autoMap: false, min: 10, max: 100000, onChange: 'adjustRingDesign', folder: 'Materials'},
  tetherFiberCostCustom: {value: 22, units: "USD/kg", autoMap: false, min: .01, max: 1000, onChange: 'adjustRingDesign', folder: 'Materials'},
  coilConductorMaterialResistivityCopper: {value: 1.68e-8, units: "", autoMap: true, min: 0, max: 1, onChange: 'adjustRingDesign', folder: 'Materials'},
  coilConductorMaterialResistivityAluminum: {value: 2.65e-8, units: "", autoMap: true, min: 0, max: 1, onChange: 'adjustRingDesign', folder: 'Materials'},
  coilConductorMaterialResistivityCustom: {value: 2.65e-8, units: "", autoMap: true, min: 0, max: 1, onChange: 'adjustRingDesign', folder: 'Materials'},
  coilConductorMaterialDensityCopper: {value: 8960, units: "kg/m3", autoMap: true, min: 0, max: 20000, onChange: 'adjustRingDesign', folder: 'Materials'},
  coilConductorMaterialDensityAluminum: {value: 2700, units: "kg/m3", autoMap: true, min: 0, max: 20000, onChange: 'adjustRingDesign', folder: 'Materials'},
  coilConductorMaterialDensityCustom: {value: 2700, units: "kg/m3", autoMap: true, min: 0, max: 20000, onChange: 'adjustRingDesign', folder: 'Materials'},
  coilConductorMaterialCostCopper: {value: 9.7289, units: "USD/kg", autoMap: true, min: 0, max: 20000, onChange: 'adjustRingDesign', folder: 'Materials'},
  coilConductorMaterialCostAluminum: {value: 3.3, units: "USD/kg", autoMap: true, min: 0, max: 20000, onChange: 'adjustRingDesign', folder: 'Materials'},
  coilConductorMaterialCostCustom: {value: 3.3, units: "USD/kg", autoMap: true, min: 0, max: 20000, onChange: 'adjustRingDesign', folder: 'Materials'},
  coreMaterialDensityIron: {value: 7874, units: "kg/m3", autoMap: true, min: 0, max: 20000, onChange: 'adjustRingDesign', folder: 'Materials'},
  coreMaterialCostIron: {value: 0.090, units: "USD/kg", autoMap: true, min: 0, max: 20000, onChange: 'adjustRingDesign', folder: 'Materials'},
  bulkMaterialCost: {value: 0.090, units: "USD/kg", autoMap: true, min: 0, max: 20000, onChange: 'adjustRingDesign', folder: 'Materials'},
  densityOfConcrete: {value: 2400, units: "kg/m3", autoMap: true, min: 0, max: 20000, onChange: 'adjustRingDesign', folder: 'Materials'},
  costOfConcrete: {value: 0.022425547, units: "USD/kg", autoMap: true, min: 0, max: 20000, onChange: 'adjustRingDesign', folder: 'Materials'},
  costOfSteel: {value: 0.7, units: "USD/kg", autoMap: true, min: 0, max: 20000, onChange: 'adjustRingDesign', folder: 'Materials'},
  costOfAluminum: {value: 2.3, units: "USD/kg", autoMap: true, min: 0, max: 20000, onChange: 'adjustRingDesign', folder: 'Materials'},

  // Economics Parameters
  wholesaleCostOfElectricity: {value: 0.05 / 3.6e6, units: "USD/J", autoMap: true, min: 0, max: 0.1, onChange: 'adjustRingDesign', folder: 'Economics'},
  electromagneticClutchWattsPerNmOfTorque: {value: 1, units: "W/Nm", autoMap: true, min: 0, max: 10, onChange: 'adjustRingDesign', folder: 'Economics'},
  jetFuelCostPerGallon: {value: 5.29 , units: "USD/Gallon", autoMap: true, min: 0, max: 0.1, onChange: 'adjustRingDesign', folder: 'Economics'},
  liquidHydrogenCostPerKg: {value: 3.65, units: 'USD/kg', autoMap: true, min: 0, max: 1, onChange: 'updateTransitsystem', folder: 'Economics'},
  liquidHeliumCostPerKg: {value: 50, units: 'USD/kg', autoMap: true, min: 0, max: 1, onChange: 'updateTransitsystem', folder: 'Economics'},
  liquidOxygenCostPerKg: {value: 0.155, units: 'USD/kg', autoMap: true, min: 0, max: 1, onChange: 'updateTransitsystem', folder: 'Economics'},
  launcherFactoryCost: {value: 10000000, units: "USD", autoMap: true, min: 0, max: 1e10, onChange: 'adjustRingDesign', folder: 'Economics'},

  // Rendering Parameters
  parameterPresetNumber: {value: 1, units: '', autoMap: true, onChange: 'adjustRingDesign', folder: 'Rendering'},
  showLogo: {value: false, units: '', autoMap: true, onChange: 'updateLogoSprite', folder: 'Rendering'},
  showXYChart: {value: false, units: '', autoMap: true, onChange: 'updateXYChart', folder: 'Rendering'},

  // Hack
  enableBackgroundAlpha: {value: 1, units: '', autoMap: true, min: 0, max: 1, onChange: 'adjustBackgroundOpacity', folder: 'Rendering'},
  showEarthsSurface: {value: defaultShows, units: '', autoMap: true, onChange: 'adjustEarthSurfaceVisibility', folder: 'Rendering'},
  showEarthsAtmosphere: {value: true, units: '', autoMap: true, onChange: 'adjustEarthAtmosphereVisibility', folder: 'Rendering'},
  // The sun's position at the start of the simulation (it then moves with simulated time). 0 / -1 =
  // automatic: a repeatable daytime for the preset's starting view (see src/physics/solar.js).
  sunDayOfYear: {value: 0, units: '', autoMap: true, min: 0, max: 366, step: 1, onChange: 'updatedParam', folder: 'Rendering'},
  sunTimeOfDayUTC: {value: -1, units: 'h', autoMap: true, min: -1, max: 24, step: 0.01, onChange: 'updatedParam', folder: 'Rendering'},
  showOcean: {value: true, units: '', autoMap: true, onChange: 'adjustOcean', folder: 'Rendering'},
  // Clouds and rain from the weather at the simulated date (see src/planet/clouds/Clouds.js).
  showClouds: {value: true, units: '', autoMap: true, onChange: 'adjustClouds', folder: 'Rendering'},
  // The camera readout with a Copy view link, bottom right (see src/ui/ViewStatus.js; never recorded).
  showViewStatus: {value: true, units: '', autoMap: true, onChange: 'adjustViewStatus', folder: 'Rendering'},
  // Seasonal sea ice on the sea surface, for the simulated date (see src/planet/seaIce.js).
  showSeaIce: {value: true, units: '', autoMap: true, onChange: 'adjustSeaIce', folder: 'Rendering'},
  // Sailboats near the camera, at anchor and sailing, for scale (see src/scene/Sailboats.js).
  showSailboats: {value: true, units: '', autoMap: true, onChange: 'adjustSailboats', folder: 'Rendering'},
  // Container ships on the shipping lanes and at anchor off ports (see src/scene/ContainerShips.js).
  showContainerShips: {value: true, units: '', autoMap: true, onChange: 'adjustContainerShips', folder: 'Rendering'},
  // The ocean terminal at an underwater launcher's breech, with its pier, cargo ships and mooring chains
  // (see src/launcher/OceanTerminal.js).
  showLauncherOceanTerminal: {value: true, units: '', autoMap: true, onChange: 'adjustOceanTerminal', folder: 'Rendering'},
  underwaterVisibility: {value: 20000, units: 'm', autoMap: true, min: 100, max: 200000, onChange: 'adjustOcean', folder: 'Rendering'},   // distance at which things underwater have almost faded into the water colour (a visual cue, not realism)
  earthTextureOpacity: {value: 1, units: '', autoMap: true, min: 0, max: 1, onChange: 'adjustEarthTextureOpacity', folder: 'Rendering'},
  earthTextureDoubleSided: {value: false, units: '', autoMap: true, onChange: 'adjustEarthTextureSidedness', folder: 'Rendering'},
  // Tethers and cables are drawn at their real diameters and glow (see src/scene/structureLines.js): how
  // far away a 1 cm line still glows at full brightness; beyond that it fades with its pixel coverage.
  structureGlowDistance: {value: 10000000, units: 'm', autoMap: true, min: 100, max: 10000000, onChange: 'adjustStructureGlow', folder: 'Rendering'},
  // Highlights: each class drawn over everything in a colour of its own, whatever the lighting and
  // whatever is in front of it (see src/scene/Highlights.js).
  highlightRing: {value: false, units: '', autoMap: true, onChange: 'adjustHighlights', folder: 'Rendering'},
  highlightRingTethers: {value: false, units: '', autoMap: true, onChange: 'adjustHighlights', folder: 'Rendering'},
  highlightElevators: {value: false, units: '', autoMap: true, onChange: 'adjustHighlights', folder: 'Rendering'},
  highlightMassDrivers: {value: false, units: '', autoMap: true, onChange: 'adjustHighlights', folder: 'Rendering'},
  highlightMassDriverTethers: {value: false, units: '', autoMap: true, onChange: 'adjustHighlights', folder: 'Rendering'},
  highlightLaunchVehicles: {value: false, units: '', autoMap: true, onChange: 'adjustHighlights', folder: 'Rendering'},
  showMoon: {value: defaultShows, units: '', autoMap: true, onChange: 'adjustMoonsVisibility', folder: 'Rendering'},
  showStars: {value: defaultShows, units: '', autoMap: true, onChange: 'adjustStarsVisibility', folder: 'Rendering'},
  showEarthAxis: {value: false, units: '', autoMap: true, onChange: 'earthAxisObjectUpdate', folder: 'Rendering'},
  showEarthEquator: {value: false, units: '', autoMap: true, onChange: 'earthEquatorObjectUpdate', folder: 'Rendering'},
  showMainRingCurve: {value: false, units: '', autoMap: true, onChange: 'mainRingCurveObjectUpdate', folder: 'Rendering'},
  showGravityForceArrows: {value: false, units: '', autoMap: true, onChange: 'gravityForceArrowsUpdate', folder: 'Rendering'},
  showGyroscopicForceArrows: {value: false, units: '', autoMap: true, onChange: 'gyroscopicForceArrowsUpdate', folder: 'Rendering'},
  forceArrowSize: {value: 50000, units: '', autoMap: true, min: 0, max: 1000000, tweenable: true, onChange: 'forceArrowsUpdate', folder: 'Rendering'},
  numForceArrows: {value: 32, units: '', autoMap: true, min: 0, max: 1024, step: 1, onChange: 'forceArrowsUpdate', folder: 'Rendering'},
  showTethers: {value: true, units: '', autoMap: true, onChange: 'adjustRingDesign', folder: 'Rendering'},
  showTransitSystem: {value: defaultShows, units: '', autoMap: true, onChange: 'adjustRingDesign', folder: 'Rendering'},
  showStationaryRings: {value: defaultShows, units: '', autoMap: true, onChange: 'updateTransitsystem', folder: 'Rendering'},
  showMovingRings: {value: false, units: '', autoMap: true, onChange: 'updateTransitsystem', folder: 'Rendering'},
  showStatorMagnets: {value: false, units: '', autoMap: true, onChange: 'updateTransitsystem', folder: 'Rendering'},
  // Note: The following parameter is not the actual speed of the movng rings, but a lower speed selected to make the moving rings motion more visible 
  movingRingsSpeedForRendering: {value: 100, units: '', autoMap: true, min: 0, max: 100000, onChange: 'updateTransitsystem', folder: 'Rendering'},
  showTransitTube: {value: defaultShows, units: '', autoMap: true, onChange: 'updateTransitsystem', folder: 'Rendering'},
  transitTubeOpacity: {value: 0.1, units: '', autoMap: true, onChange: 'updateTransitsystem', folder: 'Rendering'},
  showTransitTracks: {value: defaultShows, units: '', autoMap: true, onChange: 'updateTransitsystem', folder: 'Rendering'},
  showTransitVehicles: {value: defaultShows, units: '', autoMap: true, onChange: 'updateTransitsystem', folder: 'Rendering'},
  showRingTerminuses: {value: defaultShows, units: '', autoMap: true, onChange: 'updateTransitsystem', folder: 'Rendering'},
  showGroundTerminuses: {value: false, units: '', autoMap: true, onChange: 'updateTransitsystem', folder: 'Rendering'},
  showElevatorCables: {value: true, units: '', autoMap: true, onChange: 'adjustRingDesign', folder: 'Rendering'},
  showElevatorCars: {value: defaultShows, units: '', autoMap: true, onChange: 'updateTransitsystem', folder: 'Rendering'},
  showHabitats: {value: defaultShows, units: '', autoMap: true, onChange: 'updateTransitsystem', folder: 'Rendering'},
  showSolarArrays: {value: false, units: '', autoMap: true, onChange: 'updateTransitsystem', folder: 'Rendering'},
  showLaunchTrajectory: {value: false, units: '', autoMap: true, onChange: 'updateLauncher', folder: 'Rendering'},
  showMassDriverTube: {value: massDriverShows, units: '', autoMap: true, onChange: 'updateLauncher', folder: 'Rendering'},
  showLiftFans: {value: massDriverShows, units: '', autoMap: true, onChange: 'updateLauncher', folder: 'Rendering'},
  showMooringCables: {value: massDriverShows, units: '', autoMap: true, onChange: 'updateLauncher', folder: 'Rendering'},
  showMassDriverRail: {value: massDriverShows, units: '', autoMap: true, onChange: 'updateLauncher', folder: 'Rendering'},
  showMassDriverBrackets: {value: massDriverShows, units: '', autoMap: true, onChange: 'updateLauncher', folder: 'Rendering'},
  showMassDriverAccelerationScrews: {value: massDriverShows, units: '', autoMap: true, onChange: 'updateLauncher', folder: 'Rendering'},
  showMassDriverDecelerationScrews: {value: massDriverShows, units: '', autoMap: true, onChange: 'updateLauncher', folder: 'Rendering'},
  saveMassDriverScrewSTL: {value: false, units: '', autoMap: true, onChange: 'updateLauncher', folder: 'Rendering'},
  showEvacuatedTube: {value: false, units: '', autoMap: true, onChange: 'updateLauncher', folder: 'Rendering'},
  showLaunchSleds: {value: massDriverShows, units: '', autoMap: true, onChange: 'updateLauncher', folder: 'Rendering'},
  showAdaptiveNuts: {value: massDriverShows, units: '', autoMap: true, onChange: 'updateLauncher', folder: 'Rendering'},
  showLaunchVehicles: {value: massDriverShows, units: '', autoMap: true, onChange: 'updateLauncher', folder: 'Rendering'},
  showLaunchVehiclePointLight: {value: false, units: '', autoMap: true, onChange: 'updateLauncher', folder: 'Rendering'},
  showMarkers: {value: false, units: '', autoMap: true, onChange: 'updateLauncher', folder: 'Rendering'},
  showTrackingMarkers: {value: false, units: '', autoMap: true, onChange: 'updateLauncher', folder: 'Rendering'},
  trackingMarkerSize: {value: 500, units: '', autoMap: true, min: 0, max: 10000, onChange: 'resizeTrackingMarkers', folder: 'Rendering'},
  showForwardAccelerationVersusTime: {value: true, units: '', autoMap: true, onChange: 'updateLauncher', folder: 'Rendering'},
  showUpwardAccelerationVersusTime: {value: true, units: '', autoMap: true, onChange: 'updateLauncher', folder: 'Rendering'},
  showAltitudeVersusTime: {value: true, units: '', autoMap: true, onChange: 'updateLauncher', folder: 'Rendering'},
  showAirPressureVersusTime: {value: true, units: '', autoMap: true, onChange: 'updateLauncher', folder: 'Rendering'},
  showDownrangeDistanceVersusTime: {value: false, units: '', autoMap: true, onChange: 'updateLauncher', folder: 'Rendering'},
  showAirSpeedVersusTime: {value: true, units: '', autoMap: true, onChange: 'updateLauncher', folder: 'Rendering'},
  showAerodynamicDragVersusTime: {value: true, units: '', autoMap: true, onChange: 'updateLauncher', folder: 'Rendering'},
  showPropellantMassFlowRateVersusTime: {value: true, units: '', autoMap: true, onChange: 'updateLauncher', folder: 'Rendering'},
  showTotalMassVersusTime: {value: true, units: '', autoMap: true, onChange: 'updateLauncher', folder: 'Rendering'},
  showBoosterCH4MassVersusTime: {value: true, units: '', autoMap: true, onChange: 'updateLauncher', folder: 'Rendering'},
  showBoosterLOXMassVersusTime: {value: true, units: '', autoMap: true, onChange: 'updateLauncher', folder: 'Rendering'},
  showShipCH4MassVersusTime: {value: true, units: '', autoMap: true, onChange: 'updateLauncher', folder: 'Rendering'},
  showShipLOXMassVersusTime: {value: true, units: '', autoMap: true, onChange: 'updateLauncher', folder: 'Rendering'},
  showApogeeAltitudeVersusTime: {value: true, units: '', autoMap: true, onChange: 'updateLauncher', folder: 'Rendering'},
  showPerigeeAltitudeVersusTime: {value: true, units: '', autoMap: true, onChange: 'updateLauncher', folder: 'Rendering'},
  showCloseApsisVersusTime: {value: true, units: '', autoMap: true, onChange: 'updateLauncher', folder: 'Rendering'},
  showFarApsisVersusTime: {value: true, units: '', autoMap: true, onChange: 'updateLauncher', folder: 'Rendering'},
  showOrbitalAltitudeVersusTime: {value: true, units: '', autoMap: true, onChange: 'updateLauncher', folder: 'Rendering'},
  showConvectiveHeatingVersusTime: {value: true, units: '', autoMap: true, onChange: 'updateLauncher', folder: 'Rendering'},
  showRadiativeHeatingVersusTime: {value: true, units: '', autoMap: true, onChange: 'updateLauncher', folder: 'Rendering'},
  showHeatShieldTemperatureVersusTime: {value: true, units: '', autoMap: true, onChange: 'updateLauncher', folder: 'Rendering'},
  showDeltaVVersusTime: {value: true, units: '', autoMap: true, onChange: 'updateLauncher', folder: 'Rendering'},
  showOrientationCorrectionVersusTime: {value: true, units: '', autoMap: true, onChange: 'updateLauncher', folder: 'Rendering'},
  showAngularMomentumVectorVersusTime: {value: true, units: '', autoMap: true, onChange: 'updateLauncher', folder: 'Rendering'},
  showEccentricityVersusTime: {value: true, units: '', autoMap: true, onChange: 'updateLauncher', folder: 'Rendering'},
  showRightAscensionOfAscendingNodeVersusTime: {value: true, units: '', autoMap: true, onChange: 'updateLauncher', folder: 'Rendering'},
  showInclinationVersusTime: {value: true, units: '', autoMap: true, onChange: 'updateLauncher', folder: 'Rendering'},
  showArgumentOfPerigeeVersusTime: {value: true, units: '', autoMap: true, onChange: 'updateLauncher', folder: 'Rendering'},
  showTrueAnomalyVersusTime: {value: true, units: '', autoMap: true, onChange: 'updateLauncher', folder: 'Rendering'},
  showSemimajorAxisVersusTime: {value: true, units: '', autoMap: true, onChange: 'updateLauncher', folder: 'Rendering'},
  showPredictedAltitudeVersusTime: {value: true, units: '', autoMap: true, onChange: 'updateLauncher', folder: 'Rendering'},

  animateMovingRingSegments: {value: true, units: '', autoMap: true, onChange: 'updateTransitsystem', folder: 'Rendering'},
  animateElevatorCars: {value: true, units: '', autoMap: true, onChange: 'updateTransitsystem', folder: 'Rendering'},
  animateTransitVehicles: {value: true, units: '', autoMap: true, min: 0, max: 1, onChange: 'updateTransitsystem', folder: 'Rendering'},
  animateLaunchSleds: {value: true, units: '', autoMap: true, min: 0, max: 1, onChange: 'updateLauncher', folder: 'Rendering'},
  animateAdaptiveNuts: {value: true, units: '', autoMap: true, min: 0, max: 1, onChange: 'updateLauncher', folder: 'Rendering'},
  animateLaunchVehicles: {value: true, units: '', autoMap: true, min: 0, max: 1, onChange: 'updateLauncher', folder: 'Rendering'},
  animateElevatedEvacuatedTubeDeployment: {value: false, units: '', autoMap: true, min: 0, max: 1, onChange: 'updateLauncher', folder: 'Rendering'},
  launchTrajectoryVisibility: {value: 1, units: '', autoMap: true, min: 0, max: 1, onChange: 'adjustLaunchTrajectoryOpacity', folder: 'Rendering'},
  trackingMode: {value: 0, units: '', autoMap: true, min: 0, max: 2, onChange: 'updateTrackingMode', folder: 'Rendering'},
  cameraFieldOfView: {value: 45, units: '', autoMap: true, min: 0, max: 90, tweenable: true, onChange: 'updateCamerFieldOfView', folder: 'Rendering'},
  orbitControlsAutoRotate: {value: false, units: '', autoMap: true, onChange: 'updateOrbitControlsRotateSpeed', folder: 'Rendering'},
  orbitControlsRotateSpeed: {value: 0.1, units: '', autoMap: true, min: -10, max: 10, onChange: 'updateOrbitControlsRotateSpeed', folder: 'Rendering'},
  logZoomRate: {value: -2, units: '', autoMap: true, min: -5, max: -1, onChange: 'updateOrbitControlsRotateSpeed', folder: 'Rendering'},
  tweeningDuration: {value: 6000, units: '', autoMap: true, min: 0, max: 1000000, onChange: 'updatedParam', folder: 'Rendering'},
  pKeyAltitudeFactor: {value: 1, units: '', autoMap: true, min: 0, max: 2, onChange: 'updatedParam', folder: 'Rendering'},
  controlCameraFromJsonDuringCapture: {value: false, autoMap: true, onChange: 'updatedParam', folder: 'Rendering'},
  maxBackgroundVideoFrames: {value: 443, autoMap: true, onChange: 'updatedParam', folder: 'Rendering'},
  jsonFileCameraControlHelper: {value: false, autoMap: true, onChange: 'updatedParam', folder: 'Rendering'},
  //showStats: {value: false, units: '', autoMap: true, onChange: 'updateStats', folder: 'Rendering'},
  // showEarthClouds: {value: true, units: '', autoMap: true, onChange: 'adjustEarthCloudsVisibility', folder: 'Rendering'},
  // earthCloudsOpacity: {value: 1, units: '', autoMap: true, min: 0, max: 1, onChange: 'adjustEarthCloudsOpacity', folder: 'Rendering'},
  verboseLogging: {value: true, units: '', autoMap: true, folder: 'Rendering'},
    cameraPreset: {value: 'Default', units: '', autoMap: false, options: Object.keys(cameraPresets), folder: 'Camera'},
    tetherColor: {value: '#8699c6', units: '', autoMap: false, onChange: 'adjustTetherOpacity', folder: 'Rendering'},
    tetherFiber: {value: tetherFibers.CarbonFiber, units: '', autoMap: false, options: tetherFibers, onChange: 'adjustRingDesign', folder: 'Materials'},
    coilConductorMaterial: {value: coilConductorMaterials.Aluminum, units: '', autoMap: false, options: coilConductorMaterials, onChange: 'adjustRingDesign', folder: 'Materials'},
  }
}
