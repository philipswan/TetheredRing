import { GUI } from 'three/addons/libs/lil-gui.module.min.js'

const FOLDER_ORDER = ['Geography', 'Engineering', 'Launcher', 'Rocket', 'Grapplers', 'Materials', 'Economics', 'Rendering', 'Chart', 'Camera', 'TextOutput']
const FOLDER_TITLES = { Geography: 'Location' }

// Builds the lil-gui panel for a ParameterStore. When a control changes, the parameter's `onChange`
// handler name is looked up in `handlers` and called with the key.
export class ParameterGui {
  constructor(store, handlers, { title = 'Controls', width = 500 } = {}) {
    this.store = store
    this.handlers = handlers
    this.gui = new GUI({ title, width })
    this.gui.close()
    this.folders = {}
    for (const name of FOLDER_ORDER) this.folder(name)

    // Put the chart's enable switch ahead of its telemetry duration and layout settings.
    const entries = Object.entries(store.definitions)
    entries.sort(([a], [b]) => Number(b === 'showXYChart') - Number(a === 'showXYChart'))
    for (const [key, def] of entries) {
      if (def.hidden) continue
      if (def.folder === 'Chart' && key.endsWith('VersusTime')) continue
      const folder = this.folder(def.folder ?? 'Rendering')
      let controller
      if (def.options) {
        controller = folder.add(store.values, key, def.options)
      }
      else if (typeof def.value === 'string' && /^#[0-9a-f]{6}$/i.test(def.value)) {
        controller = folder.addColor(store.values, key)
      }
      else {
        controller = folder.add(store.values, key, def.min, def.max, def.step)
      }
      if (def.label) controller.name(def.label)
      if (key === 'showXYChart') controller.name('Show chart')
      if (key === 'launcherXyChartMaxT') controller.name('Telemetry duration (s)')
      controller.onChange(() => this.dispatch(key))
      if (key === 'showXYChart' && handlers.applyChartSettingsToShot) {
        folder.add({ apply: handlers.applyChartSettingsToShot }, 'apply').name('Apply chart settings to shot')
      }
    }
  }

  folder(name) {
    if (!this.folders[name]) this.folders[name] = this.gui.addFolder(FOLDER_TITLES[name] ?? name).close()
    return this.folders[name]
  }

  dispatch(key) {
    const name = this.store.definitions[key].onChange
    this.store.derive()
    if (!name) return
    const handler = this.handlers[name]
    if (handler) handler(key)
    else console.warn(`No handler "${name}" for parameter "${key}"`)
  }

  // Refreshes every control after values were changed programmatically.
  refresh() {
    for (const controller of this.gui.controllersRecursive()) controller.updateDisplay()
  }
}
