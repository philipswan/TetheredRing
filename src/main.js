import './styles.css'
// (First: counts every three.js loader's loads from the start, for recordings; see PendingWork.js.)
import './core/PendingWork.js'
import { App } from './app/App.js'

// URL parameters:
//   ?preset=<id>      scene preset to load (see src/presets/presets.js)
//   ?enableVR=true    enable WebXR
//   ?planetAssets=a,b override the planet tile sets to stream
//   ?earthTiles=<name> the Earth's global tile set (earth or earth_hires)
//   ?quality=auto|high|balanced|low  graphics quality (otherwise the last choice, default auto)
//   ?msaa=off         no multisample antialiasing on the canvas (faster on weak graphics; recordings
//                     can still be supersampled)
//   ?view=<json>      open exactly this view (the view status's Copy view link: src/ui/ViewStatus.js)
const url = new URL(window.location.href)
const app = new App(document.querySelector('#simContainer'), {
  presetId: url.searchParams.get('preset') ?? undefined,
  enableVR: url.searchParams.get('enableVR') === 'true',
  quality: url.searchParams.get('quality') ?? undefined,
  antialias: url.searchParams.get('msaa') !== 'off',
  view: (() => {
    try { return JSON.parse(url.searchParams.get('view') ?? 'null') }
    catch { console.warn('The ?view= link is not valid JSON; ignoring it'); return null }
  })(),
})

try {
  await app.init()
  app.start()
}
catch (err) {
  console.error(err)
  const message = document.createElement('div')
  message.className = 'startup-error'
  message.textContent = `The simulation failed to start:\n${err.stack ?? err}`
  document.body.appendChild(message)
}

// Debug handle for the browser console and automated tests (scripts/smoke.mjs --eval).
window.tetheredRing = {
  app,
  get THREE() { return import('three') },
  get scene() { return app.scene },
  get camera() { return app.camera3d },
  get renderer() { return app.renderer },
  get orbitControls() { return app.camera?.controls },
  get planetCoordSys() { return app.planetCoordSys },
  get transitSystem() { return app.transitSystem },
  get launchSystem() { return app.launchSystem },
  get tetheredRingRefCoordSys() { return app.ring?.refCoordSys },
  get dParamWithUnits() { return app.store?.derived },
  get timeSinceStart() { return app.clock.time },
}
