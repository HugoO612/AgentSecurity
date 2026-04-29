import { execFile } from 'node:child_process'
import type {
  CommandInvocation,
  CommandResult,
  ResolvedExecutionContext,
  ValidationResult,
} from './command-runner.ts'

export function buildStageArtifactsInvocation(
  context: ResolvedExecutionContext,
): CommandInvocation {
  return {
    program: 'powershell.exe',
    args: [
      '-NoProfile',
      '-Command',
      [
        `$installer='${escapePowershellString(context.bundledAgentArtifactPath)}'`,
        `$rootfs='${escapePowershellString(context.bundledRootfsPath)}'`,
        `$bootstrap='${escapePowershellString(context.bundledBootstrapPath)}'`,
        `$nodeTarball='${escapePowershellString(context.bundledNodeTarballPath)}'`,
        `$openClawTarball='${escapePowershellString(context.bundledOpenClawTarballPath)}'`,
        `$stagedInstaller='${escapePowershellString(context.stagedInstallerPath)}'`,
        `$stagedRootfs='${escapePowershellString(context.stagedRootfsPath)}'`,
        `$stagedBootstrap='${escapePowershellString(context.stagedBootstrapPath)}'`,
        `$stagedNodeTarball='${escapePowershellString(context.stagedNodeTarballPath)}'`,
        `$stagedOpenClawTarball='${escapePowershellString(context.stagedOpenClawTarballPath)}'`,
        'if (-not (Test-Path $installer)) { Write-Error "agent artifact missing"; exit 1 }',
        'if (-not (Test-Path $rootfs)) { Write-Error "rootfs artifact missing"; exit 1 }',
        'if (-not (Test-Path $bootstrap)) { Write-Error "OpenClaw bootstrap artifact missing"; exit 1 }',
        'if (-not (Test-Path $nodeTarball)) { Write-Error "Node runtime artifact missing"; exit 1 }',
        'if (-not (Test-Path $openClawTarball)) { Write-Error "OpenClaw npm tarball artifact missing"; exit 1 }',
        'Copy-Item -Force $installer $stagedInstaller',
        'Copy-Item -Force $rootfs $stagedRootfs',
        'Copy-Item -Force $bootstrap $stagedBootstrap',
        'Copy-Item -Force $nodeTarball $stagedNodeTarball',
        'Copy-Item -Force $openClawTarball $stagedOpenClawTarball',
        'Write-Output "artifacts-staged"',
      ].join('; '),
    ],
  }
}

export function buildVerifyChecksumInvocation(
  context: ResolvedExecutionContext,
): CommandInvocation {
  return {
    program: 'powershell.exe',
    args: [
      '-NoProfile',
      '-Command',
      [
        `$artifact='${escapePowershellString(context.stagedInstallerPath)}'`,
        `$rootfs='${escapePowershellString(context.stagedRootfsPath)}'`,
        `$bootstrap='${escapePowershellString(context.stagedBootstrapPath)}'`,
        `$nodeTarball='${escapePowershellString(context.stagedNodeTarballPath)}'`,
        `$openClawTarball='${escapePowershellString(context.stagedOpenClawTarballPath)}'`,
        'if (-not (Test-Path $artifact)) { Write-Error "staged artifact missing"; exit 1 }',
        'if (-not (Test-Path $rootfs)) { Write-Error "staged rootfs missing"; exit 1 }',
        'if (-not (Test-Path $bootstrap)) { Write-Error "staged bootstrap missing"; exit 1 }',
        'if (-not (Test-Path $nodeTarball)) { Write-Error "staged Node runtime missing"; exit 1 }',
        'if (-not (Test-Path $openClawTarball)) { Write-Error "staged OpenClaw npm tarball missing"; exit 1 }',
        '$stream=[IO.File]::OpenRead($artifact)',
        'try { $hash=([BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash($stream))).Replace("-","").ToLower() } finally { $stream.Dispose() }',
        '$rootfsStream=[IO.File]::OpenRead($rootfs)',
        'try { $rootfsHash=([BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash($rootfsStream))).Replace("-","").ToLower() } finally { $rootfsStream.Dispose() }',
        '$bootstrapStream=[IO.File]::OpenRead($bootstrap)',
        'try { $bootstrapHash=([BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash($bootstrapStream))).Replace("-","").ToLower() } finally { $bootstrapStream.Dispose() }',
        '$nodeStream=[IO.File]::OpenRead($nodeTarball)',
        'try { $nodeHash=([BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash($nodeStream))).Replace("-","").ToLower() } finally { $nodeStream.Dispose() }',
        '$openClawStream=[IO.File]::OpenRead($openClawTarball)',
        'try { $openClawHash=([BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash($openClawStream))).Replace("-","").ToLower() } finally { $openClawStream.Dispose() }',
        `Write-Output "sha256=$hash"`,
        'Write-Output "rootfsSha256=$rootfsHash"',
        'Write-Output "bootstrapSha256=$bootstrapHash"',
        'Write-Output "nodeTarballSha256=$nodeHash"',
        'Write-Output "openClawTarballSha256=$openClawHash"',
      ].join('; '),
    ],
    validate: (result) => validateChecksumResult(result, context),
  }
}

