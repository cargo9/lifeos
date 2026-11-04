import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api': {
          target: 'http://100.119.158.113:3000',
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/api/, ''),
          headers: { Authorization: `Bearer ${env.LIFEOS_TOKEN}` },
        },
      },
    },
  }
})