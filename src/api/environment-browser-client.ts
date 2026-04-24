import type {
  ActionReceipt,
  ActionRequest,
  DiagnosticsSummary,
  EnvironmentId,
  EnvironmentSnapshot,
  OperationSnapshot,
} from '../contracts/environment'
import { resolveBootstrap } from './bootstrap'
import type {
  EnvironmentClient,
  EnvironmentClientDiagnostics,
} from './environment-client'
import { createHttpEnvironmentClient, BridgeRequestError } from './environment-http-client'
import { createMockEnvironmentClient } from '../mocks/environment-client.mock'

export function createBrowserEnvironmentClient(): EnvironmentClient {
  const bootstrapResult = resolveBootstrap()
  const diagnostics: EnvironmentClientDiagnostics = {
    mode: bootstrapResult.ok ? 'bridge' : 'bridge-error',
    bridgeAvailable: bootstrapResult.ok,
    errorMessage: bootstrapResult.ok ? null : bootstrapResult.message,
    bootstrap: bootstrapResult.ok
      ? { status: 'valid' }
      : {
          status: 'invalid',
          code: bootstrapResult.code,
          message: bootstrapResult.message,
        },
    connectionFailure: bootstrapResult.ok
      ? null
      : {
          kind: 'bootstrap_invalid',
          code: bootstrapResult.code,
          message: bootstrapResult.message,
          retryable: false,
        },
    diagnosticsSummary: bootstrapResult.ok
      ? null
      : createLocalDiagnosticsSummary({
          conclusion: '启动信息无效，无法建立到本地安全组件的受信连接。',
          recommendedNextStep: '重新启动应用或重新建立连接后再试。',
          retryable: false,
          code: bootstrapResult.code,
        }),
  }

  const mockClient = createMockEnvironmentClient()
  const httpClient = bootstrapResult.ok
    ? createHttpEnvironmentClient({
        baseUrl: bootstrapResult.bootstrap.bridgeBaseUrl,
        token: bootstrapResult.bootstrap.sessionToken,
      })
    : null
  const allowMockFallback =
    bootstrapResult.ok &&
    bootstrapResult.bootstrap.mode === 'dev' &&
    bootstrapResult.bootstrap.allowMockFallback

  const ensureBridgeAvailable = () => {
    if (!httpClient) {
      throw new BridgeRequestError(
        diagnostics.errorMessage ?? 'Bootstrap is invalid.',
        null,
      )
    }

    return httpClient
  }

  return {
    async getSnapshot(environmentId: EnvironmentId): Promise<EnvironmentSnapshot> {
      const client = ensureBridgeAvailable()

      try {
        const snapshot = await client.getSnapshot(environmentId)
        syncDiagnostics(client, diagnostics)
        return snapshot
      } catch (error) {
        if (allowMockFallback && isUnavailableFailure(error)) {
          setMockFallbackDiagnostics(error, diagnostics)
          return mockClient.getSnapshot(environmentId)
        }

        syncDiagnostics(client, diagnostics)
        throw error
      }
    },

    async postAction(request: ActionRequest): Promise<ActionReceipt> {
      if (diagnostics.mode === 'mock-fallback') {
        return mockClient.postAction(request)
      }

      const client = ensureBridgeAvailable()
      try {
        const receipt = await client.postAction(request)
        syncDiagnostics(client, diagnostics)
        return receipt
      } catch (error) {
        syncDiagnostics(client, diagnostics)
        throw error
      }
    },

    async getOperation(
      environmentId: EnvironmentId,
      operationId: string,
    ): Promise<OperationSnapshot> {
      if (diagnostics.mode === 'mock-fallback') {
        return mockClient.getOperation(environmentId, operationId)
      }

      const client = ensureBridgeAvailable()
      const operation = await client.getOperation(environmentId, operationId)
      syncDiagnostics(client, diagnostics)
      return operation
    },

    async getDiagnosticsSummary(environmentId: EnvironmentId): Promise<DiagnosticsSummary> {
      if (diagnostics.mode === 'mock-fallback') {
        return mockClient.getDiagnosticsSummary!(environmentId)
      }

      if (diagnostics.diagnosticsSummary && diagnostics.mode === 'bridge-error') {
        return diagnostics.diagnosticsSummary
      }

      const client = ensureBridgeAvailable()
      const summary = await client.getDiagnosticsSummary!(environmentId)
      syncDiagnostics(client, diagnostics)
      diagnostics.diagnosticsSummary = summary
      return summary
    },

    getDiagnostics() {
      return diagnostics
    },

    async debugApplyScenario(scenarioId: string) {
      return mockClient.debugApplyScenario?.(scenarioId)
    },
  }
}

function syncDiagnostics(
  httpClient: EnvironmentClient,
  diagnostics: EnvironmentClientDiagnostics,
) {
  const current = httpClient.getDiagnostics?.()
  if (!current) {
    return
  }

  diagnostics.mode = current.mode
  diagnostics.bridgeAvailable = current.bridgeAvailable
  diagnostics.errorMessage = current.errorMessage
  diagnostics.connectionFailure = current.connectionFailure
  diagnostics.diagnosticsSummary = current.diagnosticsSummary
}

function isUnavailableFailure(error: unknown) {
  return (
    error instanceof BridgeRequestError &&
    (error.status === null || error.status >= 500)
  )
}

function setMockFallbackDiagnostics(
  error: unknown,
  diagnostics: EnvironmentClientDiagnostics,
) {
  diagnostics.mode = 'mock-fallback'
  diagnostics.bridgeAvailable = false
  diagnostics.errorMessage =
    error instanceof Error ? error.message : 'Bridge unavailable'
  diagnostics.connectionFailure = {
    kind: 'bridge_unavailable',
    code: 'bridge_unavailable',
    message: diagnostics.errorMessage,
    retryable: true,
  }
  diagnostics.diagnosticsSummary = createLocalDiagnosticsSummary({
    conclusion: '当前未连接到本地安全组件，页面已回退到演示数据。',
    recommendedNextStep: '启动本地安全组件后重试连接。',
    retryable: true,
    code: 'bridge_unavailable',
  })
}

function createLocalDiagnosticsSummary(input: {
  conclusion: string
  recommendedNextStep: string
  retryable: boolean
  code: string
}): DiagnosticsSummary {
  return {
    userSummary: {
      conclusion: input.conclusion,
      recommendedNextStep: input.recommendedNextStep,
      retryable: input.retryable,
    },
    supportSummary: {
      bridgeVersion: 'unknown',
      port: 0,
      generation: 0,
      runtimeLocation: 'unknown',
      lastFailure: {
        stage: 'bridge_connection',
        type: 'unknown',
        code: input.code,
        occurredAt: new Date().toISOString(),
      },
    },
  }
}
