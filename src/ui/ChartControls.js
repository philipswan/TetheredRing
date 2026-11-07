import { CHART_SERIES } from '../scene/chartSeries.js'
import { seriesStyle, timeRange, formatValue, editChartRect } from '../scene/chartModel.js'

export class ChartControls {
  constructor(app) {
    this.app = app
    this.root = document.createElement('div')
    this.root.className = 'chart-controls'
    this.root.setAttribute('aria-label', 'Telemetry chart')
    document.body.append(this.root)
    const toolbar = document.createElement('div')
    toolbar.className = 'chart-toolbar'
    this.root.append(toolbar)
    const button = (parent, label, action) => {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = label
      b.addEventListener('click', action); parent.append(b); return b
    }
    this.moveHandle = button(this.root, '', () => {})
    this.moveHandle.className = 'chart-move-handle'
    const grip = document.createElement('span'); grip.className = 'chart-move-grip'; grip.textContent = '⠿'
    const hint = document.createElement('span'); hint.className = 'chart-move-hint'; hint.textContent = 'Drag to move'
    this.moveHandle.append(grip, hint)
    this.installLayoutHandle(this.moveHandle, 'move', 'Move chart')
    for (const [edge, label] of Object.entries({ n: 'top', ne: 'top right', e: 'right', se: 'bottom right', s: 'bottom', sw: 'bottom left', w: 'left', nw: 'top left' })) {
      const handle = button(this.root, edge === 'se' ? '↘' : '', () => {})
      handle.className = `chart-resize-handle chart-resize-${edge}`
      this.installLayoutHandle(handle, edge, `Resize chart from ${label}`)
    }
    button(toolbar, 'Curves…', () => this.openPicker())
    button(toolbar, 'Fit time', () => this.setRange(0, app.store.get('launcherXyChartMaxT')))
    this.handles = {}
    for (const [id, label] of [['start', 'Time window start'], ['pan', 'Pan time window'], ['end', 'Time window end']]) {
      const handle = button(this.root, '', () => {})
      handle.className = `chart-range-handle chart-range-${id}`
      handle.setAttribute('aria-label', label)
      handle.title = `${label}: drag or use arrow keys`
      if (id !== 'pan') handle.setAttribute('role', 'slider')
      handle.addEventListener('pointerdown', event => this.beginDrag(event, id))
      handle.addEventListener('keydown', event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
        event.preventDefault(); event.stopPropagation()
        const c = app.overlays.xyChart
        const step = (c.maxX - c.minX) / 100 * (event.shiftKey ? 10 : 1) * (event.key === 'ArrowLeft' ? -1 : 1)
        const delta = event.key === 'Home' ? -c.limit : event.key === 'End' ? c.limit : step
        this.moveRange(id, c.minX, c.maxX, delta)
      })
      this.handles[id] = handle
    }
    this.dialog = document.createElement('dialog')
    this.dialog.className = 'chart-picker'
    this.dialog.setAttribute('aria-label', 'Choose chart curves')
    this.dialog.addEventListener('keydown', event => event.stopPropagation())
    document.body.append(this.dialog)
    const heading = document.createElement('div'); heading.className = 'chart-picker-heading'
    const title = document.createElement('strong'); title.textContent = 'Chart curves'; heading.append(title)
    button(heading, 'Done', () => this.dialog.close()); this.dialog.append(heading)
    const help = document.createElement('p')
    help.textContent = 'Each unit has its own labeled scale. Fewer curves give more room for detail. Grappler curves describe launch 0; pad curves follow grappler 1.'
    this.dialog.append(help)
    this.search = document.createElement('input'); this.search.type = 'search'; this.search.placeholder = 'Find a curve…'
    this.search.setAttribute('aria-label', 'Find a chart curve')
    this.search.addEventListener('input', () => this.renderChoices()); this.dialog.append(this.search)
    const actions = document.createElement('div'); actions.className = 'chart-picker-actions'
    button(actions, 'Clear selection', () => {
      for (const series of CHART_SERIES) app.store.set(series.key, false)
      app.store.set('chartHiddenCurves', JSON.stringify(this.choices().filter(s => !s.key).map(s => s.name)))
      this.changed()
    })
    button(actions, 'Grappler handovers', () => {
      for (const series of CHART_SERIES) app.store.set(series.key, series.key.startsWith('showGrappler'))
      app.store.set('chartHiddenCurves', JSON.stringify(this.choices().filter(s => !s.key).map(s => s.name)))
      this.changed()
    })
    this.count = document.createElement('span'); actions.append(this.count); this.dialog.append(actions)
    this.list = document.createElement('div'); this.list.className = 'chart-picker-list'; this.dialog.append(this.list)
    app.gui.folder('Chart').add({ curves: () => this.openPicker() }, 'curves').name('Choose curves…')
    this.refresh()
  }

  installLayoutHandle(handle, mode, label) {
    handle.setAttribute('aria-label', label)
    handle.title = `${label}: drag or use arrow keys (Shift for larger steps)`
    handle.addEventListener('pointerdown', event => {
      if (event.button !== 0) return
      event.preventDefault(); event.stopPropagation()
      const { overlays } = this.app
      const initial = { ...overlays.chartRect }, x = event.clientX, y = event.clientY, scale = this.displayScale
      const move = e => this.setLayout(editChartRect(initial, mode, (e.clientX - x) / scale, (e.clientY - y) / scale, overlays.width, overlays.height))
      const finish = () => {
        handle.removeEventListener('pointermove', move)
        handle.removeEventListener('pointerup', finish)
        handle.removeEventListener('pointercancel', finish)
        handle.removeEventListener('lostpointercapture', finish)
        if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId)
        delete this.root.dataset.editing
      }
      handle.setPointerCapture(event.pointerId)
      this.root.dataset.editing = mode
      handle.addEventListener('pointermove', move)
      handle.addEventListener('pointerup', finish)
      handle.addEventListener('pointercancel', finish)
      handle.addEventListener('lostpointercapture', finish)
    })
    handle.addEventListener('keydown', event => {
      const direction = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key]
      if (!direction) return
      event.preventDefault(); event.stopPropagation()
      const { overlays } = this.app, step = event.shiftKey ? 10 : 1
      this.setLayout(editChartRect(overlays.chartRect, mode, direction[0] * step, direction[1] * step, overlays.width, overlays.height))
    })
  }

  setLayout(rect) {
    const { store, overlays } = this.app
    store.set('chartLeft', rect.x / overlays.width * 100)
    store.set('chartTop', rect.y / overlays.height * 100)
    store.set('chartWidth', rect.width / overlays.width * 100)
    store.set('chartHeight', rect.height / overlays.height * 100)
    this.changed()
  }

  changed() {
    this.app.gui.dispatch('showXYChart')
    this.app.gui.refresh()
  }

  openPicker() {
    this.renderChoices()
    this.refresh()
    this.dialog.showModal()
    this.search.focus()
  }

  choices() {
    return [...CHART_SERIES, ...this.app.overlays.xyChart.curveInfo.filter(c => !CHART_SERIES.some(s => s.name === c.name))]
  }

  renderChoices() {
    this.list.replaceChildren()
    const query = this.search.value.toLowerCase()
    for (const series of this.choices().filter(s => s.name.toLowerCase().includes(query))) {
      const label = document.createElement('label')
      const check = document.createElement('input'); check.type = 'checkbox'; check.dataset.name = series.name
      check.checked = this.app.overlays.xyChart.isSelected(series.name)
      check.addEventListener('change', () => {
        if (series.key) this.app.store.set(series.key, check.checked)
        else {
          const hidden = new Set(this.app.overlays.xyChart.hiddenCurves)
          if (check.checked) hidden.delete(series.name); else hidden.add(series.name)
          this.app.store.set('chartHiddenCurves', JSON.stringify([...hidden]))
        }
        this.changed()
      })
      const swatch = document.createElement('span'); swatch.className = 'chart-swatch'
      const style = seriesStyle(series.index)
      swatch.style.borderColor = style.color
      swatch.style.borderTopStyle = style.dash.length ? (style.dash[0] === 2 ? 'dotted' : 'dashed') : 'solid'
      const name = document.createElement('span'); name.textContent = series.name
      const data = this.app.overlays.xyChart.curveInfo.find(c => c.name === series.name)
      const unit = document.createElement('small'); unit.textContent = data ? data.units || 'unitless' : (series.key?.startsWith('showGrappler') ? '' : 'No data in this trajectory')
      label.append(check, swatch, name, unit); this.list.append(label)
    }
  }

  setRange(start, end) {
    const range = timeRange(start, end, this.app.store.get('launcherXyChartMaxT'))
    this.app.store.set('chartStartTime', range.start)
    this.app.store.set('chartEndTime', range.end)
    this.changed()
  }

  moveRange(id, start, end, delta) {
    const limit = this.app.overlays.xyChart.limit
    if (id === 'pan') {
      delta = Math.max(-start, Math.min(limit - end, delta))
      this.setRange(start + delta, end + delta)
    }
    else if (id === 'start') this.setRange(Math.min(end - 0.01, start + delta), end)
    else this.setRange(start, Math.max(start + 0.01, end + delta))
  }

  beginDrag(event, id) {
    if (event.button !== 0) return
    event.preventDefault(); event.stopPropagation()
    const handle = event.currentTarget, x = event.clientX
    const chart = this.app.overlays.xyChart
    const start = chart.minX, end = chart.maxX
    const scale = chart.limit / ((chart.width - 96) * this.displayScale)
    handle.setPointerCapture(event.pointerId)
    const move = e => this.moveRange(id, start, end, (e.clientX - x) * scale)
    const finish = () => { handle.removeEventListener('pointermove', move); handle.removeEventListener('lostpointercapture', finish) }
    handle.addEventListener('pointermove', move)
    handle.addEventListener('lostpointercapture', finish)
  }

  refresh() {
    for (const input of this.list?.querySelectorAll('input') ?? []) input.checked = this.app.overlays.xyChart.isSelected(input.dataset.name)
    if (this.count) this.count.textContent = `${this.choices().filter(s => this.app.overlays.xyChart.isSelected(s.name)).length} selected`
    this.layout()
  }

  layout() {
    const { overlays, renderer, shots } = this.app
    const c = overlays.xyChart, rect = overlays.chartRect
    this.root.hidden = !c.visible || !!shots?.recordingSize
    if (!rect || this.root.hidden) return
    const canvas = renderer.domElement.getBoundingClientRect()
    const scale = Math.min(canvas.width / overlays.width, canvas.height / overlays.height)
    this.displayScale = scale
    const x = canvas.left + (canvas.width - overlays.width * scale) / 2 + rect.x * scale
    const y = canvas.top + (canvas.height - overlays.height * scale) / 2 + rect.y * scale
    const layoutKey = [x, y, rect.width, rect.height, scale, c.minX, c.maxX, c.limit].join(',')
    if (layoutKey === this.layoutKey) return
    this.layoutKey = layoutKey
    Object.assign(this.root.style, { left: `${x}px`, top: `${y}px`, width: `${rect.width}px`, height: `${rect.height}px`, transform: `scale(${scale})`, transformOrigin: 'top left' })
    const track = rect.width - 96, a = 76 + c.minX / c.limit * track, b = 76 + c.maxX / c.limit * track
    this.handles.start.style.left = `${a - 10}px`
    this.handles.end.style.left = `${b - 10}px`
    this.handles.pan.style.left = `${a + 10}px`
    this.handles.pan.style.width = `${Math.max(0, b - a - 20)}px`
    this.handles.pan.hidden = b - a < 24
    for (const id of ['start', 'end']) {
      const value = id === 'start' ? c.minX : c.maxX
      const h = this.handles[id]
      h.setAttribute('aria-valuemin', id === 'start' ? '0' : String(c.minX + 0.01))
      h.setAttribute('aria-valuemax', id === 'start' ? String(c.maxX - 0.01) : String(c.limit))
      h.setAttribute('aria-valuenow', String(value))
      h.setAttribute('aria-valuetext', `${formatValue(value)} seconds`)
    }
  }
}
