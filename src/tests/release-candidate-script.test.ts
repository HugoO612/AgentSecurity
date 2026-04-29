import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
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
    const assetRoot = join(dir, 'assets')
    const rootfsPath = join(assetRoot, 'agent-security-rootfs.tar')
    const agentPath = join(assetRoot, 'openclaw-agent.pkg')
    const bootstrapPath = join(assetRoot, 'openclaw-bootstrap.sh')
    const installerPath = join(dir, 'AgentSecurity Setup.exe')
    const evidencePath = join(dir, 'valid-evidence.json')
    const rootfsContent = 'rootfs'
    const agentContent = 'agent'
    const bootstrapContent = 'bootstrap'
    const installerContent = 'signed installer placeholder'
    await mkdir(assetRoot)
    await writeFile(rootfsPath, rootfsContent, 'utf8')
    await writeFile(agentPath, agentContent, 'utf8')
    await writeFile(bootstrapPath, bootstrapContent, 'utf8')
    await writeFile(installerPath, installerContent, 'utf8')

    await writeFile(
      evidencePath,
      `${JSON.stringify(
        {
          candidateVersion: 'v1.0.0-wsl2',
          commit: 'abc123',
          runAt: '2026-04-28T00:00:00.000Z',
          machine: 'test-machine',
          mode: 'release-candidate-validation',
          executionMode: 'live',
          targetDistro: 'AgentSecurity',
          bundledArtifacts: {
            rootfs: rootfsPath,
            agent: agentPath,
            bootstrap: bootstrapPath,
            checksums: {
              rootfsSha256: createHash('sha256').update(rootfsContent).digest('hex'),
              agentSha256: createHash('sha256').update(agentContent).digest('hex'),
              bootstrapSha256: createHash('sha256').update(bootstrapContent).digest('hex'),
            },
            version: '2026.04.28-rc1',
            source: 'ubuntu-24.04-lts-official:test-rootfs',
            updatePolicy: 'mostly-bundled',
            ubuntuVersion: '24.04-lts',
            nodeVersion: '24',
            openClawInstallSource: 'npm',
            openClawVersionPolicy: 'latest',
          },
          releaseArtifacts: {
            windowsInstaller: {
              path: installerPath,
              sha256: createHash('sha256').update(installerContent).digest('hex'),
              signatureStatus: 'Unsigned',
              signaturePolicy: 'unsigned-accepted',
              userVisibleInstallNote: 'Windows may show an unknown publisher warning. Verify SHA256 before installing.',
            },
            windowsInstallerSha256File: `${installerPath}.sha256`,
          },
          exceptionMatrix: {
            blocking: {
              permission_denied: { required: true, status: 'validated' },
              artifact_missing: { required: true, status: 'validated' },
              checksum_mismatch: { required: true, status: 'validated' },
              delete_failure: { required: true, status: 'validated' },
            },
            documentedLimitations: {
              wsl_disabled: {
                required: false,
                status: 'documented',
                documentationReference: 'docs/exception-matrix-validation.md#wsl_disabled',
                recoverySummary: 'Enable Windows subsystem support and rerun precheck.',
              },
              reboot_interrupted: {
                required: false,
                status: 'documented',
                documentationReference: 'docs/exception-matrix-validation.md#reboot_interrupted',
                recoverySummary: 'Reopen the installer after reboot and resume.',
              },
              startup_failure: {
                required: false,
                status: 'documented',
                documentationReference: 'docs/exception-matrix-validation.md#startup_failure',
                recoverySummary: 'Use retry, rebuild, or delete and reinstall.',
              },
            },
          },
          lifecycle: [
            { action: 'install', finalStatus: 'succeeded', afterState: 'ready' },
            { action: 'start_agent', finalStatus: 'succeeded', afterState: 'running' },
            { action: 'stop_agent', finalStatus: 'succeeded', afterState: 'stopped' },
            { action: 'rebuild_environment', finalStatus: 'succeeded', afterState: 'ready' },
            { action: 'delete_environment', finalStatus: 'succeeded', afterState: 'not-installed' },
          ],
          exceptionValidation: [
            {
              case: 'permission_denied',
              triggerMethod: 'deny elevation prompt on controlled test host',
              errorCode: 'permission_denied',
              userVisibleMessage: 'permission denied',
              recommendedRecovery: 'request permission',
              actualRecoveryResult: 'recovered',
              evidence: 'permission-denied-log',
            },
            {
              case: 'wsl_disabled',
              triggerMethod: 'disable WSL optional feature on controlled test host',
              errorCode: 'wsl_not_enabled',
              userVisibleMessage: 'wsl disabled',
              recommendedRecovery: 'enable wsl',
              actualRecoveryResult: 'documented only',
              evidence: 'documentation-only',
              documentationReference: 'docs/exception-matrix-validation.md#wsl_disabled',
            },
            {
              case: 'reboot_interrupted',
              triggerMethod: 'interrupt reboot resume after WSL feature enablement',
              errorCode: 'reboot_required',
              userVisibleMessage: 'reboot required',
              recommendedRecovery: 'reboot',
              actualRecoveryResult: 'documented only',
              evidence: 'documentation-only',
              documentationReference: 'docs/exception-matrix-validation.md#reboot_interrupted',
            },
            {
              case: 'artifact_missing',
              triggerMethod: 'remove bundled agent artifact before install',
              errorCode: 'install_download_failed',
              userVisibleMessage: 'artifact missing',
              recommendedRecovery: 'restore bundle',
              actualRecoveryResult: 'recovered',
              evidence: 'artifact-missing-log',
            },
            {
              case: 'checksum_mismatch',
              triggerMethod: 'set mismatched bundled agent SHA256',
              errorCode: 'artifact_invalid',
              userVisibleMessage: 'checksum mismatch',
              recommendedRecovery: 'replace artifact',
              actualRecoveryResult: 'recovered',
              evidence: 'checksum-mismatch-log',
            },
            {
              case: 'startup_failure',
              triggerMethod: 'replace agent start script with failing script',
              errorCode: 'agent_start_failed',
              userVisibleMessage: 'startup failed',
              recommendedRecovery: 'rebuild',
              actualRecoveryResult: 'documented only',
              evidence: 'documentation-only',
              documentationReference: 'docs/exception-matrix-validation.md#startup_failure',
            },
            {
              case: 'delete_failure',
              triggerMethod: 'lock distro VHD during delete on controlled host',
              errorCode: 'delete_failed',
              userVisibleMessage: 'delete failed',
              recommendedRecovery: 'retry delete',
              actualRecoveryResult: 'recovered',
              evidence: 'delete-failure-log',
            },
          ],
          residualItems: {
            remainingWindowsPaths: ['C:\\AgentSecurity\\v2\\diagnostics'],
            removedWindowsPaths: ['C:\\AgentSecurity\\v2\\runtime'],
            distroPresentAfterDelete: false,
            logsRetainedForSupport: ['C:\\AgentSecurity\\v2\\reports'],
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

    const manifestPath = join(assetRoot, 'release-assets-manifest.json')
    await writeFile(
      manifestPath,
      `${JSON.stringify(
        {
          version: '2026.04.28-rc1',
          source: 'ubuntu-24.04-lts-official:test-rootfs',
          sourceCommit: 'abc123',
          agentName: 'OpenClaw',
          ubuntuVersion: '24.04-lts',
          nodeVersion: '24',
          openClawInstallSource: 'npm',
          openClawVersionPolicy: 'latest',
          updatePolicy: 'mostly-bundled',
          artifacts: {
            rootfs: {
              path: 'bridge/assets/agent-security-rootfs.tar',
              sha256: createHash('sha256').update(rootfsContent).digest('hex'),
            },
            agentPackage: {
              path: 'bridge/assets/openclaw-agent.pkg',
              sha256: createHash('sha256').update(agentContent).digest('hex'),
            },
            bootstrap: {
              path: 'bridge/assets/openclaw-bootstrap.sh',
              sha256: createHash('sha256').update(bootstrapContent).digest('hex'),
            },
          },
        },
        null,
        2,
      )}\n`,
      'utf8',
    )

    const { stdout } = await execFileAsync(
      process.execPath,
      ['scripts/validate-release-candidate.mjs', '--evidence', evidencePath],
      {
        cwd: 'A:\\AgentSecurity',
        env: {
          ...process.env,
          AGENT_SECURITY_RELEASE_ASSET_ROOT: assetRoot,
          AGENT_SECURITY_SKIP_SIGNATURE_VERIFICATION: '1',
        },
      },
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
          candidateVersion: 'v1.0.0-wsl2',
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
        process.execPath,
        ['scripts/validate-release-candidate.mjs', '--evidence', evidencePath],
        { cwd: 'A:\\AgentSecurity' },
      ),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining('Release evidence failed public launch checks.'),
    })
  })
})
