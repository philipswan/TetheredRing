import test from 'node:test'
import assert from 'node:assert/strict'
import { setImmediate } from 'node:timers'
import { RenderReview, outputFolderPath, reviewVideoName, reviewVideoPath } from '../../src/capture/RenderReview.js'

test('review paths support Windows, UNC and POSIX output folders', () => {
  assert.equal(outputFolderPath(' C:/Videos/ ', 'videos'), 'C:\\Videos')
  assert.equal(outputFolderPath('\\\\server\\share\\Videos\\', 'Videos'), '\\\\server\\share\\Videos')
  assert.equal(outputFolderPath('/home/user/Videos/', 'Videos'), '/home/user/Videos')
  assert.equal(reviewVideoPath('C:\\Videos\\', 'shot.mp4'), 'C:\\Videos\\shot.mp4')
  assert.equal(reviewVideoPath('\\\\server\\share', 'shot.mkv'), '\\\\server\\share\\shot.mkv')
  assert.equal(reviewVideoPath('/home/user/Videos/', 'shot.mp4'), '/home/user/Videos/shot.mp4')
})

test('review paths reject relative paths, invalid characters and wrong folders', () => {
  for (const path of ['Videos', 'C:Videos', '\\Videos', 'C:\\Bad?\\Videos', '/tmp/\nVideos']) {
    assert.throws(() => outputFolderPath(path, 'Videos'), /absolute/)
  }
  assert.throws(() => outputFolderPath('C:\\Other', 'Videos'), /selected folder/)
  assert.throws(() => outputFolderPath('/home/videos', 'Videos'), /selected folder/)
})

test('review locations can use folder names without inventing an absolute path', () => {
  assert.equal(reviewVideoPath('VideoCaptures', 'shot.mp4'), 'VideoCaptures/shot.mp4')
  assert.equal(reviewVideoPath('', 'shot.mp4'), 'shot.mp4')
})

test('review snapshot names preserve the container and do not overwrite normal output', () => {
  assert.equal(reviewVideoName('shot.mp4', 42, 123), 'shot.review-42-123.mp4')
  assert.equal(reviewVideoName('shot.mkv', 43, 124), 'shot.review-43-124.mkv')
})

test('review without a request does nothing and repeated requests are deduplicated', async () => {
  const review = new RenderReview()
  await review.service(null, () => assert.fail('Unexpected review'))
  assert.equal(review.request(), true)
  assert.equal(review.request(), false)
})

test('review checkpoints first and holds the frame loop until the popup closes', async () => {
  const review = new RenderReview()
  const events = []
  let close
  const dismissed = new Promise(resolve => { close = resolve })
  review.request()
  const frameLoop = (async () => {
    await review.service({ checkpoint: async () => { events.push('checkpoint') } }, async () => {
      events.push('popup')
      await dismissed
    })
    events.push('next frame')
  })()
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(events, ['checkpoint', 'popup'])
  assert.equal(review.running, true)
  assert.equal(review.request(), false)
  close()
  await frameLoop
  assert.deepEqual(events, ['checkpoint', 'popup', 'next frame'])
  assert.equal(review.running, false)
  assert.equal(review.request(), true)
})

test('checkpoint failures stop review and propagate to the rendering loop', async () => {
  const review = new RenderReview()
  review.request()
  await assert.rejects(review.service({ checkpoint: async () => { throw new Error('disk full') } },
    () => assert.fail('Unsafe review')), /disk full/)
  assert.equal(review.running, false)
  assert.equal(review.requested, false)
})

test('idle review needs no recorder and callback errors reset its state', async () => {
  const review = new RenderReview()
  review.request()
  let shown = false
  await review.service(null, async () => { shown = true })
  assert.equal(shown, true)
  review.request()
  await assert.rejects(review.service(null, async () => { throw new Error('assembly failed') }), /assembly failed/)
  assert.equal(review.running, false)
  assert.equal(review.request(), true)
})
