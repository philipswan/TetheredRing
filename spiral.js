const TWO_PI = 2 * Math.PI

// Stable exact arc length for r(θ) = r0 + a θ
// S(θ) = (1/(2|a|)) * [ r*h + a^2 * asinh(r/a) ]  - same at θ=0
// Stable exact arc length for r(θ) = r0 + a θ
function arcLength(theta, r0, a) {
  if (a === 0) return r0 * theta
  const F = (t) => {
    const r = r0 + a * t
    const h = Math.hypot(r, a) // sqrt(r^2 + a^2)
    return 0.5 * (r * h + a * a * Math.asinh(r / a))
  }
  // IMPORTANT: divide by a (signed), not |a|
  return (F(theta) - F(0)) / a
}

// Invert S(θ)=s on a known bracket [0, thetaHi] via bisection
function thetaFromArcLength(s, r0, a, tol = 1e-15) {
  if (s <= 0) return 0
  if (a === 0) return s / r0

  // start near the a=0 estimate and then force a valid bracket
  let lo = 0
  let hi = Math.max(s / Math.max(r0, 1e-12), 1e-9)

  // grow hi until we bracket the target: S(hi) >= s
  while (arcLength(hi, r0, a) < s) {
    hi *= 2
    if (hi > 1e12) break
  }

  // (optional) one Newton step from θ0 = s/r0 to speed convergence
  let theta = Math.min(hi, s / Math.max(r0, 1e-12))
  {
    const r = r0 + a * theta
    const S = arcLength(theta, r0, a)
    const dS = Math.hypot(r, a) // dS/dθ
    const cand = theta - (S - s) / dS
    if (cand > lo && cand < hi && Number.isFinite(cand)) theta = cand
  }

  // bisection polish on [lo, hi] with an iteration cap
  for (let i = 0; i < 200; i++) {
    const mid = 0.5 * (lo + hi)
    const Smid = arcLength(mid, r0, a)
    if (Smid < s) lo = mid
    else hi = mid
    if (hi - lo <= tol) break
  }

  return 0.5 * (lo + hi)
}

/**
 * API unchanged: (spiralParams, arcPosition, spiralLength)
 * Treat arcPosition as a FRACTION of total length. If your caller passes a distance,
 * change the next line to: const s = arcPosition
 */
export function getSpiralCoordinates(r0, rInc, spiralPosition) {
  const dr_dtheta = rInc / TWO_PI
  const theta = thetaFromArcLength(spiralPosition, r0, dr_dtheta)
  const r = r0 + dr_dtheta * theta
  return {
    x: r * Math.cos(theta) - r0,
    y: r * Math.sin(theta),
  }
}
