import test from 'node:test'
import assert from 'node:assert/strict'
import { niceScale, timeRange, seriesStyle, windowPoints, formatValue, editChartRect } from '../src/scene/chartModel.js'
import { CHART_SERIES } from '../src/scene/chartSeries.js'
import { grapplerTelemetry } from '../src/launcher/grapplerTelemetry.js'

test('physical scales contain negative, constant, tiny and large measurements', () => {
  for (const values of [[-240, 80], [0, 0], [0.00002, 0.00003], [1e12, 1.1e12], [NaN, Infinity]]) {
    const scale = niceScale(values)
    assert.ok(Number.isFinite(scale.min) && scale.max > scale.min)
    for (const value of values.filter(Number.isFinite)) assert.ok(value >= scale.min && value <= scale.max)
  }
  assert.equal(formatValue(12000), '12k')
  assert.equal(formatValue(0), '0')
})

test('time windows cannot cross, collapse or leave the telemetry domain', () => {
  for (const [start, end, limit] of [[100, 10, 450], [-20, 800, 450], [500, 1000, 50], [NaN, Infinity, NaN]]) {
    const range = timeRange(start, end, limit)
    assert.ok(range.start >= 0 && range.end <= range.limit && range.end > range.start)
  }
})

test('window clipping interpolates boundaries and excludes distant outliers', () => {
  const points = [{ x: 0, y: 1000 }, { x: 10, y: 0 }, { x: 20, y: 10 }, { x: 30, y: 1000 }]
  const saved = structuredClone(points)
  assert.deepEqual(windowPoints(points, 12, 18), [{ x: 12, y: 2 }, { x: 18, y: 8 }])
  assert.deepEqual(windowPoints(points, 10, 20), points.slice(1, 3))
  assert.deepEqual(windowPoints(points, 31, 40), [])
  assert.deepEqual(windowPoints(points, -5, 35), points)
  assert.deepEqual(points, saved)
})

test('all picker series have stable unique colors, keys and names, with multiple line patterns', () => {
  for (const key of ['key', 'name']) assert.equal(new Set(CHART_SERIES.map(s => s[key])).size, CHART_SERIES.length)
  assert.equal(new Set(CHART_SERIES.map(s => seriesStyle(s.index).color)).size, CHART_SERIES.length)
  assert.equal(new Set(CHART_SERIES.slice(-4).map(s => JSON.stringify(seriesStyle(s.index).dash))).size, 4)
})

test('grappler telemetry samples the animation poses, with launch-clock phase and physical pad travel', () => {
  const calls = []
  const nut = {
    motion: { initialVelocity: 10, acceleration: 2, horizontalTime: 10, duration: 10, samples: [] },
    threadLayout: { flightsAt: () => 1 }, initialDistance: 2, adaptiveNutNumGrapplers: 2,
    switchoverTime: 0.2, screwRevolutionsPerSecond: 3, padLiftActuation: 0.04, padRadialActuation: 0.1,
    grapplerStateAt(...args) {
      calls.push(args)
      return { grapplerPoses: [{ attached: true, alpha: Math.PI / 2, lift: 0.5, raise: 0.75 }, { attached: false }] }
    },
  }
  const data = grapplerTelemetry(nut, 3, 4, 2)
  assert.equal(data.length, 4)
  assert.equal(data[0][0].y, 50)
  assert.equal(data[1][0].y, 90)
  assert.equal(data[2][0].y, 0.02)
  assert.ok(Math.abs(data[3][0].y - 0.075) < 1e-10)
  assert.deepEqual(calls[0], [11, 0, 3, 0, true, 12])
  assert.equal(data[0].at(-1).x, 4)
  assert.ok(data.every(points => points.length <= 1601))
  assert.deepEqual(grapplerTelemetry(nut, 20, 30, 2), [[], [], [], []])
})

test('every picker curve uses a saved chart parameter and a lightweight redraw handler', async () => {
  const { createParameterDefinitions } = await import('../src/params/parameterDefinitions.js')
  const defs = createParameterDefinitions()
  for (const series of CHART_SERIES) {
    assert.equal(defs[series.key]?.folder, 'Chart', series.name)
    assert.equal(defs[series.key]?.onChange, 'updateXYChart', series.name)
  }
  assert.equal(defs.showXYChart.folder, 'Chart')
  assert.equal(defs.launcherXyChartMaxT.folder, 'Chart')
})

test('chart dragging stays within the scene frame and preserves size', () => {
  const rect = { x: 300, y: 200, width: 600, height: 400 }
  assert.deepEqual(editChartRect(rect, 'move', -1000, -1000, 1280, 720), { x: 0, y: 0, width: 600, height: 400 })
  assert.deepEqual(editChartRect(rect, 'move', 1000, 1000, 1280, 720), { x: 680, y: 320, width: 600, height: 400 })
  assert.deepEqual(editChartRect(rect, 'move', -35, 22, 1280, 720), { x: 265, y: 222, width: 600, height: 400 })
})

test('resizing either corner keeps the opposite corner anchored and enforces usable dimensions', () => {
  const rect = { x: 300, y: 200, width: 600, height: 400 }
  const se = editChartRect(rect, 'se', 1000, 1000, 1280, 720)
  assert.deepEqual(se, { x: 300, y: 200, width: 980, height: 520 })
  const nw = editChartRect(rect, 'nw', 1000, 1000, 1280, 720)
  assert.deepEqual(nw, { x: 580, y: 400, width: 320, height: 200 })
  assert.equal(nw.x + nw.width, rect.x + rect.width)
  assert.equal(nw.y + nw.height, rect.y + rect.height)
  assert.deepEqual(rect, { x: 300, y: 200, width: 600, height: 400 })
})

test('all resize edges remain bounded, including a scene smaller than the normal minimum size', () => {
  for (const [frameWidth, frameHeight] of [[1280, 720], [240, 180]]) {
    const rect = { x: 0, y: 0, width: frameWidth, height: frameHeight }
    for (const mode of ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw']) {
      for (const delta of [-2000, 2000]) {
        const result = editChartRect(rect, mode, delta, delta, frameWidth, frameHeight)
        assert.ok(result.x >= 0 && result.y >= 0)
        assert.ok(result.width > 0 && result.height > 0)
        assert.ok(result.x + result.width <= frameWidth && result.y + result.height <= frameHeight)
      }
    }
  }
})
