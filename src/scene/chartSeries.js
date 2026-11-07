// Parameter keys are retained so existing shot projects keep their curve selections.
export const CHART_SERIES = [
  ['ForwardAcceleration', 'Forward Acceleration'], ['UpwardAcceleration', 'Upward Acceleration'],
  ['Altitude', 'Altitude'], ['AirPressure', 'Air Pressure'], ['DownrangeDistance', 'Downrange Distance'],
  ['AirSpeed', 'Air Speed'], ['AerodynamicDrag', 'Aerodynamic Drag'],
  ['PropellantMassFlowRate', 'Propellant Mass Flow Rate'], ['TotalMass', 'Vehicle Mass'],
  ['BoosterCH4Mass', 'Booster CH4 Mass'], ['BoosterLOXMass', 'Booster LOX Mass'],
  ['ShipCH4Mass', 'Ship CH4 Mass'], ['ShipLOXMass', 'Ship LOX Mass'],
  ['ApogeeAltitude', 'Orbital Apogee Altitude'], ['PerigeeAltitude', 'Orbital Perigee Distance'],
  ['CloseApsis', 'Close Apsis'], ['FarApsis', 'Far Apsis'], ['OrbitalAltitude', 'Orbital Altitude'],
  ['ConvectiveHeating', 'Convective Heating'], ['RadiativeHeating', 'Radiative Heating'],
  ['HeatShieldTemperature', 'Heat Shield Temperature'], ['DeltaV', 'Delta-V'],
  ['OrientationCorrection', 'Orientation Correction'], ['AngularMomentumVector', 'Angular Momentum Vector'],
  ['Eccentricity', 'Eccentricity'], ['RightAscensionOfAscendingNode', 'Right Ascension Of Ascending Node'],
  ['Inclination', 'Inclination'], ['ArgumentOfPerigee', 'Argument Of Perigee'], ['TrueAnomaly', 'True Anomaly'],
  ['SemimajorAxis', 'Semimajor Axis'], ['PredictedAltitude', 'Predicted Altitude'],
  ['LaunchVehicleAccelerationDirection', 'Vehicle load direction'],
  ['LaunchVehicleAccelerationMagnitude', 'Vehicle load magnitude'],
  ['CrewFrontBackAcceleration', 'Crew front-to-back acceleration'], ['CrewSidewaysAcceleration', 'Crew sideways acceleration'],
  ['GrapplerEngagement', 'Grapplers engaged'], ['GrapplerAngle', 'Grappler 1 angle'],
  ['GrapplerLift', 'Grappler 1 lift'], ['GrapplerRadialTravel', 'Grappler 1 radial travel'],
].map(([id, name], index) => ({ key: `show${id}VersusTime`, name, index }))
export const chartSeries = name => CHART_SERIES.find(series => series.name === name)
