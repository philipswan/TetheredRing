import { Vector3 } from 'three'

// These factors belong only to render transforms. Never feed them back into
// geometry sizing, trajectory design, terrain fitting or engineering costs.
export function launcherVisualScales(params) {
  return { radius: params.launcherVisualRadiusScale?.value ?? 1,
    length: params.launcherVisualLengthScale?.value ?? 1 }
}
export function resetLauncherVisualScale(model) {
  if (model._physicalRenderScale) model.scale.copy(model._physicalRenderScale)
}
export function applyLauncherVisualScale(model, factors, pivot = model.position) {
  if (!factors) return
  model._physicalRenderScale ??= model.scale.clone()
  resetLauncherVisualScale(model)
  const scale = new Vector3(factors.radius, factors.length, factors.radius)
  const offset = pivot.clone().sub(model.position).applyQuaternion(model.quaternion.clone().invert())
    .multiply(scale).applyQuaternion(model.quaternion)
  model.position.copy(pivot).sub(offset)
  model.scale.multiply(scale)
}
