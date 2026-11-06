import { Vector3, Quaternion } from 'three'

const nose = new Vector3(0, 1, 0)
const roof = new Vector3(0, 0, 1)

// Proper acceleration: what an accelerometer and the passengers feel. Gravity is subtracted once;
// centripetal acceleration is part of a_inertial, never added again as an independent real force.
export function specificForceAt(curve, t, planetSpec) {
  if (curve.specificForceAt) return curve.specificForceAt(t)
  if (curve.name === 'elevatedEvacuatedTube' || curve.name === 'coiledElevatedEvacuatedTube') return new Vector3()
  const distance = curve.tTod(t), length = curve.getLength()
  const u = length > 0 ? Math.max(0, Math.min(1, distance / length)) : 0
  const position = curve.getPointAt(u), tangent = curve.getTangentAt(u).normalize()
  const speed = curve.tTos(t), radius = position.length()
  const omega = new Vector3(0, 2 * Math.PI / planetSpec.lengthOfSiderealDay, 0)
  const dt = 0.001, duration = curve.getDuration()
  const before = Math.max(0, t - dt), after = Math.min(duration, t + dt)
  const dv = after > before ? (curve.tTos(after) - curve.tTos(before)) / (after - before) : 0
  const relative = tangent.clone().multiplyScalar(dv).addScaledVector(position, -(speed ** 2) / radius ** 2)
  return relative.add(new Vector3().crossVectors(omega, tangent.clone().multiplyScalar(2 * speed)))
    .add(new Vector3().crossVectors(omega, new Vector3().crossVectors(omega, position)))
    .addScaledVector(position, planetSpec.gravitationalParameter / radius ** 3)
}

export function capsuleLoad(force, vehicleOrientation) {
  const local = force.clone().applyQuaternion(vehicleOrientation.clone().invert())
  const magnitude = local.length()
  // At zero g there is no load direction; retain the ramp-exit (roof-facing) rest attitude.
  const orientation = new Quaternion().setFromUnitVectors(nose, magnitude > 1e-7 ? local.clone().divideScalar(magnitude) : roof)
  const experienced = local.clone().applyQuaternion(orientation.clone().invert())
  return { orientation, magnitude, direction: magnitude > 1e-7 ? Math.atan2(local.z, local.y) * 180 / Math.PI : 90,
    frontBack: experienced.y, sideways: Math.hypot(experienced.x, experienced.z) }
}
