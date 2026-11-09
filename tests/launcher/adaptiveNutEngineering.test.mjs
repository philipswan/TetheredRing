import test from 'node:test'
import assert from 'node:assert/strict'
import { createParameterDefinitions } from '../../src/params/parameterDefinitions.js'
import { ParameterStore } from '../../src/params/ParameterStore.js'
import { adaptiveNutEngineering,adaptiveNutContactSizing } from '../../src/launcher/adaptiveNutEngineering.js'
import { launchSledLayout } from '../../src/launcher/LaunchSledGeometry.js'
import { adaptiveNutBodyEnvelope,launchBodyColors } from '../../src/launcher/launchAssemblyLayout.js'

const near = (a,b) => assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`)
test('magnetic sizing returns all contact dimensions and responds to force and flux density', () => {
  const p = createParameterDefinitions(), specs = {}
  const sizing = adaptiveNutEngineering(p,specs,1e6)
  near(sizing.grapplerPadContactLength*sizing.grapplerPadContactWidth*sizing.launcherGrapplerTotalContactFlights,sizing.launcherGrapplerTotalContactArea)
  near(adaptiveNutEngineering(p,{},2e6).grapplerPadContactLength,2*sizing.grapplerPadContactLength)
  p.launcherMassDriverScrewFlightSaturationFluxDensity.value *= 2
  near(adaptiveNutEngineering(p,{},1e6).grapplerPadContactLength,sizing.grapplerPadContactLength/4)
  assert.equal(specs.grapplerPadContactLength.units,'m')
})
test('automatic contact sizing moves vehicle and sled together and preserves grappler density', () => {
  const p = createParameterDefinitions(), store = new ParameterStore(p), d = store.derived
  const sizing = adaptiveNutContactSizing(d)
  near(d.adaptiveNutBodyLength.value,sizing.grapplerPadContactLength)
  near(d.adaptiveNutGrapplerLength.value,sizing.grapplerPadContactLength)
  const aft = launchSledLayout(d).aft
  near(d.launchVehicleForwardsOffset.value,aft*d.launchSystemForwardScaleFactor.value)
  near(aft-adaptiveNutBodyEnvelope(d).front,0.25)
  assert.ok(d.adaptiveNutGrapplerLength.value/d.adaptiveNutNumGrapplers.value <= p.adaptiveNutGrapplerLength.value/p.adaptiveNutNumGrapplers.value)
  p.launchVehiclePayloadMass.value *= 2
  store.derive()
  near(d.launchVehicleForwardsOffset.value,launchSledLayout(d).aft*d.launchSystemForwardScaleFactor.value)
  p.adaptiveNutAutoSize.value = false
  store.derive()
  near(d.adaptiveNutBodyLength.value,p.adaptiveNutBodyLength.value)
  near(d.adaptiveNutNumGrapplers.value,p.adaptiveNutNumGrapplers.value)
  assert.notEqual(launchBodyColors.sled,launchBodyColors.adaptiveNut)
})
