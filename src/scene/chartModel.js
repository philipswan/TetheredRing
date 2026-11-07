// Physical values stay in their original units; no hidden offsets or arbitrary multipliers.
export function niceScale(values) {
  let min = Infinity, max = -Infinity
  for (const value of values) if (Number.isFinite(value)) { min = Math.min(min, value); max = Math.max(max, value) }
  if (!Number.isFinite(min)) return { min: 0, max: 1 }
  if (min === max) { const margin = Math.max(Math.abs(min) * 0.05, 1); min -= margin; max += margin }
  const span = max - min
  const power = 10 ** Math.floor(Math.log10(span / 3))
  const step = [1, 2, 5, 10].find(n => n * power >= span / 3) * power
  return { min: Math.floor(min / step) * step, max: Math.ceil(max / step) * step }
}

export function timeRange(start, end, limit) {
  limit = Math.max(0.01, Number.isFinite(limit) ? limit : 450)
  start = Math.max(0, Math.min(limit - 0.01, Number.isFinite(start) ? start : 0))
  end = Math.max(start + 0.01, Math.min(limit, Number.isFinite(end) ? end : limit))
  return { start, end, limit }
}

// Equal lightness in OKLCH makes every series legible on the dark chart. Golden-angle spacing
// gives stable, unique hues; patterns supply a second cue when colors are hard to distinguish.
export function seriesStyle(index) {
  return { color: `oklch(80% 0.12 ${(index * 137.508 + 200) % 360})`, dash: [[], [8, 4], [2, 4], [10, 4, 2, 4]][index % 4] }
}

export function formatValue(value) {
  if (value === 0) return '0'
  const a = Math.abs(value)
  if (a >= 1e6 || a < 0.001) return value.toExponential(2)
  if (a >= 1e3) return `${Number((value / 1000).toPrecision(4))}k`
  return String(Number(value.toPrecision(4)))
}

// Clip to the window with interpolated edge values, without mutating source telemetry.
// Outliers outside the window must not distort the visible vertical scale.
export function windowPoints(points, start, end) {
  if (!points.length || points.at(-1).x < start || points[0].x > end) return []
  const bound = value => {
    let lo = 0, hi = points.length
    while (lo < hi) { const mid = (lo + hi) >> 1; if (points[mid].x < value) lo = mid + 1; else hi = mid }
    return lo
  }
  const first = bound(start), last = bound(end)
  const result = points.slice(first, last)
  const edge = (index, x) => {
    const a = points[index - 1], b = points[index]
    if (b?.x === x) return b
    if (!a || !b) return null
    return { x, y: a.y + (b.y - a.y) * (x - a.x) / (b.x - a.x) }
  }
  const a = edge(first, start), b = edge(last, end)
  if (a && result[0] !== a) result.unshift(a)
  if (b) result.push(b)
  return result
}

// Scene-pixel geometry shared by pointer and keyboard layout editing. Opposite resize edges stay
// fixed, and the complete chart stays inside the scene frame (excluding any letterbox bars).
export function editChartRect(rect, mode, dx, dy, frameWidth, frameHeight) {
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value))
  if (mode === 'move') return { ...rect,
    x: clamp(rect.x + dx, 0, frameWidth - rect.width),
    y: clamp(rect.y + dy, 0, frameHeight - rect.height) }
  let left = rect.x, right = rect.x + rect.width, top = rect.y, bottom = rect.y + rect.height
  const minWidth = Math.min(frameWidth, Math.max(frameWidth * 0.2, 320))
  const minHeight = Math.min(frameHeight, Math.max(frameHeight * 0.2, 200))
  if (mode.includes('w')) left = clamp(left + dx, 0, Math.max(0, right - minWidth))
  if (mode.includes('e')) right = clamp(right + dx, Math.min(frameWidth, left + minWidth), frameWidth)
  if (mode.includes('n')) top = clamp(top + dy, 0, Math.max(0, bottom - minHeight))
  if (mode.includes('s')) bottom = clamp(bottom + dy, Math.min(frameHeight, top + minHeight), frameHeight)
  return { x: left, y: top, width: right - left, height: bottom - top }
}
