import type {
  ActionReceipt,
  ActionRequest,
  BoundarySelfCheckReport,
  ConfirmTokenReceipt,
  DeleteResultReport,
  DiagnosticsSummary,
  EnvironmentReport,
  EnvironmentSnapshot,
  OperationSnapshot,
  SupportBundleExport,
} from '../contracts/environment'
import type { EnvironmentClient } from '../api/environment-client'
import { BridgeRequestError } from '../api/environment-http-client'
import {
  contractFixturesById,
  contractScenarioFixtures,
} from './environment-contract.fixtures'

type MockClientState = {
  snapshot: EnvironmentSnapshot
  scenarioId: string
  operations: Map<
    string,
    {
      operation: OperationSnapshot
      finalSnapshot: EnvironmentSnapshot
      pollsRemaining: number
    }
  >
}

function clone<T>(value: T): T {
  return structuredClone(value)
}

function resolvePlan(state: MockClientState, action: ActionRequest['action']) {
  return contractFixturesById[state.scenarioId]?.actionPlans?.[action] ?? null
}

export function createMockEnvironmentClient(): EnvironmentClient {
  const initialFixture = contractScenarioFixtures[0]
  const state: MockClientState = {
    snapshot: clone(initialFixture.snapshot),
    scenarioId: initialFixture.id,
    operations: new Map(),
  }
  const getEnvironmentReport = async (): Promise<EnvironmentReport> =>
    clone(
      state.snapshot.report?.environment ?? {
        generatedAt: new Date().toISOString(),
        runtimeLocation: state.snapshot.runtime.location,
        targetDistro: state.snapshot.runtime.distroName ?? 'AgentSecurity',
        bridgeStatus: 'healthy',
        windowsHostWritesSummary:
          state.snapshot.runtime.windowsHostWritesSummary ??
          'Windows host writes are controlled.',
        windowsHostNoWriteSummary:
          'Windows host ordinary user files are not used as runtime.',
        installationLocationSummary:
          state.snapshot.runtime.installationLocationSummary ??
          'Installed in isolated runtime.',
        isolationBoundarySummary:
          state.snapshot.runtime.isolationBoundarySummary ??
          'Runtime is isolated from Windows host.',
        currentPermissionSummary: 'Permission is least-privilege by default.',
        currentLogLocationSummary: 'Logs are inside controlled diagnostics dir.',
        currentRuntimeDirectorySummary: 'Runtime files are in controlled runtime dir.',
      },
    )
  const getBoundaryReport = async (): Promise<BoundarySelfCheckReport> =>
    clone(
      state.snapshot.report?.boundary ?? {
        generatedAt: new Date().toISOString(),
        agentRunsInsideWindowsHost: false,
        bridgeControlsHighRiskActions: true,
        currentPermissionState: 'normal',
        bridgeControlStatus: state.snapshot.security?.bridgeControlStatus ?? 'enforced',
        hostImpactConfirmed: true,
        summary: state.snapshot.security?.boundarySelfCheck ?? 'Boundary self-check passed.',
      },
    )
  const getDeleteReport = async (): Promise<DeleteResultReport | null> =>
    clone(state.snapshot.report?.deleteResult ?? null)
  const getOperation = async (operationId: string): Promise<OperationSnapshot> => {
    const operation = state.operations.get(operationId)
    if (!operation) {
      throw new BridgeRequestError('Mock operation was not found.', 404, {
        ok: false,
        error: {
          code: 'operation_not_found',
          message: 'Operation not found.',
          retryable: false,
          stage: 'unknown',
          type: 'state_conflict',
        },
        diagnostics: state.snapshot.diagnostics,
      })
    }

    if (operation.pollsRemaining > 0) {
      operation.pollsRemaining -= 1
      return {
        ...clone(operation.operation),
        status: 'running',
      }
    }

    state.snapshot = {
      ...clone(operation.finalSnapshot),
      activeOperation: undefined,
    }
    return clone(operation.operation)
  }

  return {
    async getSnapshot() {
      return clone(state.snapshot)
    },

    async postAction(request: ActionRequest): Promise<ActionReceipt> {
      const plan = resolvePlan(state, request.action)

      if (!plan) {
        throw new BridgeRequestError('Mock action is unavailable.', 409, {
          ok: false,
          error: {
            code: 'action_not_available',
            message: 'The requested action is not available in this scenario.',
            retryable: false,
            stage: 'unknown',
            type: 'state_conflict',
          },
          diagnostics: state.snapshot.diagnostics,
        })
      }

      if (request.expectedGeneration !== undefined && request.expectedGeneration !== state.snapshot.generation) {
        throw new BridgeRequestError('Mock generation conflict.', 409, {
          ok: false,
          error: {
            code: 'generation_conflict',
            message: 'The current snapshot generation changed.',
            retryable: true,
            stage: 'unknown',
            type: 'generation_conflict',
          },
          diagnostics: state.snapshot.diagnostics,
        })
      }

      if (plan.kind === 'error') {
        throw new BridgeRequestError(plan.value.error.message, plan.status, {
          ...plan.value,
          diagnostics: state.snapshot.diagnostics,
        })
      }

      state.operations.set(plan.value.receipt.operationId, {
        operation: clone(plan.value.operation),
        finalSnapshot: clone(plan.value.finalSnapshot),
        pollsRemaining: plan.value.operation.status === 'running' ? 1 : 0,
      })
      state.snapshot = {
        ...clone(state.snapshot),
        activeOperation: {
          operationId: plan.value.receipt.operationId,
          action: request.action,
          status: 'running',
          stage: plan.value.operation.stage,
          startedAt: plan.value.receipt.acceptedAt,
          updatedAt: plan.value.receipt.acceptedAt,
          requestedGeneration: request.expectedGeneration ?? state.snapshot.generation,
        },
      }

      return clone(plan.value.receipt)
    },

    async requestConfirmToken(
      _environmentId,
      action,
    ): Promise<ConfirmTokenReceipt> {
      return {
        token: `mock-confirm-${action}-${Date.now()}`,
        action,
        expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
      }
    },

    async startInstaller(environmentId): Promise<ActionReceipt> {
      const plan =
        contractFixturesById[state.scenarioId]?.actionPlans?.install_environment ??
        null
      if (!plan || plan.kind === 'error') {
        throw new BridgeRequestError('Mock installer is unavailable.', 409, {
          ok: false,
          error: {
            code: 'action_not_available',
            message: 'Installer is not available in this scenario.',
            retryable: false,
            stage: 'environment_install',
            type: 'state_conflict',
          },
          diagnostics: state.snapshot.diagnostics,
        })
      }

      state.operations.set(plan.value.receipt.operationId, {
        operation: clone({
          ...plan.value.operation,
          action: 'installer',
        }),
        finalSnapshot: clone(plan.value.finalSnapshot),
        pollsRemaining: plan.value.operation.status === 'running' ? 1 : 0,
      })

      const acceptedAt = plan.value.receipt.acceptedAt
      state.snapshot = {
        ...clone(state.snapshot),
        activeOperation: {
          operationId: plan.value.receipt.operationId,
          action: 'installer',
          status: 'running',
          stage: plan.value.operation.stage,
          startedAt: acceptedAt,
          updatedAt: acceptedAt,
          requestedGeneration: state.snapshot.generation,
        },
      }

      return {
        ...clone(plan.value.receipt),
        environmentId,
        action: 'installer',
      }
    },

    async getOperation(_environmentId, operationId: string): Promise<OperationSnapshot> {
      return getOperation(operationId)
    },

    async getDiagnosticsSummary(): Promise<DiagnosticsSummary> {
      return clone(state.snapshot.diagnostics)
    },

    async getInstallerOperation(operationId: string): Promise<OperationSnapshot> {
      return getOperation(operationId)
    },

    async getEnvironmentReport(): Promise<EnvironmentReport> {
      return getEnvironmentReport()
    },

    async getBoundaryReport(): Promise<BoundarySelfCheckReport> {
      return getBoundaryReport()
    },

    async getDeleteReport(): Promise<DeleteResultReport | null> {
      return getDeleteReport()
    },

    async exportSupportBundle(): Promise<SupportBundleExport> {
      const deleteResult = await getDeleteReport()
      return {
        exportedAt: new Date().toISOString(),
        environmentReport: await getEnvironmentReport(),
        boundarySelfCheck: await getBoundaryReport(),
        ...(deleteResult ? { deleteResult } : {}),
        diagnostics: clone(state.snapshot.diagnostics),
      }
    },

    async debugApplyScenario(scenarioId: string) {
      const fixture = contractFixturesById[scenarioId]
      if (!fixture) {
        return
      }

      state.scenarioId = scenarioId
      state.snapshot = clone(fixture.snapshot)
      state.operations.clear()
    },
  }
}
