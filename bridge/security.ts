import type { IncomingMessage, ServerResponse } from 'node:http'
import type { BridgeErrorResponse } from '../src/contracts/environment.ts'
import type { BridgeConfig } from './config.ts'

const TOKEN_HEADER = 'x-agent-security-token'

export type RequestRejection = {
  status: 400 | 401 | 403
  body: BridgeErrorResponse
}

export function validateBridgeRequest(
  request: IncomingMessage,
  config: BridgeConfig,
): RequestRejection | null {
  const host = request.headers.host?.trim() ?? ''
  if (!config.allowedHosts.has(host)) {
    return {
      status: 403,
      body: {
        ok: false,
        error: {
          code: 'origin_host_forbidden',
          message: 'The current host is not allowed.',
          retryable: false,
          kind: 'bridge_forbidden',
          stage: 'bridge_connection',
        },
      },
    }
  }

  const origin = request.headers.origin?.trim()
  if (origin && !config.allowedOrigins.has(origin)) {
    return {
      status: 403,
      body: {
        ok: false,
        error: {
          code: 'origin_not_allowed',
          message: 'The current origin is not allowed.',
          retryable: false,
          kind: 'bridge_forbidden',
          stage: 'bridge_connection',
        },
      },
    }
  }

  const token = request.headers[TOKEN_HEADER]
  const resolvedToken = Array.isArray(token) ? token[0] : token
  if (resolvedToken !== config.token) {
    return {
      status: 401,
      body: {
        ok: false,
        error: {
          code: 'invalid_token',
          message: 'The current session is not trusted by the bridge.',
          retryable: true,
          kind: 'bridge_untrusted',
          stage: 'bridge_connection',
        },
      },
    }
  }

  return null
}

export function applyCors(
  request: IncomingMessage,
  response: ServerResponse,
  config: BridgeConfig,
) {
  const origin = request.headers.origin?.trim()
  if (origin && config.allowedOrigins.has(origin)) {
    response.setHeader('Access-Control-Allow-Origin', origin)
    response.setHeader('Vary', 'Origin')
  }

  response.setHeader('Access-Control-Allow-Headers', 'content-type, x-agent-security-token')
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
}

export async function readJsonBody<T>(request: IncomingMessage): Promise<T> {
  const chunks: Uint8Array[] = []

  for await (const chunk of request) {
    chunks.push(
      chunk instanceof Uint8Array ? chunk : Buffer.from(String(chunk)),
    )
  }

  const content = Buffer.concat(chunks).toString('utf8')
  return (content ? JSON.parse(content) : {}) as T
}
