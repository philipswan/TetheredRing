// What the user means a camera gesture to be about.
//
// At the start of each gesture (a drag, a burst of zooming, a double-click) every candidate is scored
// and the best one is what the gesture acts on: a moving object is taken hold of and followed; a
// structure or the ground becomes the point the camera orbits, zooms towards or grabs. A candidate is
//
//   { kind: 'object' | 'structure' | 'ground', point (THREE.Vector3, world), distance (m from the camera),
//     px (pixels from the pointer on screen), apparentPx (how big it looks, pixels across), type (objects:
//     the anchor type), tag (structures: the Highlights class, e.g. 'ring'), key (objects: anchorKey),
//     tracked (the object the camera follows now) }
//
// The score multiplies
//   - a prior for the kind of thing: launch vehicles over other moving objects, those over the mass
//     driver and elevators, those over the ring, all well over the ground (which is always somewhere
//     under the pointer, tens of km behind a thin rail);
//   - how big it looks: things a few tens to hundreds of pixels across are what can be worked with, so
//     from far away the whole ring (sized by its extent) is meant, and close up the parts of it and the
//     vehicles on it (sized by their own bounds), while the whole ring, filling far more than the view,
//     fades out;
//   - how near the pointer it is on screen (a Gaussian, whose width grows with the affinity below, so
//     what the user has been working with draws the pointer from further away: it is magnetic);
//   - how fast the gesture began: a fast flick is a big move of the view, so it leans towards the ground
//     (the whole scene) over small nearby things, enough to settle a close call but not to override a
//     structure right at the pointer; a slow, careful start leans the other way;
//   - a strong boost for a double-click on an object (the clearest way to say "that one"), and for the
//     object already followed (it is sticky: only another object scoring higher takes over);
//   - 1 + AFFINITY_PULL * the affinity: a memory of what was interacted with, raised by every gesture about it (more for
//     long ones, much more for double-clicks) and fading with a half-life of AFFINITY_HALF_LIFE_MS.
//
// Everything here is plain arithmetic on the candidates the camera controller gathers, so the weighting
// can be tuned (and tested) on its own.

export const PRIORS = {
  launchVehicle: 3.5,
  launchSled: 2.5,
  adaptiveNut: 2.5,
  transitVehicle: 2.5,
  elevatorCar: 2.5,
  object: 2.5, // other moving objects
  ground: 0.25,
}
// Structures, by their Highlights class (src/scene/Highlights.js).
export const STRUCTURE_PRIORS = {
  launchVehicle: 3,
  massDriver: 2,
  elevators: 2,
  ring: 1.5,
  tethers: 0.8,
  massDriverTethers: 0.8,
  other: 1.2,
}
// How big a thing looks (pixels across) when it is best to work with, and how the preference falls off
// (in natural-log units) either side: steeply below (a thing a pixel across is rarely what is meant:
// something bigger it is part of is), gently above and never below LARGE_FLOOR (something filling the
// view is still a better guess than the ground behind it; it just yields to the parts of it that fit).
export const BEST_APPARENT_PX = 80
export const SMALL_SPREAD = 1.2
export const LARGE_SPREAD = 3
export const LARGE_FLOOR = 0.3
export function sizeWeight(apparentPx) {
  if (!(apparentPx > 0)) return 1
  const l = Math.log(apparentPx / BEST_APPARENT_PX)
  if (l <= 0) return Math.max(0.02, Math.exp(-0.5 * (l / SMALL_SPREAD) ** 2))
  return Math.max(LARGE_FLOOR, Math.exp(-0.5 * (l / LARGE_SPREAD) ** 2))
}
export const POINTER_SIGMA_PX = 25 // the width of the pointer's reach, before affinity widens it
export const AFFINITY_HALF_LIFE_MS = 20000
export const AFFINITY_PULL = 0.5 // how much each unit of affinity widens the reach and raises the score
export const REINFORCE = { gesture: 0.5, perSecond: 0.5, maxPerGesture: 2, zoom: 0.3, doubleClick: 5 }
const FLICK_PX_PER_S = 800 // a gesture starting this fast is half way to a "fast flick"
const MAX_MEMORY = 32

export class InteractionFocus {
  constructor() {
    this.memory = [] // { key, kind, type, point, affinity, time }
  }

  decayed(entry, now) {
    return entry.affinity * 2 ** (-(now - entry.time) / AFFINITY_HALF_LIFE_MS)
  }

  // The memory entry for a candidate: the same object (by key), or a remembered point of the same kind
  // close to it (within 2% of its distance from the camera, at least 5 m).
  find(candidate) {
    if (candidate.key) return this.memory.find(e => e.key === candidate.key) ?? null
    let best = null
    let bestDistance = Math.max(5, 0.02 * (candidate.distance ?? 0))
    for (const e of this.memory) {
      if (e.key || e.kind !== candidate.kind) continue
      const d = e.point.distanceTo(candidate.point)
      if (d <= bestDistance) {
        best = e
        bestDistance = d
      }
    }
    return best
  }

  affinity(candidate, now) {
    const e = this.find(candidate)
    return e ? this.decayed(e, now) : 0
  }

  reinforce(candidate, amount, now) {
    if (!candidate || !(amount > 0)) return
    let e = this.find(candidate)
    if (!e) {
      e = { key: candidate.key ?? null, kind: candidate.kind, type: candidate.type ?? null, tag: candidate.tag ?? null, size: candidate.size ?? 0, point: candidate.point.clone(), affinity: 0, time: now }
      this.memory.push(e)
    }
    e.affinity = this.decayed(e, now) + amount
    e.time = now
    e.point.copy(candidate.point)
    if (candidate.anchor) e.anchor = candidate.anchor
    this.memory = this.memory.filter(m => this.decayed(m, now) > 0.05)
    if (this.memory.length > MAX_MEMORY) {
      this.memory.sort((a, b) => this.decayed(b, now) - this.decayed(a, now))
      this.memory.length = MAX_MEMORY
    }
  }

  // Remembered points (not objects: those are found where they are now) still worth considering.
  rememberedPoints(now) {
    return this.memory.filter(e => !e.key && this.decayed(e, now) > 0.05)
  }

  score(c, { now = 0, speed = 0, doubleClick = false } = {}) {
    const affinity = c.affinity ?? this.affinity(c, now)
    const prior = c.kind === 'object' ? (PRIORS[c.type] ?? PRIORS.object)
      : c.kind === 'structure' ? (STRUCTURE_PRIORS[c.tag] ?? STRUCTURE_PRIORS.other) : PRIORS.ground
    const pull = AFFINITY_PULL * affinity
    const sigma = POINTER_SIGMA_PX * (1 + pull)
    const proximity = Math.exp(-0.5 * (c.px / sigma) ** 2)
    const size = c.kind === 'ground' ? 1 : sizeWeight(c.apparentPx)
    const fast = speed / (speed + FLICK_PX_PER_S)
    const flick = c.kind === 'ground' ? 1 + fast : 1 - 0.4 * fast
    const chosen = c.kind === 'object' ? (doubleClick ? 4 : 1) * (c.tracked ? 3 : 1) : 1
    return prior * proximity * size * flick * chosen * (1 + pull)
  }

  // The best candidate (with its score), or null.
  choose(candidates, context = {}) {
    let best = null
    for (const c of candidates) {
      const score = this.score(c, context)
      if (!best || score > best.score) best = { ...c, score }
    }
    return best
  }
}
