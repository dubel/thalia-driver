import { defineConfig } from 'vite'

export default defineConfig({
  base: '/thalia-driver/',
  server: {
    port: 5173,
    host: true,
  },
  assetsInclude: ['**/*.glb'],
})
