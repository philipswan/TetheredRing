// A fixed-size pool of three.js models (usually clones of one loaded FBX model).
// Models are only in the scene graph while they are allocated, so released models cost nothing
// in updateMatrixWorld or rendering. The pool never grows past the configured size; when it runs
// out, `acquire()` returns null and the shortage is counted so it can be reported once.
export class ModelPool {
  // highlight: Highlights class of the models (src/scene/Highlights.js).
  constructor(name, size, { highlight } = {}) {
    this.name = name
    this.highlight = highlight
    this.size = size
    this.free = []
    this.inUse = new Set()
    this.parent = null
    this.template = null
    this.shortage = 0
  }

  // Fill the pool with `size` clones of `template`. Called when a model finishes loading.
  setTemplate(template) {
    this.template = template
    template.visible = false
    if (this.highlight) template.userData.highlight = this.highlight
    const toCreate = Math.max(0, this.size - this.free.length - this.inUse.size)
    for (let i = 0; i < toCreate; i++) {
      const model = template.clone()
      model.visible = false
      this.free.push(model)
    }
  }

  get isLoaded() {
    return this.template !== null
  }

  // Move allocated models to a new parent (e.g. after the ring's coordinate system is rebuilt).
  setParent(parent) {
    if (this.parent === parent) return
    this.inUse.forEach(model => {
      if (model.parent) model.parent.remove(model)
      if (parent) parent.add(model)
    })
    this.parent = parent
  }

  // A model can be had now (loaded, and one free).
  get available() {
    return !!this.template && this.free.length > 0
  }

  acquire() {
    if (!this.template) return null   // still loading (or not shown); not a shortage
    const model = this.free.pop()
    if (!model) {
      this.shortage++
      return null
    }
    this.inUse.add(model)
    if (this.parent) this.parent.add(model)
    return model
  }

  release(model) {
    if (!model || !this.inUse.has(model)) return
    this.inUse.delete(model)
    if (model.parent) model.parent.remove(model)
    model.visible = false
    this.free.push(model)
  }

  // Report (once) and reset the shortage counter.
  reportShortage() {
    if (this.shortage > 0) {
      console.warn(`ModelPool '${this.name}': ran out of models (${this.shortage} requests unmet, pool size ${this.size}).`)
      this.shortage = 0
    }
  }
}
