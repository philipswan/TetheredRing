import test from 'node:test'
import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'
import { randomUUID } from '../../src/utils/randomUUID.js'

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

test('uses crypto.randomUUID when the page provides it', () => {
  assert.equal(randomUUID({ randomUUID: () => 'from-browser' }), 'from-browser')
})

test('builds a version-4 UUID on pages without crypto.randomUUID (plain http)', () => {
  // On a non-secure page the browser's crypto object has getRandomValues but no randomUUID.
  const insecure = { getRandomValues: array => webcrypto.getRandomValues(array) }
  const ids = new Set()
  for (let i = 0; i < 200; i++) {
    const id = randomUUID(insecure)
    assert.match(id, UUID_V4)
    ids.add(id)
  }
  assert.equal(ids.size, 200)
})

test('fallback sets the version and variant bits whatever the random bytes are', () => {
  for (const fill of [0x00, 0xff]) {
    assert.match(randomUUID({ getRandomValues: array => array.fill(fill) }), UUID_V4)
  }
})

test('generated ids are valid shot project ids', () => {
  assert.match(randomUUID({ getRandomValues: array => webcrypto.getRandomValues(array) }), /^[a-zA-Z0-9_-]+$/)
})
