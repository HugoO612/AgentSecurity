import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/health': createBridgeProxy(),
      '/actions': createBridgeProxy(),
      '/environments': createBridgeProxy(),
    },
  },
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: './src/tests/setup.ts',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
    },
  },
})

function createBridgeProxy() {
  const port = process.env.AGENT_SECURITY_BRIDGE_PORT ?? '4319'
  const token =
    process.env.AGENT_SECURITY_BRIDGE_TOKEN ?? 'agent-security-dev-token'

  return {
    target: `http://127.0.0.1:${port}`,
    changeOrigin: true,
    configure(proxy: unknown) {
      const typedProxy = proxy as {
        on: (
          event: 'proxyReq',
          handler: (proxyReq: { setHeader: (name: string, value: string) => void }) => void,
        ) => void
      }
      typedProxy.on('proxyReq', (proxyReq) => {
        proxyReq.setHeader('x-agent-security-token', token)
      })
    },
  }
}
