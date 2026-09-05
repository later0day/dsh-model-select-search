/**
 * tsdown build for dsh-model-select-search:
 * - lib/index.js: host-side no-op (ESM)
 * - lib/client-registry.js: client bundle (CJS ModuleLoader factory)
 */
import { readFile } from 'node:fs/promises'
import { dirname, resolve as resolvePath } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { UserConfig } from 'tsdown'

const REPO_ROOT = dirname(fileURLToPath(import.meta.url))

/** Inject a CSS string as a <style data-plugin> tag. */
function injectCss(pluginId: string, cssText: string): string {
  return [
    `const css = ${JSON.stringify(cssText)};`,
    `const tagId = ${JSON.stringify(pluginId + '/styles')};`,
    `if (typeof document !== 'undefined' && !document.querySelector('style[data-plugin-css=' + JSON.stringify(tagId) + ']')) {`,
    `  const tag = document.createElement('style');`,
    `  tag.dataset.plugin = ${JSON.stringify(pluginId)};`,
    `  tag.dataset.pluginCss = tagId;`,
    `  tag.textContent = css;`,
    `  document.head.appendChild(tag);`,
    `}`,
  ].join('\n')
}

export default [
  // Host-side no-op (ESM)
  {
    entry: { index: 'src/index.ts' },
    outDir: 'lib',
    format: 'esm',
    platform: 'node',
    target: 'es2024',
    fixedExtension: false,
    dts: false,
    clean: false,
  },
  // Client bundle (CJS ModuleLoader factory) — official channel
  {
    entry: { 'client': 'src/client/index.ts' },
    outDir: 'lib',
    format: 'cjs',
    platform: 'browser',
    dts: false,
    sourcemap: true,
    clean: false,
    plugins: [
      {
        name: 'dsh-css-inline',
        resolveId(source: string, importer: string | undefined) {
          if (!source.endsWith('.css')) return null
          let abs: string
          if (source.startsWith('.') || source.startsWith('/')) {
            abs = importer === undefined ? source : resolvePath(dirname(importer), source)
          } else {
            abs = resolvePath(REPO_ROOT, source)
          }
          return '\0dsh-css:' + abs + '.mjs'
        },
        async load(virtualId: string) {
          if (!virtualId.startsWith('\0dsh-css:')) return null
          const fileId = virtualId.slice('\0dsh-css:'.length, -'.mjs'.length)
          this.addWatchFile(fileId)
          const source = await readFile(fileId)
          return injectCss('dsh-model-select-search', source.toString('utf8'))
        },
      },
    ],
    outputOptions: {
      entryFileNames: 'client.js',
      banner: `window.__ModuleLoader__.load({ id: "dsh-model-select-search", factory: (require) => {`,
      footer: `return module.exports; } });`,
      intro: 'var module = { exports: {} }; var exports = module.exports;',
      codeSplitting: false,
    },
  },
  // Client bundle (CJS ModuleLoader factory) — registry channel
  {
    entry: { 'client-registry': 'src/client/index.ts' },
    outDir: 'lib',
    format: 'cjs',
    platform: 'browser',
    dts: false,
    sourcemap: true,
    clean: false,
    plugins: [
      {
        name: 'dsh-css-inline',
        resolveId(source: string, importer: string | undefined) {
          if (!source.endsWith('.css')) return null
          let abs: string
          if (source.startsWith('.') || source.startsWith('/')) {
            abs = importer === undefined ? source : resolvePath(dirname(importer), source)
          } else {
            abs = resolvePath(REPO_ROOT, source)
          }
          return '\0dsh-css:' + abs + '.mjs'
        },
        async load(virtualId: string) {
          if (!virtualId.startsWith('\0dsh-css:')) return null
          const fileId = virtualId.slice('\0dsh-css:'.length, -'.mjs'.length)
          this.addWatchFile(fileId)
          const source = await readFile(fileId)
          return injectCss('dsh-external/dsh-model-select-search', source.toString('utf8'))
        },
      },
    ],
    outputOptions: {
      entryFileNames: 'client-registry.js',
      banner: `window.__ModuleLoader__.load({ id: "dsh-external/dsh-model-select-search", factory: (require) => {`,
      footer: `return module.exports; } });`,
      intro: 'var module = { exports: {} }; var exports = module.exports;',
      codeSplitting: false,
    },
  },
] satisfies UserConfig[]