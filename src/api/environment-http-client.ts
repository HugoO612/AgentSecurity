import type {
  ActionReceipt,
  ActionRequest,
  BridgeErrorResponse,
  DiagnosticsSummary,
  EnvironmentId,
  EnvironmentSnapshot,
  OperationSnapshot,
} from '../contracts/environment'
import type {
  EnvironmentClient,
  EnvironmentClientDiagnostics,
} from './environment-client'
import {
  getDiagnosticsSummaryPath,
  getOperationPath,
  getSnapshotPath,
  postActionsPath,
} from './environment-endpoints'

export class BridgeRequestError extends Error {
  readonly status: number | null
  readonly response: BridgeErrorResponse | null

  constructor(
    message: string,
    status: number | null,
    response: BridgeErrorResponse | null = null,
  ) {
    super(message)
    this.name = 'BridgeRequestError'
    this.status = status
    this.response = response
  }
}

type HttpClientOptions = {
  baseUrl: string
  token: string
  requestTimeoutMs?: number
}

export function createHttpEnvironmentClient(
  options: HttpClientOptions,
): EnvironmentClient {
  const requestTimeoutMs = options.requestTimeoutMs ?? 8000
  const diagnostics: EnvironmentClientDiagnostics = {
    mode: 'bridge',
    bridgeAvailable: true,
    errorMessage: null,
    bootstrap: {
      status: 'valid',
    },
    connectionFailure: null,
    diagnosticsSummary: null,
  }

  const resolveHeaders = () =>
    ({
      'content-type': 'application/json',
      'x-agent-security-token': options.token,
    }) satisfies HeadersInit

  return {
    async getSnapshot(environmentId: EnvironmentId) {
      return requestJson<EnvironmentSnapshot>(
        `${options.baseUrl}${getSnapshotPath(environmentId)}`,
        diagnostics,
        requestTimeoutMs,
      )
    },

    async postAction(request: ActionRequest) {
      return requestJson<ActionReceipt>(
        `${options.baseUrl}${postActionsPath()}`,
        diagnostics,
        requestTimeoutMs,
        {
          method: 'POST',
          headers: resolveHeaders(),
          body: JSON.stringify(request),
        },
      )
    },

    async getOperation(environmentId: EnvironmentId, operationId: string) {
      return requestJson<OperationSnapshot>(
        `${options.baseUrl}${getOperationPath(environmentId, operationId)}`,
        diagnostics,
        requestTimeoutMs,
      )
    },

    async getDiagnosticsSummary(environmentId: EnvironmentId) {
      const summary = await requestJson<DiagnosticsSummary>(
        `${options.baseUrl}${getDiagnosticsSummaryPath(environmentId)}`,
        diagnostics,
        requestTimeoutMs,
      )
      diagnostics.diagnosticsSummary = summary
      return summary
    },

    getDiagnostics() {
      return diagnostics
    },
  }
}

async function requestJson<T>(
  url: string,
  diagnostics: EnvironmentClientDiagnostics,
  timeoutMs: number,
  init?: RequestInit,
): Promise<T> {
  let response: Response
  let timedOut = false
  const controller = new AbortController()
  const timeout = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)
  const externalSignal = init?.signal
  const abortFromExternal = () => controller.abort()
  if (externalSignal) {
    if (externalSignal.aborted) {
      abortFromExternal()
    } else {
      externalSignal.addEventListener('abort', abortFromExternal, { once: true })
    }
  }

  try {
    response = await fetch(url, {
      ...init,
      signal: controller.signal,
    })
  } catch (error) {
    diagnostics.mode = 'bridge-error'
    diagnostics.bridgeAvailable = false
    const isAbort = isAbortError(error)
    diagnostics.errorMessage = timedOut
      ? 'The local bridge request timed out.'
      : isAbort
        ? 'The local bridge request was aborted.'
        : error instanceof Error
          ? error.message
          : 'Bridge unavailable'
    diagnostics.connectionFailure = {
      kind: 'bridge_unavailable',
      code: timedOut ? 'bridge_timeout' : 'bridge_unavailable',
      message: diagnostics.errorMessage,
      retryable: true,
    }
    throw new BridgeRequestError(diagnostics.errorMessage, null)
  } finally {
    clearTimeout(timeout)
    if (externalSignal) {
      externalSignal.removeEventListener('abort', abortFromExternal)
    }
  }

  if (!response.ok) {
    const errorResponse = await tryReadBridgeError(response)
    diagnostics.mode = 'bridge-error'
    diagnostics.bridgeAvailable = false
    diagnostics.errorMessage =
      errorResponse?.error.message ??
      `Bridge request failed with status ${response.status}`
    diagnostics.connectionFailure = mapConnectionFailure(response.status, errorResponse)
    diagnostics.diagnosticsSummary = errorResponse?.diagnostics ?? null
    throw new BridgeRequestError(
      diagnostics.errorMessage,
      response.status,
      errorResponse,
    )
  }

  diagnostics.mode = 'bridge'
  diagnostics.bridgeAvailable = true
  diagnostics.errorMessage = null
  diagnostics.connectionFailure = null
  return (await response.json()) as T
}

function isAbortError(error: unknown) {
  return (
    (typeof DOMException !== 'undefined' &&
      error instanceof DOMException &&
      error.name === 'AbortError') ||
    (error instanceof Error && error.name === 'AbortError')
  )
}

async function tryReadBridgeError(
  response: Response,
): Promise<BridgeErrorResponse | null> {
  try {
    return (await response.json()) as BridgeErrorResponse
  } catch {
    return null
  }
}

function mapConnectionFailure(
  status: number,
  response: BridgeErrorResponse | null,
): EnvironmentClientDiagnostics['connectionFailure'] {
  const code = response?.error.code ?? `http_${status}`
  const message =
    response?.error.message ??
    (status === 401
      ? 'The bridge rejected the current session.'
      : status === 403
        ? 'The bridge rejected the current origin.'
        : 'The local bridge is unavailable.')
  const retryable = response?.error.retryable ?? status !== 403

  if (status === 401) {
    return {
      kind: 'bridge_untrusted',
      code,
      message,
      retryable,
    }
  }

  if (status === 403) {
    return {
      kind: 'bridge_forbidden',
      code,
      message,
      retryable,
    }
  }

  return {
    kind: response?.error.kind ?? 'bridge_unavailable',
    code,
    message,
    retryable,
  }
}
