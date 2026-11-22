import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import viteTsConfigPaths from 'vite-tsconfig-paths'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'

const config = defineConfig({
  ssr: {
    // Tree-shake Start re-exports and resolve icons with Vite's production
    // conditions before Nitro bundles the server.
    noExternal: ['@tanstack/router-core', '@hugeicons/core-free-icons'],
  },
  environments: {
    client: {
      build: {
        rollupOptions: {
          output: {
            manualChunks(id) {
              if (
                id.includes('/node_modules/react/') ||
                id.includes('/node_modules/react-dom/') ||
                id.includes('/node_modules/scheduler/')
              )
                return 'react'
              if (id.includes('/node_modules/@base-ui/')) return 'base-ui'
            },
          },
        },
      },
    },
  },
  plugins: [
    devtools({
      eventBusConfig: {
        enabled: false,
      },
    }),
    nitro(),
    // this is the plugin that enables path aliases
    viteTsConfigPaths({
      projects: ['./tsconfig.json'],
    }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
})

export default config
