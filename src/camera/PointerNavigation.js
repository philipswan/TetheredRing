// Turns mouse, touchpad and touchscreen input on the canvas into camera gestures. It knows nothing
// about the scene: it reports gestures in client pixels to a handler (CameraController), which decides
// what they move.
//
//   Mouse      left drag: orbit             right drag (or shift + left): pan (grab)
//              ctrl/alt + left drag: look around from where the camera is
//              middle drag: move in/out     wheel: move towards/away from the point under the cursor
//              double-click: fly to (or follow) what is under the cursor
//   Touchpad   pinch: move in/out           two-finger scroll: pan (or orbit with shift; see
//              cameraTouchpadScroll)         click-drag: as the mouse
//   Touch      one finger: orbit            two fingers: pan, pinch to move in/out, twist to turn
//              double tap: fly to
//
// Handler methods (all optional except where used):
//   enabled() -> bool
//   beginDrag(kind, x, y)   kind: 'orbit' | 'pan' | 'look' | 'dolly' | 'scrollpan'
//   drag(kind, x, y, dx, dy)
//   endDrag(kind)
//   zoomAt(x, y, factor)    factor < 1 moves closer (the distance is multiplied by it)
//   twist(x, y, angle)      radians, anticlockwise on screen
//   doubleClick(x, y)
//   scrollPan(x, y, mx, my) touchpad scrolling: the scene under the pointer moves by (mx, my)
//   scrollMode() -> 'auto' | 'pan' | 'orbit' | 'zoom'   what touchpad scrolling does
//   zoomSpeed() -> number
import { classifyWheel } from './cameraMath.js'

const DRAG_THRESHOLD_PX = 3
const SCROLL_GESTURE_END_MS = 160
const DOUBLE_TAP_MS = 350

export class PointerNavigation {
  constructor(domElement, handler) {
    this.domElement = domElement
    this.handler = handler
    this.pointers = new Map() // pointerId -> { x, y, startX, startY, button, kind, dragging, pointerType }
    this.mode = null // current single-pointer drag kind
    this.touch = null // two-finger gesture state
    this.scroll = null // { kind, x, y, timer } touchpad scroll treated as a drag
    this.wheelClass = null
    this.wheelClassTime = 0
    this.lastTap = null

    this.onPointerDown = this.onPointerDown.bind(this)
    this.onPointerMove = this.onPointerMove.bind(this)
    this.onPointerUp = this.onPointerUp.bind(this)
    this.onWheel = this.onWheel.bind(this)
    this.onContextMenu = (e) => e.preventDefault()
    this.onDoubleClick = this.onDoubleClick.bind(this)
    this.onGesture = (e) => e.preventDefault() // Safari's own pinch gestures

    domElement.style.touchAction = 'none'
    domElement.addEventListener('pointerdown', this.onPointerDown)
    domElement.addEventListener('pointermove', this.onPointerMove)
    domElement.addEventListener('pointerup', this.onPointerUp)
    domElement.addEventListener('pointercancel', this.onPointerUp)
    domElement.addEventListener('wheel', this.onWheel, { passive: false })
    domElement.addEventListener('contextmenu', this.onContextMenu)
    domElement.addEventListener('dblclick', this.onDoubleClick)
    domElement.addEventListener('gesturestart', this.onGesture)
  }

  dispose() {
    const d = this.domElement
    d.removeEventListener('pointerdown', this.onPointerDown)
    d.removeEventListener('pointermove', this.onPointerMove)
    d.removeEventListener('pointerup', this.onPointerUp)
    d.removeEventListener('pointercancel', this.onPointerUp)
    d.removeEventListener('wheel', this.onWheel)
    d.removeEventListener('contextmenu', this.onContextMenu)
    d.removeEventListener('dblclick', this.onDoubleClick)
    d.removeEventListener('gesturestart', this.onGesture)
  }

  enabled() {
    return this.handler.enabled?.() ?? true
  }

  call(name, ...args) {
    return this.handler[name]?.(...args)
  }

  // ---- Pointers ----------------------------------------------------------------------------------

  kindFor(event) {
    if (event.pointerType === 'touch') return 'orbit'
    if (event.button === 2 || (event.button === 0 && event.shiftKey)) return 'pan'
    if (event.button === 1) return 'dolly'
    if (event.button === 0 && (event.ctrlKey || event.altKey || event.metaKey)) return 'look'
    return event.button === 0 ? 'orbit' : null
  }

