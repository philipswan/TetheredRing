import * as THREE from 'three'
import { CHART_SERIES, chartSeries } from './chartSeries.js'
import { niceScale, timeRange, seriesStyle, formatValue, windowPoints } from './chartModel.js'

// The canvas is a WebGL texture, so labels, background and curves appear in saved videos too.
// Only interaction targets live in the DOM. Canvas lines support crisp dashes at any output size.
function chartTexture(canvas) {
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.minFilter = THREE.LinearFilter
  texture.generateMipmaps = false
  return texture
}

export class XYChart extends THREE.Group {
  constructor() {
    super()
    this.width = 800
    this.height = 400
    this.minX = 0
    this.maxX = 300
    this.limit = 450
    this.opacity = 0.82
    this.curveInfo = []
    this.providers = new Map()
    this.extraStyles = new Map()
    this.selection = null
    this.dirty = true
    this.canvas = document.createElement('canvas')
    this.texture = chartTexture(this.canvas)
    this.panel = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({
      map: this.texture, transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
    }))
    this.panel.scale.set(this.width, this.height, 1)
    this.panel.position.set(this.width / 2, -this.height / 2, 0)
    this.add(this.panel)
    this.cursor = new THREE.Line(new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0.1), new THREE.Vector3(0, -1, 0.1),
    ]), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.65, depthTest: false, depthWrite: false }))
    this.cursor.renderOrder = 1
    this.add(this.cursor)
  }

  configure(params) {
    this.selection = params
    try { this.hiddenCurves = new Set(JSON.parse(params.chartHiddenCurves.value)) }
    catch { this.hiddenCurves = new Set() }
    const range = timeRange(params.chartStartTime.value, params.chartEndTime.value, params.launcherXyChartMaxT.value)
    if (range.start !== this.minX || range.end !== this.maxX) this.invalidateProviders()
    Object.assign(this, { minX: range.start, maxX: range.end, limit: range.limit, opacity: params.chartBackgroundOpacity.value })
    this.dirty = true
  }

  setSize(width, height) {
    if (width === this.width && height === this.height) return
    Object.assign(this, { width, height, dirty: true })
    this.panel.scale.set(width, height, 1)
    this.panel.position.set(width / 2, -height / 2, 0)
  }

  setProvider(id, names, sample) {
    this.providers.set(id, { names, sample, sampled: false })
    this.dirty = true
  }

  invalidateProviders() {
    for (const provider of this.providers.values()) provider.sampled = false
  }

  isSelected(name) {
    const series = chartSeries(name)
    return series ? !this.selection || this.selection[series.key]?.value === true : !this.hiddenCurves?.has(name)
  }

  selectedCurves() {
    return this.curveInfo.filter(c => this.isSelected(c.name))
  }

  // Telemetry and scale labels use the same physical units throughout.
  addCurve(name, units, points) {
    if (!chartSeries(name) && !this.extraStyles.has(name)) this.extraStyles.set(name, CHART_SERIES.length + this.extraStyles.size)
    const index = chartSeries(name)?.index ?? this.extraStyles.get(name)
    const style = seriesStyle(index)
    const old = this.curveInfo.findIndex(c => c.name === name)
    const values = points.filter(p => Number.isFinite(p.x))
    const curve = { name, units, points: values, ...style, index, colorName: style.color,
      legendText: name, yScale: 1, scaledUnits: units,
      largestX: values.reduce((v, p) => Math.max(v, p.x), 0), largestY: values.reduce((v, p) => Number.isFinite(p.y) ? Math.max(v, p.y) : v, -Infinity) }
    if (old < 0) this.curveInfo.push(curve)
    else this.curveInfo[old] = curve
    this.dirty = true
  }

  removeCurve(name) {
    this.curveInfo = this.curveInfo.filter(c => c.name !== name)
    this.dirty = true
  }

  clearCurves() {
    this.curveInfo = []
    this.invalidateProviders()
    this.dirty = true
  }

  drawLegend() { this.dirty = true }

  update(time) {
    if (!this.visible) return
    if (this.dirty) this.draw()
    this.cursor.visible = time >= this.minX && time <= this.maxX && this.selectedCurves().length > 0
    this.cursor.position.set(76 + (this.width - 96) * (time - this.minX) / (this.maxX - this.minX), -52, 0)
    this.cursor.scale.y = Math.max(0, this.height - 120)
  }

  draw() {
    for (const provider of this.providers.values()) {
      if (!provider.sampled && provider.names.some(name => this.isSelected(name))) {
        provider.sample(this.minX, this.maxX)
        provider.sampled = true
      }
    }
    const { width: w, height: h } = this
    const ratio = Math.min(2, 4096 / Math.max(w, h))
    const pixelWidth = Math.round(w * ratio), pixelHeight = Math.round(h * ratio)
    const resized = this.canvas.width !== pixelWidth || this.canvas.height !== pixelHeight
    this.canvas.width = pixelWidth
    this.canvas.height = pixelHeight
    if (resized) {
      // WebGL texture storage is immutable. needsUpdate only uploads pixels into the old storage;
      // changing the canvas dimensions requires new storage or the chart becomes distorted/clipped.
      const previous = this.texture
      this.texture = chartTexture(this.canvas)
      this.panel.material.map = this.texture
      previous.dispose()
    }
    const ctx = this.canvas.getContext('2d')
    ctx.scale(pixelWidth / w, pixelHeight / h)
    ctx.fillStyle = `rgba(12, 20, 30, ${this.opacity})`
    ctx.beginPath(); ctx.roundRect(0, 0, w, h, 10); ctx.fill()
    ctx.strokeStyle = 'rgba(185, 205, 225, 0.22)'; ctx.stroke()
    const text = (label, x, y, color = '#c4d0de', size = 12, align = 'left') => {
      ctx.fillStyle = color; ctx.font = `${size}px system-ui, sans-serif`; ctx.textAlign = align
      ctx.fillText(label, x, y)
    }
    text('LAUNCH TELEMETRY', 34, 25, '#f1f5fa', 13)
    text(this.selection?.chartGroupByUnits.value ? 'Separate scales by unit · time since launch 0' : 'Separate scales per curve · time since launch 0', 18, 43, '#a2b2c4', 11)
    const curves = this.selectedCurves()
    const groups = new Map()
    for (const curve of curves) {
      const key = this.selection?.chartGroupByUnits.value === false ? curve.name : curve.units
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(curve)
    }
    const left = 76, right = w - 20, bottom = h - 68, top = 54
    const xAt = x => left + (x - this.minX) / (this.maxX - this.minX) * (right - left)
    if (!curves.length) text('Choose curves in Controls → Chart.', w / 2, h / 2, '#c4d0de', 14, 'center')
    const rowHeight = (bottom - top) / Math.max(1, groups.size)
    if (rowHeight < 45) text('Increase chart height or choose fewer curves', w - 18, h - 8, '#ffd69a', 10, 'right')
    let row = 0
    for (const series of groups.values()) {
      const rowTop = top + row++ * rowHeight
      ctx.save(); ctx.beginPath(); ctx.rect(0, rowTop, w, rowHeight); ctx.clip()
      const fontSize = 12
      const unitLabel = series[0].units.replaceAll('m/s2', 'm/s²').replaceAll('m2', 'm²').replaceAll('degrees', '°') || 'unitless'
      text(unitLabel, 12, rowTop + 13, '#eff4fa', fontSize)
      let lx = left, ly = rowTop + 13
      for (const curve of series) {
        ctx.font = `${fontSize}px system-ui, sans-serif`
        const labelWidth = Math.min(right - left, ctx.measureText(curve.name).width + 37)
        if (lx > left && lx + labelWidth > right) { lx = left; ly += fontSize + 5 }
        ctx.strokeStyle = curve.color; ctx.lineWidth = 2; ctx.setLineDash(curve.dash)
        ctx.beginPath(); ctx.moveTo(lx, ly - 4); ctx.lineTo(lx + 22, ly - 4); ctx.stroke(); ctx.setLineDash([])
        text(curve.name, lx + 28, ly, curve.color, fontSize)
        lx += labelWidth
      }
      const plotTop = ly + 9, plotBottom = Math.max(plotTop + 4, rowTop + rowHeight - 10)
      const visible = series.map(c => windowPoints(c.points, this.minX, this.maxX))
      const scale = niceScale(visible.flatMap(points => points.map(p => p.y)))
      if (!visible.some(points => points.some(p => Number.isFinite(p.y)))) {
        text('No samples in this time window', (left + right) / 2, (plotTop + plotBottom) / 2, '#a2b2c4', fontSize, 'center')
      }
      const yAt = y => plotBottom - (y - scale.min) / (scale.max - scale.min) * (plotBottom - plotTop)
      ctx.lineWidth = 1
      for (let i = 0; i <= 2; i++) {
        const y = scale.min + (scale.max - scale.min) * i / 2
        ctx.strokeStyle = 'rgba(185, 200, 220, 0.13)'
        ctx.beginPath(); ctx.moveTo(left, yAt(y)); ctx.lineTo(right, yAt(y)); ctx.stroke()
        text(formatValue(y), left - 9, yAt(y) + 4, '#a2b2c4', fontSize, 'right')
      }
      for (let i = 0; i <= 4; i++) {
        const x = left + (right - left) * i / 4
        ctx.strokeStyle = 'rgba(185, 200, 220, 0.09)'
        ctx.beginPath(); ctx.moveTo(x, plotTop); ctx.lineTo(x, plotBottom); ctx.stroke()
      }
      ctx.save(); ctx.beginPath(); ctx.rect(left, plotTop, right - left, plotBottom - plotTop); ctx.clip()
      series.forEach((curve, i) => {
        ctx.strokeStyle = curve.color; ctx.lineWidth = 2; ctx.setLineDash(curve.dash)
        ctx.beginPath()
        let connected = false
        for (const p of visible[i]) {
          if (!Number.isFinite(p.y)) { connected = false; continue }
          if (connected) ctx.lineTo(xAt(p.x), yAt(p.y)); else ctx.moveTo(xAt(p.x), yAt(p.y))
          connected = true
        }
        ctx.stroke()
      })
      ctx.restore(); ctx.setLineDash([])
      ctx.restore()
    }
    for (let i = 0; i <= 4; i++) text(formatValue(this.minX + (this.maxX - this.minX) * i / 4), left + (right - left) * i / 4, h - 49, '#c4d0de', 11, 'center')
    text('Time (s)', 14, h - 49, '#a2b2c4', 11)
    // Overview: the two handles resize the selected interval; dragging its center pans it.
    const overviewY = h - 25
    ctx.fillStyle = 'rgba(175, 195, 220, 0.1)'; ctx.fillRect(left, overviewY - 7, right - left, 14)
    const a = left + this.minX / this.limit * (right - left), b = left + this.maxX / this.limit * (right - left)
    ctx.fillStyle = 'rgba(122, 194, 239, 0.3)'; ctx.fillRect(a, overviewY - 7, b - a, 14)
    ctx.fillStyle = '#b5dff7'; ctx.fillRect(a - 3, overviewY - 11, 6, 22); ctx.fillRect(b - 3, overviewY - 11, 6, 22)
    text('Range', 14, overviewY + 4, '#a2b2c4', 11)
    this.texture.needsUpdate = true
    this.dirty = false
  }

  dispose() {
    this.panel.geometry.dispose(); this.panel.material.dispose(); this.texture.dispose()
    this.cursor.geometry.dispose(); this.cursor.material.dispose()
  }
}
