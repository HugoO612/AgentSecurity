import { describe, expect, it } from 'vitest'
import {
  contractFixturesById,
  contractReceiptFixtures,
} from '../mocks/environment-contract.fixtures'

describe('production contract fixtures', () => {
  it('snapshot facts do not contain UI-derived fields', () => {
    const snapshot = contractFixturesById.first_install_default.snapshot

    expect('recommendedAction' in snapshot).toBe(false)
    expect('checkSummary' in snapshot).toBe(false)
    expect('screen' in snapshot).toBe(false)
  })

  it('accepted receipt does not imply success', () => {
    const receipt = contractReceiptFixtures.installAccepted

    expect(receipt.accepted).toBe(true)
    expect(receipt.operationId).toBeTruthy()
  })

  it('keeps generation and revision as independent concurrency facts', () => {
    const installed = contractFixturesById.running_environment.snapshot

    expect(installed.generation).toBeGreaterThanOrEqual(0)
    expect(installed.revision).toBeGreaterThan(0)
  })

  it('expresses failure with stage, type, code, and retryable', () => {
    const degraded = contractFixturesById.degraded_after_start_failures.snapshot
    const failure = degraded.failure

    expect(failure).toBeDefined()
    expect(failure?.stage).toBe('agent_start')
    expect(failure?.type).toBe('startup_failed')
    expect(failure?.code).toBe('agent_start_failed')
    expect(typeof failure?.retryable).toBe('boolean')
  })

  it('includes diagnostics summary user and support sections', () => {
    const snapshot = contractFixturesById.install_network_failed.snapshot

    expect(snapshot.diagnostics.userSummary.conclusion).toBeTruthy()
    expect(snapshot.diagnostics.supportSummary.bridgeVersion).toBeTruthy()
  })
})
