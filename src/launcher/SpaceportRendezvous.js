import {spaceportAtmosphere} from './spaceportAtmosphere.js'
import * as THREE from 'three'
import { CatmullRomSuperCurve3, quaternionFromFrame } from '../curves/SuperCurves.js'
import { createSpaceportMission } from './spaceportOrbit.js'

export function configureSpaceportFlight(launcher, params, planet, position, velocity, specs, chartData = null) {
  launcher.spaceportStation?.dispose()
  launcher.spaceportStation = null
  launcher.spaceportMission = null
  if (!params.spaceportRendezvousEnabled?.value) return
  const mission = createSpaceportMission({ position, velocity, mu: planet.gravitationalParameter,
    omega: 2 * Math.PI / planet.lengthOfSiderealDay, deficit: params.spaceportVelocityDeficit.value,
    stationLength: params.spaceportStationLength.value, acceleration: params.spaceportCaptureAcceleration.value })
  const tubeTime = launcher.timeWithinEvacuatedTube
  const atmosphere = spaceportAtmosphere(mission, planet, params, launcher.planetRadius, tubeTime)
  mission.atmosphere = atmosphere
  launcher.propellantConsumed = atmosphere.consumed
  launcher.remainingPropellantAfterFreeFlight = atmosphere.remaining
  launcher.payloadPlusRemainingPropellant = params.launchVehiclePayloadMass.value + atmosphere.remaining
  const dryMass = params.launchVehicleEmptyMass.value + params.launchVehiclePayloadMass.value
  launcher.massFraction = (dryMass + atmosphere.remaining) / (dryMass + params.launchVehiclePropellantMass.value)
  launcher.payloadFraction = params.launchVehiclePayloadMass.value / (dryMass + params.launchVehiclePropellantMass.value)
  launcher.energyLostToDragWhileInAtmosphere = atmosphere.dragEnergy
  launcher.rocketTotalDeltaV = atmosphere.deltaV
  const duration = mission.duration - tubeTime, count = Math.max(256, Math.ceil(duration / 2))
  const times = [...new Set([
    ...Array.from({length: count + 1}, (_, i) => duration * i / count),
    mission.apogeeTime - tubeTime, mission.apogeeTime + mission.captureDuration - tubeTime,
  ].filter(t => t >= 0 && t <= duration))].sort((a, b) => a - b)
  const states = times.map(t => mission.stateAt(tubeTime + t))
  const points = states.map(state => state.position)
  const distances = [0]
  for (let i = 1; i < points.length; i++) distances.push(distances[i - 1] + points[i].distanceTo(points[i - 1]))
  const curve = new CatmullRomSuperCurve3(points)
  curve.name = 'freeFlightPositionCurve'; curve.curveType = 'centripetal'; curve.setAlwaysAwayNormalMode()
  curve.setDuration(duration)
  const sampleIndex = t => {
    t = Math.max(0, Math.min(duration, t))
    let lo = 0, hi = times.length - 1
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1
      if (times[mid] <= t) lo = mid; else hi = mid
    }
    return lo + (t - times[lo]) / (times[hi] - times[lo])
  }
  curve.addtToiConvertor(t => sampleIndex(t) / (times.length - 1))
  curve.addtTodConvertor(t => {
    const x = sampleIndex(t), i = Math.min(times.length - 2, Math.floor(x))
    return THREE.MathUtils.lerp(distances[i], distances[i + 1], x - i)
  })
  curve.addtTosConvertor(t => mission.stateAt(tubeTime + Math.max(0, Math.min(duration, t))).velocity.length())
  // Direct time telemetry also works on the analytic continuation, after the
  // sampled drawing curve ends. x/y/z retain the legacy speed/drag/flow layout.
  curve.telemetryAtTime = t => {
    const air = atmosphere.at(tubeTime + t)
    return new THREE.Vector3(air.airSpeed, air.drag, air.massFlowRate)
  }
  curve.specificForceAt = t => {
    const tau = tubeTime + t
    if (tau < mission.apogeeTime) return new THREE.Vector3()
    const state = mission.stateAt(tau), inertial = mission.inertialAt(tau)
    const radial = state.position.clone().normalize()
    const axis = mission.stationAt(tau).axis, tangent = new THREE.Vector3().crossVectors(axis, radial)
    const speed = inertial.velocity.length()
    return radial.multiplyScalar(planet.gravitationalParameter / mission.radius ** 2 - speed ** 2 / mission.radius)
      .addScaledVector(tangent, tau < mission.apogeeTime + mission.captureDuration ? params.spaceportCaptureAcceleration.value : 0)
  }
  launcher.freeFlightPositionCurve = curve
  launcher.durationOfFreeFlight = duration
  launcher.spaceportMission = mission
  launcher.spaceportReleaseTime = launcher.timeWithinFeederRail + launcher.timeWithinMassDriver1 + launcher.timeWithinMassDriver2 + launcher.launchVehicleTimeWithinRamp
  // Raise only the station's display, consistently throughout the scene.
  // The spacecraft stays on its physical trajectory, including during approach.
  const stationDisplayLift = 3500 + params.launchVehicleRadius.value * (params.launcherVisualRadiusScale?.value ?? 1) + 1000
  launcher.spaceportStation = new SpaceportStation(launcher.scene, mission, stationDisplayLift)
  specs.spaceportDragCompensationPropellant = {value: atmosphere.consumed, units: 'kg'}
  specs.spaceportPeakRocketFlow = {value: atmosphere.peakFlow, units: 'kg/s'}
  specs.spaceportPeakAerodynamicDrag = {value: atmosphere.peakDrag, units: 'N'}
  specs.spaceportApogeeAltitude = {value: mission.radius - launcher.planetRadius, units: 'm'}
  specs.spaceportApogeeSpeed = {value: mission.entrySpeed, units: 'm/s'}
  specs.spaceportCircularOrbitSpeed = {value: mission.circularSpeed, units: 'm/s'}
  specs.spaceportVelocityDeficit = {value: mission.deltaV, units: 'm/s'}
  specs.spaceportRendezvousTime = {value: launcher.spaceportReleaseTime + mission.apogeeTime, units: 's'}
  specs.spaceportStationCaptureTime = {value: mission.captureDuration, units: 's'}
  specs.spaceportStationCaptureTrackLength = {value: mission.captureDistance, units: 'm'}
  specs.spaceportStationEndMargin = {value: mission.endMargin, units: 'm'}
  if (chartData) {
    const start = launcher.spaceportReleaseTime + tubeTime
    for (const series of Object.values(chartData)) while (series.length && series.at(-1).x >= start) series.pop()
    const chartTimes = [...new Set([...Array.from({length: Math.ceil(duration * 4) + 1}, (_, i) => Math.min(duration, i / 4)),
      mission.apogeeTime - tubeTime, mission.apogeeTime + mission.captureDuration - tubeTime])].sort((a, b) => a - b)
    for (const time of chartTimes) {
      const tau = tubeTime + time, air = atmosphere.at(tau)
      const capturing = tau >= mission.apogeeTime && tau < mission.apogeeTime + mission.captureDuration
      const speed = mission.inertialAt(tau).velocity.length()
      const values = {altitude: air.altitude, pressure: planet.airPressureAtAltitude(air.altitude), airSpeed: air.airSpeed,
        drag: air.drag, flow: air.massFlowRate, mass: dryMass + params.launchVehiclePropellantMass.value - atmosphere.consumedAt(tau),
        forwardAcceleration: capturing ? params.spaceportCaptureAcceleration.value : 0,
        upwardAcceleration: tau >= mission.apogeeTime ? planet.gravitationalParameter / mission.radius ** 2 - speed ** 2 / mission.radius : 0}
      for (const [key, series] of Object.entries(chartData)) series.push(new THREE.Vector3(start + time, values[key], 0))
    }
  }
}

