// A random version-4 UUID. Browsers only expose crypto.randomUUID() on secure pages (https:// or localhost),
// so a page served over plain http, such as the dev server opened by LAN or Tailscale address, builds one from
// crypto.getRandomValues(), which is available on every page.
export function randomUUID(source = globalThis.crypto) {
  if (typeof source.randomUUID === 'function') return source.randomUUID()
  const bytes = source.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40 // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80 // RFC 4122 variant
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
