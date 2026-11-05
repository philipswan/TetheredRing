import { getSpiralCoordinates } from './spiral.js'
import { MovingVirtualObject } from './VirtualObject.js'
import { curvePointsUpTo } from './LaunchTrajectoryUtils.js'

// Used for modelRange until the App has reported the real value (1080 px high, 45 degree field of view).
const DEFAULT_PIXELS_PER_RADIAN = 1300

// Marks the zones of `refFrame` that are within the camera range. Each sub-curve of the reference
// frame's path reports the [start, finish] arc-length fractions that are inside the camera's sphere;
// the matching zones of that sub-curve are marked (ranges are kept per sub-curve, so a path that
// enters the sphere more than once is handled).
function computeVisibleZones(refFrame, cameraPosition, visibleZones) {
  visibleZones.fill(0)
  const path = refFrame.curve
  path.superCurves.forEach((superCurve, index) => {
    const range = superCurve.getStartFinishZoneIndices(cameraPosition, refFrame.cameraRange)
    if (range.length !== 2) return
    const numZones = path.numZones[index]
    const startZone = path.startZone[index]
    const clampZone = (d) => startZone + Math.max(0, Math.min(numZones - 1, Math.floor(d * numZones)))
    const szi = clampZone(Math.min(range[0], range[1]))
    const fzi = clampZone(Math.max(range[0], range[1]))
    for (let z = szi; z <= fzi; z++) visibleZones[z] = 1
  })
}

export function defineAnimate () {

  // animate() is a pure function of (parameters, timeSinceStart, camera position, deployment alpha):
  // it uses no wall-clock time, random numbers or frame counts.
  return function (timeSinceStart, cameraPosition, elevatedEvacuatedTubeDeploymentAlpha) {

    if (this.animateElevatedEvacuatedTubeDeployment && this.coiledElevatedEvacuatedTubeCurve &&
        (elevatedEvacuatedTubeDeploymentAlpha !== this.lastElevatedEvacuatedTubeDeploymentAlpha)) {
      this.updateCoiledEvacuatedTube(elevatedEvacuatedTubeDeploymentAlpha)
      this.lastElevatedEvacuatedTubeDeploymentAlpha = elevatedEvacuatedTubeDeploymentAlpha
    }

    const animateTime = this.animateLaunchVehicles || this.animateLaunchSleds || this.animateAdaptiveNuts
    const frameTime = animateTime ? timeSinceStart : this.frozenTimeSinceStart

    this.refFrames.forEach(refFrame => {
      refFrame.timeSinceStart = frameTime

      // Which zones are near the camera this frame?
      if (!refFrame.visibleZones || refFrame.visibleZones.length !== refFrame.numZones) {
        refFrame.visibleZones = new Uint8Array(refFrame.numZones)
        refFrame.prevVisibleZones = new Uint8Array(refFrame.numZones)
        refFrame.forceVisibilityRefresh = true
      }
      const tmp = refFrame.prevVisibleZones
      refFrame.prevVisibleZones = refFrame.visibleZones
      refFrame.visibleZones = tmp
      computeVisibleZones(refFrame, cameraPosition, refFrame.visibleZones)
      const visible = refFrame.visibleZones
      const prevVisible = refFrame.prevVisibleZones
      const force = refFrame.forceVisibilityRefresh
      refFrame.forceVisibilityRefresh = false

      const classes = this.objectClasses.filter(c => c.refFrames.includes(refFrame))

      // Static objects live in fixed zones: hand out / take back models only where visibility changed.
      classes.forEach(objectClass => {
        if (objectClass.prototype instanceof MovingVirtualObject) return
        const name = objectClass.className
        // Classes with a modelRange (m, from the on-screen scale) only give models to objects that close.
        // Zones are kilometres long, so without it every object in a nearby zone got a model.
        const modelRange = objectClass.modelRange?.(this.pixelsPerRadian ?? DEFAULT_PIXELS_PER_RADIAN)
        for (let z = 0; z < refFrame.numZones; z++) {
          const isVisible = visible[z] === 1 && objectClass.isVisible
          const changed = force || (visible[z] !== prevVisible[z])
          const list = refFrame.wedges[z][name]
          if (!list || list.length === 0) continue
          if (isVisible && modelRange !== undefined) {
            list.forEach(obj => {
              if (objectClass.hasChanged || !obj.approximatePosition) obj.approximatePosition = refFrame.curve.getPointAt(obj.d)
              const near = obj.approximatePosition.distanceTo(cameraPosition) <= modelRange
              if (near && !obj.model) {
                obj.model = objectClass.acquireModel(obj, refFrame)
                if (obj.model) obj.placeAndOrientModel(obj.model, refFrame)
              }
              else if (!near && obj.model) {
                objectClass.releaseModel(obj.model)
                obj.model = null
              }
              else if (obj.model && (objectClass.isDynamic || objectClass.hasChanged)) {
                obj.placeAndOrientModel(obj.model, refFrame)
              }
            })
          }
          else if (changed) {
            list.forEach(obj => {
              if (isVisible && !obj.model) {
                obj.model = objectClass.acquireModel(obj, refFrame)
                if (obj.model) obj.placeAndOrientModel(obj.model, refFrame)
              }
              else if (!isVisible && obj.model) {
                objectClass.releaseModel(obj.model)
                obj.model = null
              }
            })
          }
          else if (isVisible && (objectClass.isDynamic || objectClass.hasChanged)) {
            list.forEach(obj => { if (obj.model) obj.placeAndOrientModel(obj.model, refFrame) })
          }
        }
      })

      // Moving objects: derive the objects in flight from the time, then allocate/place their models.
      classes.forEach(objectClass => {
        if (objectClass.prototype instanceof MovingVirtualObject) objectClass.syncToTime(refFrame, visible)
      })
    })

    // Clear all of the "hasChanged" flags
    this.objectClasses.forEach(objectClass => {
      objectClass.hasChanged = false
    })

    // The vehicles' plasma trails and exhaust plumes, from the launches now in flight
    this.glow.update()
  }
}

