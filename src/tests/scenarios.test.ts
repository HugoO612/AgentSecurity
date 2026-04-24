import { describe, expect, it } from 'vitest'
import { getScenarioTemplate, scenarioTemplates } from '../domain/mock-data'
import {
  deriveCheckSummary,
  deriveEnvironmentState,
  isModalAllowed,
  resolveRouteForSnapshot,
} from '../domain/selectors'

describe('scenario templates', () => {
  it('keeps coverage metadata for every debug scenario', () => {
    for (const scenario of scenarioTemplates) {
      expect(scenario.covers.state).toBeTruthy()
      expect(scenario.covers.failure).toBeTruthy()
      expect(scenario.covers.route).toBeTruthy()
    }
  })

  it('uses legal route and modal combinations', () => {
    for (const scenario of scenarioTemplates) {
      expect(isModalAllowed(scenario.route, scenario.modal)).toBe(true)

      const summary = deriveCheckSummary(scenario.snapshot.checks)
      expect(resolveRouteForSnapshot(scenario.snapshot, summary)).toBe(
        scenario.route === '/recovery' ? '/status' : scenario.route,
      )
      expect(deriveEnvironmentState(scenario.snapshot, summary)).toBeTruthy()
    }
  })

  it('returns a safe fallback scenario', () => {
    expect(getScenarioTemplate('missing').id).toBe('first_install_default')
  })
})
