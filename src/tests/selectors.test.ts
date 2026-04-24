import { describe, expect, it } from 'vitest'
import {
  createDegradedSnapshot,
  createInitialSnapshot,
  createInstallFailedSnapshot,
  createReadyToInstallSnapshot,
} from '../domain/mock-data'
import {
  deriveCheckSummary,
  deriveEnvironmentState,
  deriveRecommendedAction,
  resolveRouteForSnapshot,
} from '../domain/selectors'

describe('selectors', () => {
  it('derives check summary counts from checks only', () => {
    const snapshot = createReadyToInstallSnapshot({
      disk_space: 'warn',
      network: 'block',
    })
    const summary = deriveCheckSummary(snapshot.checks)

    expect(summary.passCount).toBe(3)
    expect(summary.warnCount).toBe(2)
    expect(summary.blockCount).toBe(1)
    expect(summary.requiredResolved).toBe(true)
  })

  it('maps failed transient install to retry action', () => {
    const snapshot = createInstallFailedSnapshot('transient')
    const summary = deriveCheckSummary(snapshot.checks)

    expect(deriveEnvironmentState(snapshot, summary)).toBe('install_failed')
    expect(deriveRecommendedAction(snapshot, summary)).toBe('retry_install')
    expect(resolveRouteForSnapshot(snapshot, summary)).toBe('/install-failed')
  })

  it('maps repeated startup failures to rebuild action', () => {
    const snapshot = createDegradedSnapshot()
    const summary = deriveCheckSummary(snapshot.checks)

    expect(deriveRecommendedAction(snapshot, summary)).toBe(
      'rebuild_environment',
    )
  })

  it('keeps not installed route on entry', () => {
    const snapshot = createInitialSnapshot()
    const summary = deriveCheckSummary(snapshot.checks)

    expect(resolveRouteForSnapshot(snapshot, summary)).toBe('/')
  })
})
