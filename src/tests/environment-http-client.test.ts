import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  BridgeRequestError,
  createHttpEnvironmentClient,
} from '../api/environment-http-client'

describe('http environment client', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('maps timeout to bridge_unavailable with bridge_timeout code', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) => {
        return new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal
          if (!signal) {
            return
          }

          if (signal.aborted) {
            reject(new DOMException('Aborted', 'AbortError'))
            return
          }

          signal.addEventListener(
            'abort',
            () => reject(new DOMException('Aborted', 'AbortError')),
            { once: true },
          )
        })
      }),
    )

    const client = createHttpEnvironmentClient({
      baseUrl: 'http://127.0.0.1:4319',
      token: 'test-token',
      requestTimeoutMs: 5,
    })

    await expect(client.getSnapshot('local-default')).rejects.toBeInstanceOf(
      BridgeRequestError,
    )
    expect(client.getDiagnostics?.()?.connectionFailure?.kind).toBe(
      'bridge_unavailable',
    )
    expect(client.getDiagnostics?.()?.connectionFailure?.code).toBe(
      'bridge_timeout',
    )
  })

  it('maps 401 to bridge_untrusted', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response(
          JSON.stringify({
            ok: false,
            error: {
              code: 'invalid_token',
              message: 'invalid token',
              retryable: true,
              kind: 'bridge_untrusted',
            },
          }),
          {
            status: 401,
            headers: { 'content-type': 'application/json' },
          },
        )
      }),
    )

    const client = createHttpEnvironmentClient({
      baseUrl: 'http://127.0.0.1:4319',
      token: 'wrong-token',
    })

    await expect(client.getSnapshot('local-default')).rejects.toBeInstanceOf(
      BridgeRequestError,
    )
    expect(client.getDiagnostics?.()?.connectionFailure?.kind).toBe(
      'bridge_untrusted',
    )
  })

  it('maps 403 to bridge_forbidden', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response(
          JSON.stringify({
            ok: false,
            error: {
              code: 'origin_not_allowed',
              message: 'forbidden',
              retryable: false,
              kind: 'bridge_forbidden',
            },
          }),
          {
            status: 403,
            headers: { 'content-type': 'application/json' },
          },
        )
      }),
    )

    const client = createHttpEnvironmentClient({
      baseUrl: 'http://127.0.0.1:4319',
      token: 'test-token',
    })

    await expect(client.getSnapshot('local-default')).rejects.toBeInstanceOf(
      BridgeRequestError,
    )
    expect(client.getDiagnostics?.()?.connectionFailure?.kind).toBe(
      'bridge_forbidden',
    )
  })
})
