import type {
  ActionReceipt,
  ActionRequest,
  DiagnosticsSummary,
  EnvironmentSnapshot,
  OperationSnapshot,
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

    async getOperation(_environmentId, operationId: string): Promise<OperationSnapshot> {
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
    },

    async getDiagnosticsSummary(): Promise<DiagnosticsSummary> {
      return clone(state.snapshot.diagnostics)
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