class SpaceportStation {
  constructor(parent, mission, visualAltitudeOffset = 0) {
    this.mission = mission
    this.visualAltitudeOffset = visualAltitudeOffset
    this.root = new THREE.Group(); this.root.name = 'spaceportStation'
    parent.add(this.root)
    const arc = []
    for (let i = 0; i <= 80; i++) {
      const angle = (i / 80 - 0.5) * mission.stationLength / mission.radius
      arc.push(new THREE.Vector3(0, mission.radius * Math.sin(angle), mission.radius * (Math.cos(angle) - 1)))
    }
    const rail = new THREE.CatmullRomCurve3(arc)
    const material = new THREE.MeshBasicMaterial({color: 0x42e7ff})
    const core = new THREE.Mesh(new THREE.TubeGeometry(rail, 160, 3500, 8, false), material)
    core.name = 'spaceportCaptureTrack'; this.root.add(core)
    const panels = new THREE.MeshBasicMaterial({color: 0x3855aa, side: THREE.DoubleSide})
    for (let i = 0; i < 12; i++) {
      const u = (i + 0.5) / 12, point = rail.getPoint(u)
      const panel = new THREE.Mesh(new THREE.BoxGeometry(30000, 5000, 1000), panels)
      panel.position.copy(point); this.root.add(panel)
    }
    const leading = new THREE.Object3D()
    leading.position.copy(arc.at(-1)); leading.name = 'spaceportLeadingEdge'; this.root.add(leading)
    const captureEntry = new THREE.Object3D()
    const entryAngle = (mission.stationLength / 2 - mission.endMargin) / mission.radius
    captureEntry.position.set(0, mission.radius * Math.sin(entryAngle), mission.radius * (Math.cos(entryAngle) - 1))
    captureEntry.name = 'spaceportCaptureEntry'; this.root.add(captureEntry)
    this.update(0)
  }
  frameAt(time) {
    const state = this.mission.stationAt(time)
    const up = state.centre.position.clone().normalize()
    const forward = new THREE.Vector3().crossVectors(state.axis, up).normalize()
    return {position: state.centre.position.clone().addScaledVector(up, this.visualAltitudeOffset),
      forward, upward: up}
  }
  update(time) {
    const frame = this.frameAt(time)
    this.root.position.copy(frame.position)
    this.root.quaternion.copy(quaternionFromFrame(frame.forward, frame.upward))
  }
  dispose() {
    const materials = new Set()
    this.root.traverse(node => { node.geometry?.dispose(); if (node.material) materials.add(node.material) })
    for (const material of materials) material.dispose()
    this.root.removeFromParent()
  }
}