  onPointerDown(event) {
    if (!this.enabled()) return
    const kind = this.kindFor(event)
    if (!kind) return
    this.endScroll()
    this.domElement.setPointerCapture?.(event.pointerId)
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, kind, dragging: false, pointerType: event.pointerType })
    if (event.pointerType === 'touch') {
      if (this.pointers.size === 2) {
        // A second finger: whatever the first was doing becomes a two-finger gesture.
        this.endSingle()
        this.beginTouch()
      }
      else if (this.pointers.size === 1) this.detectDoubleTap(event)
    }
  }

  onPointerMove(event) {
    const p = this.pointers.get(event.pointerId)
    if (!p) return
    const dx = event.clientX - p.x
    const dy = event.clientY - p.y
    p.x = event.clientX
    p.y = event.clientY
    if (!this.enabled()) return
    if (this.touch) {
      this.moveTouch()
      return
    }
    if (!p.dragging) {
      if (Math.hypot(p.x - p.startX, p.y - p.startY) < DRAG_THRESHOLD_PX) return
      p.dragging = true
      this.mode = p.kind
      this.call('beginDrag', p.kind, p.startX, p.startY)
      this.call('drag', p.kind, p.x, p.y, p.x - p.startX, p.y - p.startY)
      return
    }
    this.call('drag', p.kind, p.x, p.y, dx, dy)
  }

  onPointerUp(event) {
    const p = this.pointers.get(event.pointerId)
    if (!p) return
    this.pointers.delete(event.pointerId)
    this.domElement.releasePointerCapture?.(event.pointerId)
    if (this.touch) {
      if (this.pointers.size < 2) {
        this.touch = null
        this.call('endDrag', 'pan')
        // The remaining finger restarts a one-finger orbit from where it is.
        for (const q of this.pointers.values()) {
          q.startX = q.x
          q.startY = q.y
          q.dragging = false
        }
      }
      return
    }
    if (p.dragging) this.endSingle()
  }

  endSingle() {
    if (this.mode) this.call('endDrag', this.mode)
    this.mode = null
    for (const p of this.pointers.values()) p.dragging = false
  }

  detectDoubleTap(event) {
    const now = event.timeStamp
    const last = this.lastTap
    if (last && now - last.time < DOUBLE_TAP_MS && Math.hypot(event.clientX - last.x, event.clientY - last.y) < 30) {
      this.lastTap = null
      this.call('doubleClick', event.clientX, event.clientY)
      return
    }
    this.lastTap = { time: now, x: event.clientX, y: event.clientY }
  }

  onDoubleClick(event) {
    if (!this.enabled() || event.pointerType === 'touch') return
    this.call('doubleClick', event.clientX, event.clientY)
  }

  // ---- Two fingers -----------------------------------------------------------------------------

  touchGeometry() {
    const [a, b] = [...this.pointers.values()]
    return {
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
      distance: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)),
      angle: Math.atan2(b.y - a.y, b.x - a.x),
    }
  }

  beginTouch() {
    this.touch = this.touchGeometry()
    this.call('beginDrag', 'pan', this.touch.x, this.touch.y)
  }

  moveTouch() {
    if (this.pointers.size < 2) return
    const g = this.touchGeometry()
    const t = this.touch
    this.call('drag', 'pan', g.x, g.y, g.x - t.x, g.y - t.y)
    if (g.distance !== t.distance) this.call('zoomAt', g.x, g.y, t.distance / g.distance)
    let turn = g.angle - t.angle
    if (turn > Math.PI) turn -= 2 * Math.PI
    if (turn < -Math.PI) turn += 2 * Math.PI
    // (Screen y points down, so a clockwise-looking change of atan2 is anticlockwise on screen.)
    if (turn !== 0) this.call('twist', g.x, g.y, -turn)
    this.touch = g
  }

  // ---- Wheel and touchpad -----------------------------------------------------------------------

  onWheel(event) {
    if (!this.enabled()) return
    event.preventDefault()
    const now = event.timeStamp
    const recent = now - this.wheelClassTime < 250 ? this.wheelClass : null
    const kind = classifyWheel(event, recent)
    this.wheelClass = kind
    this.wheelClassTime = now
    const pixels = event.deltaMode === 1 ? 40 : event.deltaMode === 2 ? 800 : 1
    const dx = event.deltaX * pixels
    const dy = event.deltaY * pixels
    const speed = this.call('zoomSpeed') ?? 1
    if (kind === 'pinch') {
      this.endScroll()
      this.call('zoomAt', event.clientX, event.clientY, Math.exp(dy * 0.01 * speed))
      return
    }
    let scroll = this.call('scrollMode') ?? 'auto'
    if (kind === 'wheel' || scroll === 'zoom') {
      this.endScroll()
      this.call('zoomAt', event.clientX, event.clientY, Math.exp(dy * 0.0025 * speed))
      return
    }
    if (scroll === 'auto') scroll = event.shiftKey ? 'orbit' : 'pan'
    else if (event.shiftKey) scroll = scroll === 'pan' ? 'orbit' : 'pan'
    // Touchpad scrolling: a drag of a virtual pointer that starts under the cursor.
    if (this.scroll && this.scroll.kind !== scroll) this.endScroll()
    if (!this.scroll) {
      this.scroll = { kind: scroll, x: event.clientX, y: event.clientY, timer: null }
      this.call('beginDrag', scroll === 'pan' ? 'scrollpan' : scroll, this.scroll.x, this.scroll.y)
    }
    const s = this.scroll
    if (scroll === 'pan') this.call('scrollPan', event.clientX, event.clientY, -dx, -dy)
    else {
      s.x -= dx
      s.y -= dy
      this.call('drag', scroll, s.x, s.y, -dx, -dy)
    }
    clearTimeout(s.timer)
    s.timer = setTimeout(() => this.endScroll(), SCROLL_GESTURE_END_MS)
  }

  endScroll() {
    const s = this.scroll
    if (!s) return
    clearTimeout(s.timer)
    this.scroll = null
    this.call('endDrag', s.kind === 'pan' ? 'scrollpan' : s.kind)
  }
}
