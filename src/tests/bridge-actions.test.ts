import { afterEach, describe, expect, it } from 'vitest'
import type { BridgeConfig } from '../../bridge/config.ts'
import { planActionExecution, planInstallerExecution } from '../../bridge/actions.ts'
import { setCommandExecutorForTests } from '../../bridge/command-runner.ts'
import { createInitialSnapshot } from '../../bridge/sample-payloads.ts'

const baseConfig: BridgeConfig = {
  mode: 'dev',
  port: 4319,
  token: 'test-token',
  bridgeOrigin: 'http://127.0.0.1:4319',
  allowedHosts: new Set(['127.0.0.1:4319']),
  allowedOrigins: new Set(['http://localhost:5173']),
  dataRoot: 'C:\\AgentSecurity\\v2',
  stateFile: 'C:\\AgentSecurity\\v2\\state\\environment-state.json',
  operationsDir: 'C:\\AgentSecurity\\v2\\operations',
  runtimeDir: 'C:\\AgentSecurity\\v2\\runtime',
  diagnosticsDir: 'C:\\AgentSecurity\\v2\\diagnostics',
  targetDistro: 'AgentSecurity',
  distroSeedName: 'AgentSecurityBase',
  reportDir: 'C:\\AgentSecurity\\v2\\reports',
  distroInstallRoot: 'C:\\AgentSecurity\\v2\\distros',
  elevationHelperCommand: 'powershell.exe -NoProfile -Command "Write-Output elevation-requested"',
  allowDevShim: false,
  rebootResumeMarkerPath: 'C:\\AgentSecurity\\v2\\runtime\\resume-after-reboot.json',
  hostWriteAllowlist: [
    'C:\\AgentSecurity\\v2',
    'C:\\AgentSecurity\\v2\\runtime',
    'C:\\AgentSecurity\\v2\\diagnostics',
    'C:\\AgentSecurity\\v2\\reports',
  ],
  installerDownloadUrl: 'bundled://openclaw-agent.pkg',
  installerChecksum: '0123456789abcdef',
  bundledRootfsChecksum: 'abcdef0123456789',
  bundledRootfsPath: 'C:\\AgentSecurity\\bundled\\agent-security-rootfs.tar',
  bundledAgentArtifactPath: 'C:\\AgentSecurity\\bundled\\openclaw-agent.pkg',
  bundledAgentName: 'OpenClaw',
  ubuntuVersion: '24.04-lts',
  nodeVersion: '24',
  openClawInstallSource: 'npm',
  openClawVersionPolicy: 'latest',
  openClawPackageName: 'openclaw',
  bundledBootstrapPath: 'C:\\AgentSecurity\\bundled\\openclaw-bootstrap.sh',
  bundledBootstrapChecksum: 'fedcba9876543210',
}

afterEach(() => {
  setCommandExecutorForTests(null)
})

