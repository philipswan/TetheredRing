import vitePluginString from 'vite-plugin-string'

export default {
  plugins: [
    vitePluginString()
  ],
  server: {
    watch: {
      usePolling: true
    }
  }
}