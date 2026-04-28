import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  runTemplateCommand,
  setCommandExecutorForTests,
} from '../../bridge/command-runner.ts'

afterEach(() => {
  setCommandExecutorForTests(null)
})

describe('command runner', () => {
  it('rejects non-dedicated target distro before executing commands', async () => {
    const executor = vi.fn()
    setCommandExecutorForTests(executor)

    const result = await runTemplateCommand({
      action: 'install_environment',
      command: 'check_windows_capabilities',
      targetDistro: 'Ubuntu',
    })

    expect(result.ok).toBe(false)
    if (result.ok) {
      throw new Error('expected failure')
    }
    expect(result.failureCode).toBe('target_distro_invalid')
    expect(executor).not.toHaveBeenCalled()
  })

  it('fails checksum validation when dev checksum is used without explicit dev shim', async () => {
    setCommandExecutorForTests(async () => ({
      exitCode: 0,
      stdout: 'sha256=0123456789abcdef',
      stderr: '',
    }))

    const result = await runTemplateCommand({
      action: 'install_environment',
      command: 'verify_checksum',
      targetDistro: 'AgentSecurity',
      installerChecksum: 'dev-skip-checksum',
      allowDevShim: false,
    })

    expect(result.ok).toBe(false)
    if (result.ok) {
      throw new Error('expected failure')
    }
    expect(result.failureCode).toBe('artifact_checksum_unconfigured')
    expect(result.audit.executor).toBe('live')
  })

  it('allows explicit dev shim checksum bypass and marks the audit accordingly', async () => {
    setCommandExecutorForTests(async () => ({
      exitCode: 0,
      stdout: 'sha256=0123456789abcdef',
      stderr: '',
    }))

    const result = await runTemplateCommand({
      action: 'install_environment',
      command: 'verify_checksum',
      targetDistro: 'AgentSecurity',
      installerChecksum: 'dev-skip-checksum',
      allowDevShim: true,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) {
      throw new Error('expected success')
    }
    expect(result.audit.executor).toBe('dev-shim')
  })
})
