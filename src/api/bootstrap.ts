import type {
  BootstrapConfig,
  BootstrapErrorCode,
  BridgeMode,
} from '../contracts/environment'

type BootstrapWindow = Window & {
  __AGENT_SECURITY_BOOTSTRAP__?: unknown
}

type BootstrapValidationResult =
  | {
      ok: true
      bootstrap: BootstrapConfig
    }
  | {
      ok: false
      code: BootstrapErrorCode
      message: string
    }

export function resolveBootstrap(): BootstrapValidationResult {
  if (typeof window === 'undefined') {
    return {
      ok: false,
      code: 'bootstrap_missing',
      message: 'Bootstrap is only available in the browser.',
    }
  }

  const injected = (window as BootstrapWindow).__AGENT_SECURITY_BOOTSTRAP__
  if (injected === undefined) {
    if (import.meta.env.DEV) {
      return {
        ok: true,
        bootstrap: {
          version: 'v1',
          mode: 'dev',
          sessionToken:
            import.meta.env.VITE_AGENT_SECURITY_DEV_TOKEN ?? 'agent-security-dev-proxy',
          bridgeBaseUrl: window.location.origin,
          appOrigin: window.location.origin,
          allowMockFallback: true,
        },
      }
    }

    return {
      ok: false,
      code: 'bootstrap_missing',
      message: 'The host application did not provide Agent Security bootstrap data.',
    }
  }

  if (typeof injected !== 'object' || injected === null) {
    return {
      ok: false,
      code: 'bootstrap_field_invalid',
      message: 'Bootstrap payload must be an object.',
    }
  }

  const candidate = injected as Record<string, unknown>
  if (candidate.version !== 'v1') {
    return {
      ok: false,
      code: 'bootstrap_version_unsupported',
      message: 'Unsupported bootstrap version.',
    }
  }

  const fieldError = validateFieldSet(candidate)
  if (fieldError) {
    return fieldError
  }

  const bridgeUrl = validateBridgeBaseUrl(candidate.bridgeBaseUrl as string)
  if (!bridgeUrl.ok) {
    return bridgeUrl
  }

  const mode = candidate.mode as BridgeMode
  if (mode !== 'dev' && (candidate.allowMockFallback as boolean)) {
    return {
      ok: false,
      code: 'bootstrap_mock_forbidden_in_production',
      message: 'Non-dev bootstrap cannot enable mock fallback.',
    }
  }

  const appOrigin = candidate.appOrigin as string
  if (appOrigin !== window.location.origin) {
    return {
      ok: false,
      code: 'bootstrap_field_invalid',
      message: 'Bootstrap app origin does not match the current page origin.',
    }
  }

  return {
    ok: true,
    bootstrap: {
      version: 'v1',
      mode,
      sessionToken: candidate.sessionToken as string,
      bridgeBaseUrl: bridgeUrl.url,
      appOrigin,
      allowMockFallback: candidate.allowMockFallback as boolean,
    },
  }
}

function validateFieldSet(
  candidate: Record<string, unknown>,
): Extract<BootstrapValidationResult, { ok: false }> | null {
  const requiredFields: Array<keyof BootstrapConfig> = [
    'version',
    'mode',
    'sessionToken',
    'bridgeBaseUrl',
    'appOrigin',
    'allowMockFallback',
  ]

  for (const field of requiredFields) {
    if (!(field in candidate)) {
      return {
        ok: false,
        code: 'bootstrap_field_missing',
        message: `Bootstrap field is missing: ${field}`,
      }
    }
  }

  if (
    candidate.mode !== 'dev' &&
    candidate.mode !== 'preview' &&
    candidate.mode !== 'production'
  ) {
    return {
      ok: false,
      code: 'bootstrap_field_invalid',
      message: 'Bootstrap mode must be dev, preview, or production.',
    }
  }

  if (
    typeof candidate.sessionToken !== 'string' ||
    candidate.sessionToken.trim().length === 0
  ) {
    return {
      ok: false,
      code: 'bootstrap_field_invalid',
      message: 'Bootstrap session token must be a non-empty string.',
    }
  }

  if (typeof candidate.bridgeBaseUrl !== 'string') {
    return {
      ok: false,
      code: 'bootstrap_field_invalid',
      message: 'Bootstrap bridgeBaseUrl must be a string.',
    }
  }

  if (typeof candidate.appOrigin !== 'string') {
    return {
      ok: false,
      code: 'bootstrap_field_invalid',
      message: 'Bootstrap appOrigin must be a string.',
    }
  }

  if (typeof candidate.allowMockFallback !== 'boolean') {
    return {
      ok: false,
      code: 'bootstrap_field_invalid',
      message: 'Bootstrap allowMockFallback must be a boolean.',
    }
  }

  return null
}

function validateBridgeBaseUrl(
  bridgeBaseUrl: string,
):
  | { ok: true; url: string }
  | Extract<BootstrapValidationResult, { ok: false }> {
  try {
    const url = new URL(bridgeBaseUrl)
    const host = url.hostname.toLowerCase()
    const port = Number(url.port)

    if (url.protocol !== 'http:') {
      return {
        ok: false,
        code: 'bootstrap_bridge_url_forbidden',
        message: 'bridgeBaseUrl must use http.',
      }
    }

    if (host !== '127.0.0.1' && host !== 'localhost') {
      return {
        ok: false,
        code: 'bootstrap_bridge_url_forbidden',
        message: 'bridgeBaseUrl must point to localhost.',
      }
    }

    if (url.username || url.password) {
      return {
        ok: false,
        code: 'bootstrap_bridge_url_forbidden',
        message: 'bridgeBaseUrl cannot include credentials.',
      }
    }

    if (!Number.isInteger(port) || port <= 0 || port > 65535) {
      return {
        ok: false,
        code: 'bootstrap_bridge_url_forbidden',
        message: 'bridgeBaseUrl must include a valid port.',
      }
    }

    return {
      ok: true,
      url: `${url.protocol}//${url.hostname}:${url.port}`,
    }
  } catch {
    return {
      ok: false,
      code: 'bootstrap_bridge_url_forbidden',
      message: 'bridgeBaseUrl is not a valid URL.',
    }
  }
}
