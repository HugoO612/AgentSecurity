import { describe, expect, it } from 'vitest'
import { actionPolicies } from '../domain/actions'
import {
  applyStartFailure,
  createInitialSnapshot,
  createInstalledSnapshot,
} from '../domain/mock-data'
import {
  deriveAvailableActions,
  deriveCheckSummary,
  deriveEnvironmentState,
} from '../domain/selectors'

describe('action contracts', () => {
  it('marks delete as confirmed and routes back to entry', () => {
    expect(actionPolicies.delete_environment.requiresConfirm).toBe(
      'delete_confirm',
    )
    expect(actionPolicies.delete_environment.successRoute).toBe('/')
  })

  it('degrades only after the third startup failure in one generation', () => {
    const installed = createInstalledSnapshot(createInitialSnapshot())
    const failure = {
      type: 'startup_failed' as const,
      stage: 'agent_start' as const,
      code: 'agent_start_failed',
      message: 'Agent startup failed.',
      retryable: true,
      occurredAt: new Date().toISOString(),
    }

    const first = applyStartFailure(installed, failure)
    const second = applyStartFailure(first.snapshot, failure)
    const third = applyStartFailure(second.snapshot, failure)

    expect(
      deriveEnvironmentState(first.snapshot, deriveCheckSummary(first.snapshot.checks)),
    ).not.toBe('degraded')
    expect(
      deriveEnvironmentState(
        second.snapshot,
        deriveCheckSummary(second.snapshot.checks),
      ),
    ).not.toBe('degraded')
    expect(
      deriveEnvironmentState(
        third.snapshot,
        deriveCheckSummary(third.snapshot.checks),
      ),
    ).toBe('degraded')
    expect(third.snapshot.health.startupFailureCount).toBe(3)
  })

  it('does not expose start action when not installed', () => {
    const snapshot = createInitialSnapshot()
    const state = deriveEnvironmentState(snapshot, deriveCheckSummary(snapshot.checks))

    expect(deriveAvailableActions(state, snapshot)).not.toContain('start_agent')
  })
})
