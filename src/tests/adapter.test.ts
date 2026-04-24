import { describe, expect, it } from 'vitest'
import {
  adaptContractSnapshot,
  createDiagnosticsText,
  createInstallRequest,
  mapEnvironmentActionToRequest,
} from '../api/environment-adapter'
import { contractFixturesById } from '../mocks/environment-contract.fixtures'

describe('contract adapter', () => {
  it('passes through contract snapshots without UI-derived fields', () => {
    const adapted = adaptContractSnapshot(
      contractFixturesById.install_network_failed.snapshot,
    )

    expect(adapted.installation.state).toBe('install-failed')
    expect(adapted.failure?.type).toBe('transient')
    expect('recommendedAction' in adapted).toBe(false)
  })

  it('builds install requests from current generation', () => {
    const adapted = adaptContractSnapshot(
      contractFixturesById.precheck_warn_continue.snapshot,
    )
    const request = createInstallRequest(adapted)

    expect(request.action).toBe('install_environment')
    expect(request.expectedGeneration).toBe(adapted.generation)
    expect(request.environmentId).toBe(adapted.environmentId)
  })

  it('maps frontend actions into contract action requests', () => {
    const adapted = adaptContractSnapshot(
      contractFixturesById.degraded_after_start_failures.snapshot,
    )
    const request = mapEnvironmentActionToRequest(
      'rebuild_environment',
      adapted,
    )

    expect(request.action).toBe('rebuild_environment')
    expect(request.expectedGeneration).toBe(adapted.generation)
  })

  it('prints required diagnostics lines even when optional fields are absent', () => {
    const text = createDiagnosticsText(
      contractFixturesById.first_install_default.snapshot.diagnostics,
    )

    expect(text).toContain('Bridge version:')
    expect(text).toContain('Generation:')
    expect(text).toContain('Runtime location:')
    expect(text).toContain('Last operation:')
    expect(text).toContain('Last failure stage:')
    expect(text).toContain('Health:')
  })
})