export function validateChecksumResult(
  result: CommandResult,
  context: ResolvedExecutionContext,
): ValidationResult {
  const actual = extractHash(result.stdout)
  const actualRootfs = extractRootfsHash(result.stdout)
  const actualBootstrap = extractBootstrapHash(result.stdout)
  const actualNodeTarball = extractNodeTarballHash(result.stdout)
  const actualOpenClawTarball = extractOpenClawTarballHash(result.stdout)
  if (!actual) {
    return {
      ok: false,
      failureCode: 'artifact_hash_missing',
      detail: result.stderr || result.stdout,
    }
  }

  if (context.installerChecksum === 'dev-skip-checksum') {
    return context.allowDevShim
      ? { ok: true }
      : {
          ok: false,
          failureCode: 'artifact_checksum_unconfigured',
          detail: 'A real checksum is required when development shims are disabled.',
        }
  }
  if (!actualRootfs) {
    return {
      ok: false,
      failureCode: 'rootfs_hash_missing',
      detail: result.stderr || result.stdout,
    }
  }
  if (context.bundledRootfsChecksum === 'dev-skip-checksum') {
    return context.allowDevShim
      ? { ok: true }
      : {
          ok: false,
          failureCode: 'rootfs_checksum_unconfigured',
          detail: 'A real rootfs checksum is required when development shims are disabled.',
        }
  }
  if (actualRootfs !== context.bundledRootfsChecksum.toLowerCase()) {
    return {
      ok: false,
      failureCode: 'rootfs_invalid',
      detail: `Expected rootfs ${context.bundledRootfsChecksum.toLowerCase()} but received ${actualRootfs}`,
    }
  }
  if (!actualBootstrap) {
    return {
      ok: false,
      failureCode: 'bootstrap_hash_missing',
      detail: result.stderr || result.stdout,
    }
  }
  if (context.bundledBootstrapChecksum === 'dev-skip-checksum') {
    return context.allowDevShim
      ? { ok: true }
      : {
          ok: false,
          failureCode: 'bootstrap_checksum_unconfigured',
          detail: 'A real bootstrap checksum is required when development shims are disabled.',
        }
  }
  if (actualBootstrap !== context.bundledBootstrapChecksum.toLowerCase()) {
    return {
      ok: false,
      failureCode: 'bootstrap_invalid',
      detail: `Expected bootstrap ${context.bundledBootstrapChecksum.toLowerCase()} but received ${actualBootstrap}`,
    }
  }
  if (!actualNodeTarball) {
    return {
      ok: false,
      failureCode: 'node_tarball_hash_missing',
      detail: result.stderr || result.stdout,
    }
  }
  if (context.bundledNodeTarballChecksum === 'dev-skip-checksum') {
    return context.allowDevShim
      ? { ok: true }
      : {
          ok: false,
          failureCode: 'node_tarball_checksum_unconfigured',
          detail: 'A real Node runtime checksum is required when development shims are disabled.',
        }
  }
  if (actualNodeTarball !== context.bundledNodeTarballChecksum.toLowerCase()) {
    return {
      ok: false,
      failureCode: 'node_tarball_invalid',
      detail: `Expected Node runtime ${context.bundledNodeTarballChecksum.toLowerCase()} but received ${actualNodeTarball}`,
    }
  }
  if (!actualOpenClawTarball) {
    return {
      ok: false,
      failureCode: 'openclaw_tarball_hash_missing',
      detail: result.stderr || result.stdout,
    }
  }
  if (context.bundledOpenClawTarballChecksum === 'dev-skip-checksum') {
    return context.allowDevShim
      ? { ok: true }
      : {
          ok: false,
          failureCode: 'openclaw_tarball_checksum_unconfigured',
          detail: 'A real OpenClaw npm tarball checksum is required when development shims are disabled.',
        }
  }
  if (actualOpenClawTarball !== context.bundledOpenClawTarballChecksum.toLowerCase()) {
    return {
      ok: false,
      failureCode: 'openclaw_tarball_invalid',
      detail: `Expected OpenClaw npm tarball ${context.bundledOpenClawTarballChecksum.toLowerCase()} but received ${actualOpenClawTarball}`,
    }
  }

  return actual === context.installerChecksum.toLowerCase()
    ? { ok: true }
    : {
        ok: false,
        failureCode: 'artifact_invalid',
        detail: `Expected ${context.installerChecksum.toLowerCase()} but received ${actual}`,
      }
}

