import { describe, expect, it, vi } from 'vitest'
import { pollOperationToTerminal } from '../api/operation-poller'
import type { EnvironmentClient } from '../api/environment-client'

describe('operation poller', () => {
  it('polls until the operation reaches a terminal status', async () => {
    const getOperation = vi
      .fn<EnvironmentClient['getOperation']>()
      .mockResolvedValueOnce({
        operationId: 'op-1',
        environmentId: 'local-default',
        action: 'install_environment',
        status: 'running',
        stage: 'installing',
        startedAt: '2026-04-23T12:00:00.000Z',
        updatedAt: '2026-04-23T12:00:00.000Z',
        generationAtStart: 0,
      })
      .mockResolvedValueOnce({
        operationId: 'op-1',
        environmentId: 'local-default',
        action: 'install_environment',
        status: 'succeeded',
        stage: 'installing',
        startedAt: '2026-04-23T12:00:00.000Z',
        updatedAt: '2026-04-23T12:01:00.000Z',
        completedAt: '2026-04-23T12:01:00.000Z',
        generationAtStart: 0,
        generationAtCompletion: 1,
        result: {
          snapshotRevision: 2,
          generation: 1,
        },
      })

    const operation = await pollOperationToTerminal(
      {
        getSnapshot: vi.fn(),
        postAction: vi.fn(),
        getOperation,
      } as unknown as EnvironmentClient,
      'local-default',
      'op-1',
      'install_environment',
    )

    expect(operation.status).toBe('succeeded')
    expect(getOperation).toHaveBeenCalledTimes(2)
  })
})
