// The render queue: shots waiting to be rendered to video one after another, unattended (overnight).
// This module is the data and its pure operations; RenderQueueRunner.js runs it in the browser and
// scripts/render-shots.mjs runs it from the command line, one fresh browser page per shot.
//
// Queue files (*.queue.json, exported from the panel; the command-line renderer reads them):
//
// {
//   format: 'tethered-ring-render-queue', version: 1,
//   items: [{
//     id,                      // unique within the queue
//     shot,                    // the whole shot (ShotFormat.js), including its own output settings
//     fileName,                // the video's file name without extension ('' = from the shot's name)
//     status,                  // 'pending' | 'rendering' | 'done' | 'failed' | 'skipped'
//     error, outputFile, frames, startedAt, finishedAt,   // set when it has run
//   }],
// }
//
// Each item carries its shot, which names its preset and holds every parameter, its simulated start
// and animation state, so the item is rendered with its own scene however the queue is ordered.
import { validateShot, shotDuration } from './ShotFormat.js'
import { CONTAINERS } from '../capture/VideoRecorder.js'

export const QUEUE_FORMAT = 'tethered-ring-render-queue'
export const QUEUE_VERSION = 1
export const QUEUE_FILE_EXTENSION = '.queue.json'
export const ITEM_STATUSES = ['pending', 'rendering', 'done', 'failed', 'skipped']

export const slugName = (name) => (String(name ?? '').trim().replace(/[^\w.-]+/g, '_') || 'shot')
const clone = (value) => JSON.parse(JSON.stringify(value))

export function createQueue() {
  return { format: QUEUE_FORMAT, version: QUEUE_VERSION, items: [] }
}

let idCounter = 0
function newId(items) {
  const used = new Set(items.map(i => i.id))
  let id
  do id = `q${Date.now().toString(36)}${(idCounter++).toString(36)}`
  while (used.has(id))
  return id
}

// Adds a copy of `shot` (validated) to the end of the queue. Returns the new item.
export function addToQueue(queue, shot, { fileName = '' } = {}) {
  const item = {
    id: newId(queue.items),
    shot: validateShot(clone(shot)),
    fileName,
    status: 'pending',
    error: null,
    outputFile: null,
    frames: null,
    startedAt: null,
    finishedAt: null,
  }
  queue.items.push(item)
  return item
}

export function findItem(queue, id) {
  return queue.items.find(i => i.id === id) ?? null
}

export function removeFromQueue(queue, id) {
  const i = queue.items.findIndex(item => item.id === id)
  if (i >= 0) queue.items.splice(i, 1)
}

// Moves item `id` by `delta` places (clamped to the ends).
export function moveInQueue(queue, id, delta) {
  const items = queue.items
  const i = items.findIndex(item => item.id === id)
  if (i < 0) return
  const j = Math.max(0, Math.min(items.length - 1, i + delta))
  const [item] = items.splice(i, 1)
  items.splice(j, 0, item)
}

// Puts an item back to waiting (to render it again).
export function resetItem(item) {
  Object.assign(item, { status: 'pending', error: null, outputFile: null, frames: null, startedAt: null, finishedAt: null })
}

// The next item to render: the first one waiting. Interrupted items return to waiting on reload.
export function nextPending(queue) {
  return queue.items.find(i => i.status === 'pending') ?? null
}

// After a reload in the middle of a run: an item still marked 'rendering' did not finish.
export function markInterrupted(queue) {
  for (const item of queue.items) {
    if (item.status === 'rendering') resetItem(item)
  }
}

// The video file name for an item (with extension), unique among `taken` (a Set of names already
// used, compared without regard to case: Windows and macOS file systems ignore it).
export function outputFileName(item, taken = new Set()) {
  const extension = CONTAINERS[item.shot.output.container]?.extension ?? '.mp4'
  const base = slugName(item.fileName || item.shot.name)
  const lower = new Set([...taken].map(n => n.toLowerCase()))
  let name = base + extension
  for (let n = 2; lower.has(name.toLowerCase()); n++) name = `${base}_${n}${extension}`
  return name
}

// File names for every item, in queue order, none repeated.
export function outputFileNames(queue) {
  const taken = new Set()
  const names = new Map()
  for (const item of queue.items) {
    const name = outputFileName(item, taken)
    taken.add(name)
    names.set(item.id, name)
  }
  return names
}

// Video frames an item renders, and the renders that takes (motion blur sub-frames are estimated as
// the fixed count, or the fewest for adaptive blur), for progress and time estimates.
export function itemFrames(item) {
  const o = item.shot.output
  return Math.max(1, Math.round(shotDuration(item.shot) * o.fps))
}

export function summarize(queue) {
  const counts = Object.fromEntries(ITEM_STATUSES.map(s => [s, 0]))
  for (const item of queue.items) counts[item.status] = (counts[item.status] ?? 0) + 1
  return counts
}

// Throws an Error describing the first problem; returns the (normalised) queue otherwise.
export function validateQueue(queue) {
  const fail = (msg) => { throw new Error(`Invalid render queue: ${msg}`) }
  if (!queue || typeof queue !== 'object') fail('not a JSON object')
  if (queue.format !== QUEUE_FORMAT) fail(`"format" must be "${QUEUE_FORMAT}"`)
  if (!Number.isInteger(queue.version) || queue.version > QUEUE_VERSION) fail(`unsupported version ${queue.version}`)
  if (!Array.isArray(queue.items)) fail('"items" must be an array')
  const ids = new Set()
  queue.items.forEach((item, i) => {
    if (!item || typeof item !== 'object') fail(`item ${i} is not an object`)
    try {
      item.shot = validateShot(item.shot)
    }
    catch (err) {
      fail(`item ${i}: ${err.message}`)
    }
    item.id = typeof item.id === 'string' && item.id && !ids.has(item.id) ? item.id : newId(queue.items)
    ids.add(item.id)
    item.fileName = typeof item.fileName === 'string' ? item.fileName : ''
    if (!ITEM_STATUSES.includes(item.status)) item.status = 'pending'
    for (const field of ['error', 'outputFile', 'frames', 'startedAt', 'finishedAt']) item[field] ??= null
  })
  return queue
}

export function serializeQueue(queue) {
  return JSON.stringify(queue, null, 2)
}

export function parseQueue(text) {
  let queue
  try {
    queue = JSON.parse(text)
  }
  catch (err) {
    throw new Error(`Invalid render queue: ${err.message}`)
  }
  return validateQueue(queue)
}

// A shot file or a queue file, as queue items: { shots: [shot], queue } (one of them filled).
export function parseShotOrQueue(text) {
  let data
  try {
    data = JSON.parse(text)
  }
  catch (err) {
    throw new Error(`Not a shot or render queue file: ${err.message}`)
  }
  if (data?.format === QUEUE_FORMAT) return { shots: [], queue: validateQueue(data) }
  return { shots: [validateShot(data)], queue: null }
}
