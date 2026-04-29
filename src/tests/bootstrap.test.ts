import { afterEach, describe, expect, it } from 'vitest'
import { resolveBootstrap } from '../api/bootstrap'

const originalWindow = globalThis.window

afterEach(() => {
  if (originalWindow) {
    globalThis.window = originalWindow
  } else {
    // @ts-expect-error test cleanup
    delete globalThis.window
  }
})

describe('bootstrap validation', () => {
  it('accepts preview bootstrap without mock fallback', () => {
    Object.defineProperty(globalThis, 'window', {
      value: {
        location: {
          origin: 'http://localhost:5173',
        },
        __AGENT_SECURITY_BOOTSTRAP__: {
          version: 'v1',
          mode: 'preview',
          sessionToken: 'preview-token',
          bridgeBaseUrl: 'http://127.0.0.1:4319',
          appOrigin: 'http://localhost:5173',
          allowMockFallback: false,
        },
      },
      configurable: true,
    })

    const result = resolveBootstrap()
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.bootstrap.mode).toBe('preview')
    }
  })

  it('rejects preview bootstrap when mock fallback is enabled', () => {
    Object.defineProperty(globalThis, 'window', {
      value: {
        location: {
          origin: 'http://localhost:5173',
        },
        __AGENT_SECURITY_BOOTSTRAP__: {
          version: 'v1',
          mode: 'preview',
          sessionToken: 'preview-token',
          bridgeBaseUrl: 'http://127.0.0.1:4319',
          appOrigin: 'http://localhost:5173',
          allowMockFallback: true,
        },
      },
      configurable: true,
    })

    const result = resolveBootstrap()
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe('bootstrap_mock_forbidden_in_production')
    }
  })

  it('accepts desktop bootstrap when the renderer origin is null', () => {
    Object.defineProperty(globalThis, 'window', {
      value: {
        location: {
          origin: 'null',
        },
        __AGENT_SECURITY_BOOTSTRAP__: {
          version: 'v1',
          mode: 'production',
          sessionToken: 'desktop-token',
          bridgeBaseUrl: 'http://127.0.0.1:4319',
          appOrigin: 'null',
          allowMockFallback: false,
        },
      },
      configurable: true,
    })

    const result = resolveBootstrap()
    expect(result.ok).toBe(true)
  })
})
