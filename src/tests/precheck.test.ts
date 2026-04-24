import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BridgeConfig } from '../../bridge/config.ts'

vi.mock('../../bridge/command-runner.ts', () => ({
  runAllowedCommand: vi.fn(),
}))
vi.mock('node:dns/promises', async () => {
  const actual =
    await vi.importActual<typeof import('node:dns/promises')>(
      'node:dns/promises',
    )
  return {
    ...actual,
    lookup: vi.fn(),
  }
})
vi.mock('node:fs/promises', async () => {
  const actual =
    await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
  return {
    ...actual,
    statfs: vi.fn(),
  }
})

import { lookup } from 'node:dns/promises'
import { statfs } from 'node:fs/promises'
import { runAllowedCommand } from '../../bridge/command-runner.ts'
import { buildPrecheck } from '../../bridge/precheck.ts'

const config = {
  runtimeDir: 'A:\\AgentSecurity',
} as unknown as BridgeConfig

describe('bridge precheck', () => {
  beforeEach(() => {
    vi.mocked(lookup).mockResolvedValue({ address: '127.0.0.1', family: 4 } as never)
    vi.mocked(statfs).mockResolvedValue({ bavail: 10_000_000, bsize: 4096 } as never)
    vi.mocked(runAllowedCommand).mockResolvedValue({
      exitCode: 0,
      stdout: 'WSL is available.',
      stderr: '',
    })
  })

  it('emits six v1 precheck categories', async () => {
    const result = await buildPrecheck(config)
    const codes = result.checks.map((item) => item.code)

    expect(codes).toEqual([
      'windows_version',
      'wsl_status',
      'virtualization',
      'disk_space',
      'network',
      'permission',
    ])
  })

  it('maps permission-denied WSL output to permission failure', async () => {
    vi.mocked(runAllowedCommand).mockResolvedValue({
      exitCode: 1,
      stdout: '',
      stderr: 'Access is denied.',
    })

    const result = await buildPrecheck(config)
    const permission = result.checks.find((item) => item.code === 'permission')

    expect(permission?.status).toBe('blocked')
    expect(result.failure?.stage).toBe('permission')
    expect(result.failure?.type).toBe('permission_required')
    expect(result.failure?.code).toBe('permission_denied')
    expect(result.failure?.suggestedRecovery).toBe('view_fix_instructions')
  })

  it('maps policy-blocked WSL output to unsupported environment failure', async () => {
    vi.mocked(runAllowedCommand).mockResolvedValue({
      exitCode: 1,
      stdout: '',
      stderr: 'WSL has been disabled by policy.',
    })

    const result = await buildPrecheck(config)

    expect(result.failure?.stage).toBe('wsl_enablement')
    expect(result.failure?.type).toBe('unsupported_environment')
    expect(result.failure?.code).toBe('wsl_policy_blocked')
    expect(result.failure?.suggestedRecovery).toBe('view_fix_instructions')
  })

  it('maps disabled WSL output to missing capability failure', async () => {
    vi.mocked(runAllowedCommand).mockResolvedValue({
      exitCode: 1,
      stdout: '',
      stderr: 'Windows Subsystem for Linux has not been enabled.',
    })

    const result = await buildPrecheck(config)

    expect(result.failure?.stage).toBe('wsl_enablement')
    expect(result.failure?.type).toBe('missing_capability')
    expect(result.failure?.code).toBe('wsl_not_enabled')
    expect(result.failure?.suggestedRecovery).toBe('view_fix_instructions')
  })
})
