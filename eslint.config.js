import js from '@eslint/js'
import globals from 'globals'

export default [
  { ignores: ['.scratch/', '.claude/', '.worktrees/', 'src/launcher/datasets/', 'dist/', 'node_modules/', 'assets/', 'textures/', 'basis/', 'components/', 'tools/'] },
  js.configs.recommended,
  {
    files: ['src/**/*.js'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: { ...globals.browser } },
    rules: {
      // The existing code base has many unused variables and empty blocks; keep the signal on
      // things that are actually broken.
      'no-unused-vars': 'off',
      'no-empty': 'off',
      'no-debugger': 'error',
      'no-prototype-builtins': 'off',
      'no-case-declarations': 'off',
    },
  },
  {
    // Injected into the page by scripts/profile.mjs, so it is browser code defining one function.
    files: ['scripts/profile/*.js'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'script', globals: { ...globals.browser } },
    rules: { 'no-unused-vars': 'off' },
  },
  {
    files: ['scripts/**/*.mjs', 'tests/**/*.mjs', 'eslint.config.js', 'vite.config.js'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: { ...globals.node } },
  },
]