// Reshapes the coiled elevated evacuated tube for deployment fraction `elevatedEvacuatedTubeDeploymentAlpha`
// and rebuilds only the visible tube segments that lie on it.
export function defineUpdateCoiledEvacuatedTube() {
  return function (elevatedEvacuatedTubeDeploymentAlpha) {
    const originalTubeLength = this.evacuatedTubeCurve.getLength()
    // The coiled curve follows the original curve to fraction "alpha" of its length (point A), after which it
    // spirals around a point that is r0 to the side of A.
    // "alpha" is the extent to which the tube is uncoiled.
    // "alpha2" is the extent to which the coiled tube is elevated above its landing platform.
    // "neverCoiledPortion" is the portion of the tube near the base that always remains uncoiled. It is also
    // the split between time spent levitating the coiled tube vertically off its platform and unwinding the coil.
    const neverCoiledPortion = 0.05
    const alpha = Math.max(neverCoiledPortion, Math.min(1, elevatedEvacuatedTubeDeploymentAlpha))
    const alpha2 = 1 - Math.min(neverCoiledPortion, Math.max(0, elevatedEvacuatedTubeDeploymentAlpha)) / neverCoiledPortion
    const r0 = 2000 // m - inner radius of the coiled elevated evacuated tube
    const rInc = -50 // m - distance between adjacent turns of the coil
    const A = this.evacuatedTubeCurve.getPointAt(alpha)
    const tangent = this.evacuatedTubeCurve.getTangentAt(alpha)
    const biNormal = tangent.clone().cross(A.clone().normalize()).normalize()
    const P0 = this.evacuatedTubeCurve.getPointAt(0)
    const P0Length = P0.length()
    const totalNumberOfNewPoints = 4096
    const points = []
    const coilCenterPoint = A.clone().add(biNormal.clone().multiplyScalar(-r0))
    const coilCenterPointLength = coilCenterPoint.length()

    for (let i = 0; i<totalNumberOfNewPoints; i++) {
      const alphaI = i / (totalNumberOfNewPoints - 1)
      let P
      if (alphaI <= alpha) {
        P = this.evacuatedTubeCurve.getPointAt(alphaI)
      }
      else {
        const spiralPosition = (alphaI - alpha) * originalTubeLength
        const spiralXY = getSpiralCoordinates(r0, rInc, spiralPosition)
        P = A.clone()
          .addScaledVector(biNormal, spiralXY.x)
          .addScaledVector(tangent, spiralXY.y)
      }
      const PLength = P.length()
      const scaleBy = (P0Length-3*(PLength-P0Length)*alpha2)/P0Length  // lowers the coiled tube to the ground
      points.push(P.multiplyScalar(scaleBy))
    }

    const scaleBy = (P0Length-3*(coilCenterPointLength-P0Length)*alpha2)/P0Length
    this.coilCenterMarker.position.copy(coilCenterPoint.multiplyScalar(scaleBy))

    this.coiledElevatedEvacuatedTubeCurve.setPoints(points)
    this.coiledElevatedEvacuatedTubeCurve.updateArcLengths()
    // The paths that contain the coiled curve cache their sub-curve lengths; refresh them.
    ;[this.polyCurveForrf3, this.polyCurveForrf4].forEach(path => { if (path) path.updateArcLengths() })

    // Only rebuild visible tube segments that lie on the coiled part (from the uncoil point onward).
    // Segments that are not visible have no model; they are built from the current curve when they become visible.
    const path = this.polyCurveForrf3
    const total = path.getLength()
    const coiledStart = path.findRelevantCurveAt(1).relevantCurveStartPosition + alpha * this.coiledElevatedEvacuatedTubeCurve.getLength()
    const segmentD = 1 / Math.max(1, this.massDriverTubeSegments)
    const minD = (total > 0) ? coiledStart / total - segmentD : 0
    this.updateMassDriverTubes(minD, 1)

    // The launch sled's track runs inside the tube up to the exit airlock: reshape it with the tube, and
    // rebuild the visible rails on the coiled part.
    const track = this.launchSledBrakingCurve
    const sledPath = this.polyCurveForrf2
    if (track && sledPath?.superCurves.includes(track)) {
      track.setPoints(curvePointsUpTo(this.coiledElevatedEvacuatedTubeCurve, this.sledTrackFraction))
      track.updateArcLengths()
      sledPath.updateArcLengths()
      const trackStart = sledPath.findRelevantCurveAt(1).relevantCurveStartPosition
      const railD = 1 / Math.max(1, this.massDriverRailSegments)
      const railMinD = (trackStart + alpha * this.coiledElevatedEvacuatedTubeCurve.getLength()) / sledPath.getLength() - railD
      this.updateStaticModels(this.objectClasses.find(c => c.className === 'virtualMassDriverRails'), railMinD, 1)
    }
  }
}

export function defineUpdateMassDriverTubes() {
  return function (minD = 0, maxD = 1) {
    this.updateStaticModels(this.virtualMassDriverTube, minD, maxD)
  }
}

// Rebuilds the models of the static objects of `objectClass` (tubes, rails) between path fractions minD and
// maxD that have models (are visible), from the current shape of their path.
export function defineUpdateStaticModels() {
  return function (objectClass, minD = 0, maxD = 1) {
    if (!(objectClass?.numObjects > 0)) return
    const objectName = objectClass.className
    objectClass.refFrames.forEach(refFrame => {
      refFrame.wedges.forEach(wedge => {
        const wedgeList = wedge[objectName]
        if (!wedgeList) return
        wedgeList.forEach(vobj => {
          if (vobj.model && vobj.d >= minD && vobj.d <= maxD) {
            // Replace the model with one fitted to the new shape of the curve (and dispose the old one)
            objectClass.releaseModel(vobj.model)
            vobj.model = objectClass.acquireModel(vobj, refFrame)
            vobj.position = null
            if (vobj.model) vobj.placeAndOrientModel(vobj.model, refFrame)
          }
        })
      })
    })
  }
}