export function buildInstallAgentInvocation(
  context: ResolvedExecutionContext,
): CommandInvocation {
  return {
    program: 'powershell.exe',
    args: [
      '-NoProfile',
      '-Command',
      [
        `$artifact='${escapePowershellString(context.stagedInstallerPath)}'`,
        `$bootstrap='${escapePowershellString(context.stagedBootstrapPath)}'`,
        `$nodeTarball='${escapePowershellString(context.stagedNodeTarballPath)}'`,
        `$openClawTarball='${escapePowershellString(context.stagedOpenClawTarballPath)}'`,
        `$name=[IO.Path]::GetFileName($artifact)`,
        `$destRoot='\\\\wsl$\\${escapePowershellString(context.targetDistro)}\\opt\\agent-security'`,
        `$bootstrapTarget='\\\\wsl$\\${escapePowershellString(context.targetDistro)}\\opt\\agent-security\\bootstrap\\openclaw-bootstrap.sh'`,
        `$nodeTarballTarget='\\\\wsl$\\${escapePowershellString(context.targetDistro)}\\opt\\agent-security\\bootstrap\\node-v24-linux-x64.tar.xz'`,
        `$openClawTarballTarget='\\\\wsl$\\${escapePowershellString(context.targetDistro)}\\opt\\agent-security\\bootstrap\\openclaw-2026.4.26.tgz'`,
        '$destInbox=Join-Path $destRoot "inbox"',
        '$destCurrent=Join-Path $destRoot "current"',
        'if (-not (Test-Path $artifact)) { Write-Error "staged artifact missing"; exit 1 }',
        'if (-not (Test-Path $bootstrap)) { Write-Error "staged bootstrap missing"; exit 1 }',
        'if (-not (Test-Path $nodeTarball)) { Write-Error "staged Node runtime missing"; exit 1 }',
        'if (-not (Test-Path $openClawTarball)) { Write-Error "staged OpenClaw npm tarball missing"; exit 1 }',
        'New-Item -ItemType Directory -Force -Path $destInbox | Out-Null',
        'New-Item -ItemType Directory -Force -Path $destCurrent | Out-Null',
        'New-Item -ItemType Directory -Force -Path (Split-Path -Parent $bootstrapTarget) | Out-Null',
        'Copy-Item -Force $artifact (Join-Path $destInbox $name)',
        'Copy-Item -Force $bootstrap $bootstrapTarget',
        'Copy-Item -Force $nodeTarball $nodeTarballTarget',
        'Copy-Item -Force $openClawTarball $openClawTarballTarget',
        `& wsl.exe -d '${escapePowershellString(context.targetDistro)}' -- sh -lc "chmod +x /opt/agent-security/bootstrap/openclaw-bootstrap.sh && NODE_MAJOR='${escapePowershellString(context.nodeVersion)}' OPENCLAW_PACKAGE='${escapePowershellString(context.openClawPackageName)}' OPENCLAW_VERSION_POLICY='latest' AGENT_SECURITY_NODE_TARBALL='/opt/agent-security/bootstrap/node-v24-linux-x64.tar.xz' AGENT_SECURITY_NODE_TARBALL_SHA256='${escapePowershellString(context.bundledNodeTarballChecksum)}' AGENT_SECURITY_OPENCLAW_TARBALL='/opt/agent-security/bootstrap/openclaw-2026.4.26.tgz' AGENT_SECURITY_OPENCLAW_TARBALL_SHA256='${escapePowershellString(context.bundledOpenClawTarballChecksum)}' /opt/agent-security/bootstrap/openclaw-bootstrap.sh"`,
        'if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }',
        '# The compatibility package is staged for evidence only; OpenClaw v1 installs from npm in the bootstrap step.',
        '$receipt=@("source=$name","installedAt=$(Get-Date -Format o)") -join "`n"',
        'Set-Content -Path (Join-Path $destRoot "install-receipt.txt") -Value $receipt',
        'Write-Output "installed"',
      ].join('; '),
    ],
    cleanupOnTimeout: () => {
      killOpenClawBootstrap(context.targetDistro)
    },
  }
}

function killOpenClawBootstrap(targetDistro: string) {
  execFile(
    'wsl.exe',
    [
      '-d',
      targetDistro,
      '--',
      'sh',
      '-lc',
      'pkill -f "npm .*openclaw" || true; pkill -f openclaw-bootstrap || true',
    ],
    { windowsHide: true },
    () => {},
  )
}

function extractHash(stdout: string) {
  const match = stdout.match(/sha256=([0-9a-f]+)/i)
  return match?.[1]?.toLowerCase()
}

function extractRootfsHash(stdout: string) {
  const match = stdout.match(/rootfsSha256=([0-9a-f]+)/i)
  return match?.[1]?.toLowerCase()
}

function extractBootstrapHash(stdout: string) {
  const match = stdout.match(/bootstrapSha256=([0-9a-f]+)/i)
  return match?.[1]?.toLowerCase()
}

function extractNodeTarballHash(stdout: string) {
  const match = stdout.match(/nodeTarballSha256=([0-9a-f]+)/i)
  return match?.[1]?.toLowerCase()
}

function extractOpenClawTarballHash(stdout: string) {
  const match = stdout.match(/openClawTarballSha256=([0-9a-f]+)/i)
  return match?.[1]?.toLowerCase()
}

function escapePowershellString(value: string) {
  return value.replace(/'/g, "''")
}
