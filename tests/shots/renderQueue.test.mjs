import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createShot } from '../../src/shots/ShotFormat.js'
import {
  createQueue, addToQueue, removeFromQueue, moveInQueue, resetItem, nextPending, markInterrupted,
  outputFileNames, itemFrames, summarize, serializeQueue, parseQueue, parseShotOrQueue,
} from '../../src/shots/RenderQueue.js'

const shot = (name, output = {}) => {
  const s = createShot({ name, preset: 'default', parameters: { a: 1 }, startTime: 0 })
  s.camera.keyframes.push({ time: 0, position: [1, 2, 3], target: [0, 0, 0], up: [0, 1, 0] })
  Object.assign(s.output, output)
  return s
}

test('items are copies of the shot, waiting, with unique ids', () => {
  const q = createQueue()
  const s = shot('A')
  const a = addToQueue(q, s)
  const b = addToQueue(q, s)
  assert.notEqual(a.id, b.id)
  assert.equal(a.status, 'pending')
  s.name = 'changed'
  assert.equal(a.shot.name, 'A')
  assert.equal(nextPending(q), a)
})

test('moving and removing items', () => {
  const q = createQueue()
  const [a, b, c] = ['A', 'B', 'C'].map(n => addToQueue(q, shot(n)))
  moveInQueue(q, c.id, -1)
  assert.deepEqual(q.items.map(i => i.shot.name), ['A', 'C', 'B'])
  moveInQueue(q, a.id, -5)
  assert.deepEqual(q.items.map(i => i.shot.name), ['A', 'C', 'B'])
  moveInQueue(q, a.id, 10)
  assert.deepEqual(q.items.map(i => i.shot.name), ['C', 'B', 'A'])
  removeFromQueue(q, b.id)
  assert.deepEqual(q.items.map(i => i.shot.name), ['C', 'A'])
})

test('a run interrupted mid-shot resumes that shot before moving to the next', () => {
  const q = createQueue()
  const a = addToQueue(q, shot('A'))
  const b = addToQueue(q, shot('B'))
  a.status = 'rendering'
  markInterrupted(q)
  assert.equal(a.status, 'pending')
  assert.equal(a.error, null)
  assert.equal(nextPending(q), a)
  resetItem(a)
  assert.equal(a.status, 'pending')
  assert.equal(a.error, null)
  assert.deepEqual({ ...summarize(q) }, { pending: 2, rendering: 0, done: 0, failed: 0, skipped: 0 })
})

test('output file names are unique (ignoring case) and use the container\'s extension', () => {
  const q = createQueue()
  addToQueue(q, shot('My shot'))
  addToQueue(q, shot('my shot'))
  addToQueue(q, shot('Other', { container: 'mkv' }))
  addToQueue(q, shot('x'), { fileName: 'My_shot' })
  assert.deepEqual([...outputFileNames(q).values()], ['My_shot.mp4', 'my_shot_2.mp4', 'Other.mkv', 'My_shot_3.mp4'])
})

test('frames follow the shot duration and frame rate', () => {
  const q = createQueue()
  assert.equal(itemFrames(addToQueue(q, shot('A', { duration: 2, fps: 30 }))), 60)
})

test('queue files round-trip, and shot files are told apart from queue files', () => {
  const q = createQueue()
  addToQueue(q, shot('A'), { fileName: 'first' })
  const text = serializeQueue(q)
  const back = parseQueue(text)
  assert.equal(back.items[0].fileName, 'first')
  assert.equal(back.items[0].shot.name, 'A')
  assert.equal(parseShotOrQueue(text).queue.items.length, 1)
  const single = parseShotOrQueue(JSON.stringify(shot('B')))
  assert.equal(single.shots[0].name, 'B')
  assert.equal(single.queue, null)
  assert.throws(() => parseShotOrQueue('{"format":"tethered-ring-render-queue","version":1,"items":[{"shot":{}}]}'), /item 0/)
  assert.throws(() => parseShotOrQueue('not json'), /Not a shot/)
})
