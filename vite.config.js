import { defineConfig } from 'vite'
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))
function buildFingerprint() {
  const hash = createHash('sha256')
  function fingerprint(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(directory, entry.name)
      if (entry.isDirectory()) fingerprint(file)
      else { hash.update(path.relative(root, file).split(path.sep).join('/')); hash.update(readFileSync(file)) }
    }
  }
  fingerprint(path.join(root, 'src'))
  hash.update(readFileSync(path.join(root, 'package-lock.json')))
  return hash.digest('hex')
}

const renderBuildModule = '\0virtual:render-build'

export default defineConfig({
  plugins: [{
    name: 'render-build-fingerprint',
    resolveId(id) { if (id === 'virtual:render-build') return renderBuildModule },
    load(id) { if (id === renderBuildModule) return `export const RENDER_BUILD_ID = ${JSON.stringify(buildFingerprint())}` },
    handleHotUpdate({ file, server }) {
      const resolved = path.resolve(file)
      if (resolved.startsWith(path.join(root, 'src') + path.sep) || resolved === path.join(root, 'package-lock.json')) {
        server.moduleGraph.invalidateAll()
        server.ws.send({ type: 'full-reload' })
        return []
      }
    },
  }],
  server: {
    watch: {
      // assets/ holds several GB of LFS tiles and textures/ holds downloaded imagery.
      // Neither is source code, so keep them out of the file watcher.
      ignored: ['**/assets/**', '**/textures/**', '**/tools/**'],
    },
  },
  optimizeDeps: {
    // Pre-bundle dependencies that are only reached through dynamic imports so the first
    // recording does not trigger a dependency re-optimization and page reload.
    include: ['mediabunny'],
  },
})
