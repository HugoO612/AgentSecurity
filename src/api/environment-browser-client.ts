import type {
  ActionReceipt,
  ActionRequest,
  BoundarySelfCheckReport,
  ConfirmTokenReceipt,
  DeleteResultReport,
  DiagnosticsSummary,
  EnvironmentId,
  EnvironmentReport,
  EnvironmentSnapshot,
  OperationSnapshot,
  SupportBundleExport,
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
          conclusion: '启动信息无效，无法建立到本地 bridge 的受信连接。',
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

  const maybeFallback = async <T>(
    task: (client: EnvironmentClient) => Promise<T>,
    mockTask: () => Promise<T>,
  ) => {
    const client = ensureBridgeAvailable()
    try {
      const value = await task(client)
      syncDiagnostics(client, diagnostics)
      return value
    } catch (error) {
      if (allowMockFallback && isUnavailableFailure(error)) {
        setMockFallbackDiagnostics(error, diagnostics)
        return mockTask()
      }

      syncDiagnostics(client, diagnostics)
      throw error
    }
  }

  return {
    async getSnapshot(environmentId: EnvironmentId): Promise<EnvironmentSnapshot> {
      return maybeFallback(
        (client) => client.getSnapshot(environmentId),
        () => mockClient.getSnapshot(environmentId),
      )
    },

    async postAction(request: ActionRequest): Promise<ActionReceipt> {
      if (diagnostics.mode === 'mock-fallback') {
        return mockClient.postAction(request)
      }

      const client = ensureBridgeAvailable()
      const receipt = await client.postAction(request)
      syncDiagnostics(client, diagnostics)
      return receipt
    },

    async requestConfirmToken(
      environmentId: EnvironmentId,
      action: 'rebuild_environment' | 'delete_environment',
    ): Promise<ConfirmTokenReceipt> {
      if (diagnostics.mode === 'mock-fallback') {
        return mockClient.requestConfirmToken(environmentId, action)
      }

      const client = ensureBridgeAvailable()
      const receipt = await client.requestConfirmToken(environmentId, action)
      syncDiagnostics(client, diagnostics)
      return receipt
    },

    async startInstaller(environmentId: EnvironmentId): Promise<ActionReceipt> {
      if (diagnostics.mode === 'mock-fallback') {
        return mockClient.startInstaller!(environmentId)
      }

      const client = ensureBridgeAvailable()
      const receipt = await client.startInstaller(environmentId)
      syncDiagnostics(client, diagnostics)
      return receipt
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

    async getInstallerOperation(operationId: string): Promise<OperationSnapshot> {
      if (diagnostics.mode === 'mock-fallback') {
        return mockClient.getInstallerOperation!(operationId)
      }

      const client = ensureBridgeAvailable()
      const operation = await client.getInstallerOperation(operationId)
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

    async getEnvironmentReport(): Promise<EnvironmentReport> {
      if (diagnostics.mode === 'mock-fallback') {
        return mockClient.getEnvironmentReport!()
      }

      const client = ensureBridgeAvailable()
      const report = await client.getEnvironmentReport!()
      syncDiagnostics(client, diagnostics)
      return report
    },

    async getBoundaryReport(): Promise<BoundarySelfCheckReport> {
      if (diagnostics.mode === 'mock-fallback') {
        return mockClient.getBoundaryReport!()
      }

      const client = ensureBridgeAvailable()
      const report = await client.getBoundaryReport!()
      syncDiagnostics(client, diagnostics)
      return report
    },

    async getDeleteReport(): Promise<DeleteResultReport | null> {
      if (diagnostics.mode === 'mock-fallback') {
        return mockClient.getDeleteReport!()
      }

      const client = ensureBridgeAvailable()
      const report = await client.getDeleteReport!()
      syncDiagnostics(client, diagnostics)
      return report
    },

    async exportSupportBundle(): Promise<SupportBundleExport> {
      if (diagnostics.mode === 'mock-fallback') {
        return mockClient.exportSupportBundle!()
      }

      const client = ensureBridgeAvailable()
      const bundle = await client.exportSupportBundle!()
      syncDiagnostics(client, diagnostics)
      return bundle
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
    conclusion: '当前未连接到本地 bridge，页面已回退到演示数据。',
    recommendedNextStep: '启动本地 bridge 后重试连接。',
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
      mode: 'dev',
      isMock: true,
      lastFailure: {
        stage: 'bridge_connection',
        type: 'unknown',
        code: input.code,
        occurredAt: new Date().toISOString(),
      },
      recentCommands: [],
    },
  }
}
