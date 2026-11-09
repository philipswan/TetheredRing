import test from 'node:test'
import assert from 'node:assert/strict'
import { queuedTrainState } from '../../src/launcher/launchQueue.js'
const config = { period: 20, spacing: 63, advanceDelay: 2, advanceDuration: 10 }
const state = (k, t) => queuedTrainState(t - k * config.period, config)
const near = (a,b,tol=1e-7) => assert.ok(Math.abs(a-b)<tol, `${a} != ${b}`)

test('wait 2 seconds, advance one slot over 10 seconds, then hold 8 seconds', () => {
  for (const k of [1,2,3]) {
    for (const t of [0,1,2]) assert.deepEqual(state(k,t),{behind:k*63,speed:0,acceleration:0})
    near(state(k,7).behind,(k-0.5)*63)
    assert.ok(state(k,7).speed>0)
    for(const t of [12,15,19.999999]) {
      near(state(k,t).behind,(k-1)*63)
      near(state(k,t).speed,0)
      near(state(k,t).acceleration,0)
    }
  }
})

test('the advance repeats after each departure and is continuous at cycle boundaries', () => {
  near(state(3,20).behind,126)
  near(state(3,27).behind,94.5)
  near(state(3,32).behind,63)
  near(state(3,47).behind,31.5)
  near(state(3,52).behind,0)
  near(state(3,60).behind,0)
  for(const t of [2,12,20,22,32,40,42,52,60]) {
    near(state(3,t-1e-8).behind,state(3,t+1e-8).behind,1e-5)
    near(state(3,t-1e-8).speed,0,1e-5)
    near(state(3,t-1e-8).acceleration,0,1e-5)
  }
})

test('waiting trains retain their spacing, move monotonically, and rewind deterministically', () => {
  let previous=Infinity
  for(let t=0;t<40;t+=0.05) {
    const s=state(3,t)
    assert.ok(s.behind<=previous+1e-8)
    previous=s.behind
    near(s.behind-state(2,t).behind,63)
    assert.ok(s.speed<=63/10*1.875+1e-8)
  }
  const saved=state(3,7)
  state(3,55); state(3,0)
  assert.deepEqual(state(3,7),saved)
})
