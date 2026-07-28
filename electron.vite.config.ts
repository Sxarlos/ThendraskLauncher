import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

const curseForgeEnabled = process.env.CURSEFORGE_ENABLED === 'true'
const restrictedCatalogsEnabled = process.env.RESTRICTED_CATALOGS_ENABLED === 'true'
const featureDefines = {
  __CURSEFORGE_ENABLED__: JSON.stringify(curseForgeEnabled),
  __RESTRICTED_CATALOGS_ENABLED__: JSON.stringify(restrictedCatalogsEnabled)
}

export default defineConfig({
  main: {
    define: featureDefines,
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'src/shared')
      }
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts')
        }
      }
    }
  },
  preload: {
    define: featureDefines,
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'src/shared')
      }
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts')
        }
      }
    }
  },
  renderer: {
    define: featureDefines,
    root: 'src/renderer',
    resolve: {
      alias: {
        '@renderer': resolve(__dirname, 'src/renderer/src'),
        '@shared': resolve(__dirname, 'src/shared')
      }
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html')
        }
      }
    },
    plugins: [react()]
  }
})