describe('bridge action planning', () => {
  it('keeps the install -> start -> stop -> rebuild -> delete lifecycle coherent', async () => {
    setCommandExecutorForTests(async (program, args) => {
      if (program === 'wsl.exe' && args[0] === '--status') {
        return {
          exitCode: 0,
          stdout: 'Default Version: 2',
          stderr: '',
        }
      }

      if (program === 'wsl.exe' && args[0] === '-l') {
        return {
          exitCode: 0,
          stdout: 'AgentSecurity',
          stderr: '',
        }
      }

      const joined = args.join(' ')
      if (joined.includes('ConvertTo-Json')) {
        return {
          exitCode: 0,
          stdout: '{"build":"22631","hypervisorPresent":true}',
          stderr: '',
        }
      }

      if (joined.includes('sha256=')) {
        return {
          exitCode: 0,
          stdout:
            'sha256=0123456789abcdef\nrootfsSha256=abcdef0123456789\nbootstrapSha256=fedcba9876543210',
          stderr: '',
        }
      }

      return {
        exitCode: 0,
        stdout: 'ok',
        stderr: '',
      }
    })

    const initial = createInitialSnapshot(baseConfig)

    const install = await planInstallerExecution(initial, baseConfig)
    expect('error' in install).toBe(false)
    if ('error' in install) {
      throw new Error('expected install success')
    }
    expect(install.finalSnapshot.installation.state).toBe('running')
    expect(install.finalSnapshot.runtime.distroName).toBe('AgentSecurity')
    expect(install.finalSnapshot.commandAudits?.every((audit) => audit.executor === 'live')).toBe(true)

    const stop = await planActionExecution(
      {
        environmentId: initial.environmentId,
        action: 'stop_agent',
        requestId: 'stop-test',
        expectedGeneration: install.finalSnapshot.generation,
      },
      install.finalSnapshot,
      baseConfig,
    )
    expect('error' in stop).toBe(false)
    if ('error' in stop) {
      throw new Error('expected stop success')
    }
    expect(stop.finalSnapshot.installation.state).toBe('stopped')

    const start = await planActionExecution(
      {
        environmentId: initial.environmentId,
        action: 'start_agent',
        requestId: 'start-test',
        expectedGeneration: stop.finalSnapshot.generation,
      },
      stop.finalSnapshot,
      baseConfig,
    )
    expect('error' in start).toBe(false)
    if ('error' in start) {
      throw new Error('expected start success')
    }
    expect(start.finalSnapshot.installation.state).toBe('running')

    const rebuild = await planActionExecution(
      {
        environmentId: initial.environmentId,
        action: 'rebuild_environment',
        requestId: 'rebuild-test',
        expectedGeneration: start.finalSnapshot.generation,
      },
      start.finalSnapshot,
      baseConfig,
    )
    expect('error' in rebuild).toBe(false)
    if ('error' in rebuild) {
      throw new Error('expected rebuild success')
    }
    expect(rebuild.finalSnapshot.installation.state).toBe('running')
    expect(rebuild.finalSnapshot.generation).toBe(start.finalSnapshot.generation + 1)

    const del = await planActionExecution(
      {
        environmentId: initial.environmentId,
        action: 'delete_environment',
        requestId: 'delete-test',
        expectedGeneration: rebuild.finalSnapshot.generation,
      },
      rebuild.finalSnapshot,
      baseConfig,
    )
    expect('error' in del).toBe(false)
    if ('error' in del) {
      throw new Error('expected delete success')
    }
    expect(del.finalSnapshot.installation.state).toBe('not-installed')
    expect(del.finalSnapshot.deleteSummary?.remainingItems).toEqual(
      expect.arrayContaining([baseConfig.dataRoot, baseConfig.diagnosticsDir, baseConfig.reportDir]),
    )
  })

  it('keeps retry_install from recreating the dedicated distro', async () => {
    const calls: string[] = []
    setCommandExecutorForTests(async (_program, args) => {
      const joined = args.join(' ')
      calls.push(joined)
      if (joined.includes('ConvertTo-Json')) {
        return {
          exitCode: 0,
          stdout: '{"build":"22631","hypervisorPresent":true}',
          stderr: '',
        }
      }
      if (joined.includes('sha256=')) {
        return {
          exitCode: 0,
          stdout:
            'sha256=0123456789abcdef\nrootfsSha256=abcdef0123456789\nbootstrapSha256=fedcba9876543210',
          stderr: '',
        }
      }
      if (args[0] === '--status') {
        return {
          exitCode: 0,
          stdout: 'Default Version: 2',
          stderr: '',
        }
      }
      if (args[0] === '-l') {
        return {
          exitCode: 0,
          stdout: 'AgentSecurity',
          stderr: '',
        }
      }
      return {
        exitCode: 0,
        stdout: 'ok',
        stderr: '',
      }
    })

    const failedSnapshot = {
      ...createInitialSnapshot(baseConfig),
      generation: 4,
      installation: {
        state: 'install-failed' as const,
        installed: false,
        lastInstallAttemptAt: new Date().toISOString(),
      },
      runtime: {
        ...createInitialSnapshot(baseConfig).runtime,
        distroName: 'AgentSecurity',
      },
      failure: {
        stage: 'agent_install' as const,
        type: 'network_error' as const,
        code: 'install_download_failed',
        message: 'install failed',
        retryable: true,
        occurredAt: new Date().toISOString(),
      },
      capabilities: {
        ...createInitialSnapshot(baseConfig).capabilities,
        canRetry: true,
      },
    }

    const retry = await planActionExecution(
      {
        environmentId: failedSnapshot.environmentId,
        action: 'retry_install',
        requestId: 'retry-test',
        expectedGeneration: failedSnapshot.generation,
      },
      failedSnapshot,
      baseConfig,
    )

    expect('error' in retry).toBe(false)
    if ('error' in retry) {
      throw new Error('expected retry success')
    }
    expect(retry.finalSnapshot.installation.state).toBe('running')
    expect(calls.some((call) => call.includes('--import'))).toBe(false)
  })

  it('maps start failures to rebuild-first recovery guidance', async () => {
    setCommandExecutorForTests(async (program, args) => {
      if (program === 'wsl.exe' && args[0] === '-l') {
        return {
          exitCode: 0,
          stdout: 'AgentSecurity',
          stderr: '',
        }
      }

      const joined = args.join(' ')
      if (joined.includes('Get-Process') || joined.includes('health_check')) {
        return {
          exitCode: 1,
          stdout: '',
          stderr: 'not healthy',
        }
      }

      return {
        exitCode: 0,
        stdout: 'ok',
        stderr: '',
      }
    })

    const readySnapshot = {
      ...createInitialSnapshot(baseConfig),
      generation: 2,
      installation: {
        state: 'ready' as const,
        installed: true,
        installedAt: new Date().toISOString(),
      },
      capabilities: {
        ...createInitialSnapshot(baseConfig).capabilities,
        canInstall: false,
        canStart: true,
        canRebuild: true,
        canDelete: true,
      },
    }

    const start = await planActionExecution(
      {
        environmentId: readySnapshot.environmentId,
        action: 'start_agent',
        requestId: 'start-fail',
        expectedGeneration: readySnapshot.generation,
      },
      readySnapshot,
      baseConfig,
    )

    expect('error' in start).toBe(false)
    if ('error' in start) {
      throw new Error('expected planned failure snapshot')
    }
    expect(start.finalSnapshot.installation.state).toBe('degraded')
    expect(start.finalSnapshot.recovery?.recommendedAction).toBe('rebuild')
    expect(start.finalSnapshot.recovery?.availableActions).toEqual(
      expect.arrayContaining(['rebuild', 'delete', 'export_support_bundle']),
    )
  })

  it('maps denied elevation helper results to permission_denied', async () => {
    setCommandExecutorForTests(async (program, args) => {
      expect(program).toBe('powershell.exe')
      expect(args.join(' ')).toContain('elevation denied')
      return {
        exitCode: 1223,
        stdout: '',
        stderr: 'elevation denied',
      }
    })

    const snapshot = createInitialSnapshot(baseConfig)
    const permission = await planActionExecution(
      {
        environmentId: snapshot.environmentId,
        action: 'request_permission',
        requestId: 'permission-denied-test',
        expectedGeneration: snapshot.generation,
      },
      snapshot,
      {
        ...baseConfig,
        elevationHelperCommand: 'Write-Error "elevation denied"; exit 1223',
      },
    )

    expect('error' in permission).toBe(false)
    if ('error' in permission) {
      throw new Error('expected planned permission failure snapshot')
    }
    expect(permission.finalRecord.status).toBe('failed')
    expect(permission.finalRecord.error?.code).toBe('permission_denied')
    expect(permission.finalSnapshot.failure?.code).toBe('permission_denied')
    expect(permission.finalSnapshot.installation.state).toBe('not-installed')
  })
})
