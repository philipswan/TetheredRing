import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chunkName, chunkRecordName, finishedChunks, planChunks, appendableChunks } from '../../src/capture/RenderChunks.js'

test('chunk files are named by their frame range', () => {
  assert.equal(chunkName(600, 900, 'mp4'), 'chunk-0000600-0000900.mp4')
  assert.equal(chunkRecordName(600, 900), 'chunk-0000600-0000900.json')
})

test('a chunk is finished only when its video and its record are both there', () => {
  const names = [
    'render.json', 'segment-000000.mp4',
    chunkName(300, 600, 'mp4'), chunkRecordName(300, 600),
    chunkName(900, 1200, 'mp4'), // no record: it was still being written
    chunkRecordName(1200, 1500), // no video
    chunkName(0, 300, 'mp4'), chunkRecordName(0, 300),
    chunkName(1500, 1800, 'mp4') + '.writing',
  ]
  assert.deepEqual(finishedChunks(names, 'mp4'), [{ from: 0, to: 300 }, { from: 300, to: 600 }])
  // Another container's chunks do not count.
  assert.deepEqual(finishedChunks(names, 'mkv'), [])
})

test('ranges cover the unsaved frames, reusing finished chunks that line up', () => {
  assert.deepEqual(planChunks({ start: 0, end: 700, size: 300 }), [
    { from: 0, to: 300, finished: false }, { from: 300, to: 600, finished: false }, { from: 600, to: 700, finished: false },
  ])
  // Saved up to 1340 (an earlier render, whose segments were cut at other places); a chunk 2040-2340
  // finished in a run that stopped before 1340-2040 did. The plan stops short of it and then uses it.
  const plan = planChunks({ start: 1340, end: 2700, size: 300, finished: [{ from: 2040, to: 2340 }, { from: 2100, to: 2400 }, { from: 0, to: 300 }] })
  assert.deepEqual(plan, [
    { from: 1340, to: 1640, finished: false },
    { from: 1640, to: 1940, finished: false },
    { from: 1940, to: 2040, finished: false },
    { from: 2040, to: 2340, finished: true },
    { from: 2340, to: 2640, finished: false },
    { from: 2640, to: 2700, finished: false },
  ])
  // Contiguous, starting at the saved frames and ending at the last frame.
  plan.forEach((c, i) => assert.equal(c.from, i ? plan[i - 1].to : 1340))
  assert.equal(plan.at(-1).to, 2700)
  assert.deepEqual(planChunks({ start: 500, end: 500, size: 300 }), [])
  assert.throws(() => planChunks({ start: 0, end: 10, size: 0 }), /chunk size/)
})

test('finished chunks are appended in order, only once the frames before them are saved', () => {
  const done = [{ from: 900, to: 1200 }, { from: 600, to: 900 }, { from: 1500, to: 1800 }]
  assert.deepEqual(appendableChunks(300, done), [])
  assert.deepEqual(appendableChunks(600, done), [{ from: 600, to: 900 }, { from: 900, to: 1200 }])
  assert.deepEqual(appendableChunks(1500, done), [{ from: 1500, to: 1800 }])
})