// Fit the launch path and the station's complete sweep, using a camera to the
// side and above the orbital plane so Earth does not hide the surface track.
export function spaceportOverview(launcher, fov = 45, aspect = 16 / 9) {
  const mission = launcher.spaceportMission, points = []
  for (const curve of [launcher.feederRailCurve, launcher.massDriver1Curve,
    launcher.massDriver2Curve, ...launcher.launchRampCurve, launcher.evacuatedTubeCurve]) {
    if (!curve) continue
    for (let i = 0; i <= 40; i++) points.push(curve.getPointAt(i / 40))
  }
  for (let i = 0; i <= 160; i++) {
    const t = mission.duration * i / 160
    points.push(mission.stateAt(t).position)
    const station = mission.stationAt(t)
    points.push(station.leading.position, station.centre.position)
  }
  const bounds = new THREE.Box3().setFromPoints(points)
  const target = bounds.getCenter(new THREE.Vector3())
  const up = target.clone().normalize()
  const view = mission.axis.clone().addScaledVector(up, 0.25).normalize()
  const right = new THREE.Vector3().crossVectors(up, view).normalize()
  const cameraUp = new THREE.Vector3().crossVectors(view, right).normalize()
  const tanY = Math.tan(fov * Math.PI / 360), tanX = tanY * aspect * 0.72
  let distance = 0
  for (const point of points) {
    const offset = point.clone().sub(target)
    distance = Math.max(distance, offset.dot(view) + Math.abs(offset.dot(right)) / tanX,
      offset.dot(view) + Math.abs(offset.dot(cameraUp)) / tanY)
  }
  distance = distance * 1.15 + 100000
  // Leave space for the shot editor at the left of the viewport.
  target.addScaledVector(right, -distance * tanY * aspect * 0.22)
  return {target, position: target.clone().addScaledVector(view, distance), up: cameraUp}
}

// Keep the finite sampled path for drawing and zone allocation, but continue the
// spacecraft analytically throughout free flight and indefinitely after capture.
// Event samples are unevenly spaced; interpolating them as a Catmull-Rom spline
// perturbs velocity near capture completion and makes a tracking camera jerk.
export function attachSpaceportContinuation(launcher) {
  const path = launcher.polyCurveForrf4, mission = launcher.spaceportMission
  if (!mission) return
  const curve = launcher.freeFlightPositionCurve
  const startTime = launcher.spaceportReleaseTime + launcher.timeWithinEvacuatedTube
  path.continuationStartTime = startTime
  path.continuation = deltaT => {
    const state = mission.stateAt(deltaT - launcher.spaceportReleaseTime)
    const forward = state.velocity.clone().normalize()
    const upward = state.position.clone().normalize()
    upward.addScaledVector(forward, -upward.dot(forward)).normalize()
    return {point: state.position, forward, upward, curve, t: deltaT - startTime,
      i: 1, d: 1, distance: curve.getLength(), byT: false, egress: false,
      res: {relevantCurve: curve, relevantCurveStartTime: startTime,
        relevantCurveLength: curve.getLength(), relevantCurveStartDistance: path.getLength() - curve.getLength()}}
  }
}
