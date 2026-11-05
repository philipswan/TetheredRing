// Frame ranges ("chunks") for rendering one shot in several browsers at once (`npm run render --
// --workers N`, scripts/render-shots.mjs; the page side is ShotController.renderRangeUnattended).
//
// Each chunk is rendered into a file of its own in the render folder, chunk-<from>-<to>.<container>
// (frames [from, to)), with chunk-<from>-<to>.json beside it once the file is complete and checked
// ({ from, to, decoderConfig }). Finished chunks are appended to the render's segments in frame order
// (RenderJob.commit). A chunk that finished but could not be appended yet, because an earlier one was
// still rendering when the run stopped, is used again by the next run instead of being rendered again.
// Nothing here touches files: it is plain data, tested in tests/shots/renderChunks.test.mjs.

const pad = (n) => String(n).padStart(7, '0')

export function chunkName(from, to, container) {
  return `chunk-${pad(from)}-${pad(to)}.${container}`
}

export function chunkRecordName(from, to) {
  return `chunk-${pad(from)}-${pad(to)}.json`
}

// The finished chunks among the file names in a render folder: [{ from, to }], sorted. A chunk counts
// only when both its video and its record are there (the record is written last).
export function finishedChunks(names, container) {
  const present = new Set(names)
  const chunks = []
  for (const name of names) {
    const m = /^chunk-(\d{7,})-(\d{7,})\.json$/.exec(name)
    if (!m) continue
    const from = Number(m[1])
    const to = Number(m[2])
    if (to > from && present.has(chunkName(from, to, container))) chunks.push({ from, to })
  }
  return chunks.sort((a, b) => a.from - b.from || a.to - b.to)
}

// The chunks that cover frames [start, end): runs of at most `size` frames, except that a finished
// chunk (from finishedChunks) that begins where the plan has reached is used as it is. Finished chunks
// that do not line up with the plan are left out (and stay on disk unused). Each planned chunk is
// { from, to, finished }.
export function planChunks({ start, end, size, finished = [] }) {
  if (!(Number.isInteger(size) && size > 0)) throw new Error('The chunk size must be a whole number of frames.')
  const byStart = new Map()
  for (const c of finished) if (c.from >= start && c.to <= end && !byStart.has(c.from)) byStart.set(c.from, c)
  const starts = [...byStart.keys()].sort((a, b) => a - b)
  const plan = []
  let at = start
  while (at < end) {
    const done = byStart.get(at)
    if (done) {
      plan.push({ from: done.from, to: done.to, finished: true })
      at = done.to
      continue
    }
    // Stop a new chunk where the next finished one starts, so that one can be used.
    const next = starts.find(s => s > at)
    const to = Math.min(end, at + size, next ?? Infinity)
    plan.push({ from: at, to, finished: false })
    at = to
  }
  return plan
}

// The finished chunks that can be appended now, in order: those that continue the saved frames
// without a gap. `done` holds finished chunks ({ from, to, ... }) that have not been appended yet.
export function appendableChunks(savedFrames, done) {
  const out = []
  let at = savedFrames
  for (;;) {
    const next = done.find(c => c.from === at)
    if (!next) return out
    out.push(next)
    at = next.to
  }
}
