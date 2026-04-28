import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)
const tempDirs: string[] = []

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) {
      await rm(dir, { recursive: true, force: true })
    }
  }
})

describe('release candidate validation script', () => {
  it('accepts a live AgentSecurity evidence file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'agent-security-evidence-'))
    tempDirs.push(dir)
    const evidencePath = join(dir, 'valid-evidence.json')

    await writeFile(
      evidencePath,
      `${JSON.stringify(
        {
          candidateVersion: 'v1.0.0-local',
          commit: 'abc123',
          runAt: '2026-04-28T00:00:00.000Z',
          machine: 'test-machine',
          mode: 'release-candidate-validation',
          executionMode: 'live',
          targetDistro: 'AgentSecurity',
          bundledArtifacts: {
            rootfs: 'rootfs.tar',
            agent: 'agent.pkg',
            checksum: '0123456789abcdef',
          },
          lifecycle: [
            { action: 'install', finalStatus: 'succeeded', afterState: 'ready' },
            { action: 'start_agent', finalStatus: 'succeeded', afterState: 'running' },
            { action: 'stop_agent', finalStatus: 'succeeded', afterState: 'stopped' },
            { action: 'rebuild_environment', finalStatus: 'succeeded', afterState: 'ready' },
            { action: 'delete_environment', finalStatus: 'succeeded', afterState: 'not-installed' },
          ],
          residualItems: {
            remainingWindowsPaths: ['C:\\AgentSecurity\\v2\\diagnostics'],
            removedWindowsPaths: ['C:\\AgentSecurity\\v2\\runtime'],
            distroPresentAfterDelete: false,
            unexpectedResidue: [],
          },
          supportBundleChecks: {
            containsBridgeToken: false,
            containsLocalAppDataPath: false,
            containsAuthorizationHeader: false,
            containsRedactedMarkers: true,
          },
          goNoGo: {
            decision: 'go',
            blockingReasons: [],
            followUpOwner: 'release-lead',
          },
        },
        null,
        2,
      )}\n`,
      'utf8',
    )

    const { stdout } = await execFileAsync(
      'node',
      ['scripts/validate-release-candidate.mjs', '--evidence', evidencePath],
      { cwd: 'A:\\AgentSecurity' },
    )

    expect(stdout).toContain('Release candidate evidence passed live gating checks.')
  })

  it('rejects shimmed or non-AgentSecurity evidence for public launch', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'agent-security-evidence-'))
    tempDirs.push(dir)
    const evidencePath = join(dir, 'invalid-evidence.json')

    await writeFile(
      evidencePath,
      `${JSON.stringify(
        {
          candidateVersion: 'v1.0.0-local',
          commit: 'abc123',
          runAt: '2026-04-28T00:00:00.000Z',
          machine: 'test-machine',
          mode: 'real-machine-controlled-rehearsal',
          executionMode: 'dev-shim',
          targetDistro: 'Ubuntu',
          lifecycle: [],
          residualItems: {
            remainingWindowsPaths: [],
            removedWindowsPaths: [],
            distroPresentAfterDelete: true,
            unexpectedResidue: [],
          },
          supportBundleChecks: {
            containsBridgeToken: false,
            containsLocalAppDataPath: false,
            containsAuthorizationHeader: false,
            containsRedactedMarkers: true,
          },
          goNoGo: {
            decision: 'hold',
            blockingReasons: ['not ready'],
            followUpOwner: 'release-lead',
          },
        },
        null,
        2,
      )}\n`,
      'utf8',
    )

    await expect(
      execFileAsync(
        'node',
        ['scripts/validate-release-candidate.mjs', '--evidence', evidencePath],
        { cwd: 'A:\\AgentSecurity' },
      ),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining('Release evidence failed public launch checks.'),
    })
  })
})
