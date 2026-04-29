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
        `$stagedInstaller='${escapePowershellString(context.stagedInstallerPath)}'`,
        `$stagedRootfs='${escapePowershellString(context.stagedRootfsPath)}'`,
        `$stagedBootstrap='${escapePowershellString(context.stagedBootstrapPath)}'`,
        'if (-not (Test-Path $installer)) { Write-Error "agent artifact missing"; exit 1 }',
        'if (-not (Test-Path $rootfs)) { Write-Error "rootfs artifact missing"; exit 1 }',
        'if (-not (Test-Path $bootstrap)) { Write-Error "OpenClaw bootstrap artifact missing"; exit 1 }',
        'Copy-Item -Force $installer $stagedInstaller',
        'Copy-Item -Force $rootfs $stagedRootfs',
        'Copy-Item -Force $bootstrap $stagedBootstrap',
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
        'if (-not (Test-Path $artifact)) { Write-Error "staged artifact missing"; exit 1 }',
        'if (-not (Test-Path $rootfs)) { Write-Error "staged rootfs missing"; exit 1 }',
        'if (-not (Test-Path $bootstrap)) { Write-Error "staged bootstrap missing"; exit 1 }',
        '$stream=[IO.File]::OpenRead($artifact)',
        'try { $hash=([BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash($stream))).Replace("-","").ToLower() } finally { $stream.Dispose() }',
        '$rootfsStream=[IO.File]::OpenRead($rootfs)',
        'try { $rootfsHash=([BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash($rootfsStream))).Replace("-","").ToLower() } finally { $rootfsStream.Dispose() }',
        '$bootstrapStream=[IO.File]::OpenRead($bootstrap)',
        'try { $bootstrapHash=([BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash($bootstrapStream))).Replace("-","").ToLower() } finally { $bootstrapStream.Dispose() }',
        `Write-Output "sha256=$hash"`,
        'Write-Output "rootfsSha256=$rootfsHash"',
        'Write-Output "bootstrapSha256=$bootstrapHash"',
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
        `$name=[IO.Path]::GetFileName($artifact)`,
        `$destRoot='\\\\wsl$\\${escapePowershellString(context.targetDistro)}\\opt\\agent-security'`,
        `$bootstrapTarget='\\\\wsl$\\${escapePowershellString(context.targetDistro)}\\opt\\agent-security\\bootstrap\\openclaw-bootstrap.sh'`,
        '$destInbox=Join-Path $destRoot "inbox"',
        '$destCurrent=Join-Path $destRoot "current"',
        'if (-not (Test-Path $artifact)) { Write-Error "staged artifact missing"; exit 1 }',
        'if (-not (Test-Path $bootstrap)) { Write-Error "staged bootstrap missing"; exit 1 }',
        'New-Item -ItemType Directory -Force -Path $destInbox | Out-Null',
        'New-Item -ItemType Directory -Force -Path $destCurrent | Out-Null',
        'New-Item -ItemType Directory -Force -Path (Split-Path -Parent $bootstrapTarget) | Out-Null',
        'Copy-Item -Force $artifact (Join-Path $destInbox $name)',
        'Copy-Item -Force $bootstrap $bootstrapTarget',
        `& wsl.exe -d '${escapePowershellString(context.targetDistro)}' -- sh -lc "chmod +x /opt/agent-security/bootstrap/openclaw-bootstrap.sh && NODE_MAJOR='${escapePowershellString(context.nodeVersion)}' OPENCLAW_PACKAGE='${escapePowershellString(context.openClawPackageName)}' OPENCLAW_VERSION_POLICY='latest' /opt/agent-security/bootstrap/openclaw-bootstrap.sh"`,
        'if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }',
        '$lower=$name.ToLowerInvariant()',
        'if ($lower.EndsWith(".sh")) {',
        `  & wsl.exe -d '${escapePowershellString(context.targetDistro)}' -- sh -lc "chmod +x /opt/agent-security/inbox/$name && /opt/agent-security/inbox/$name"`,
        '  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }',
        '} else {',
        `  & wsl.exe -d '${escapePowershellString(context.targetDistro)}' -- sh -lc "mkdir -p /opt/agent-security/current && tar -tf /opt/agent-security/inbox/$name >/dev/null 2>&1 && tar -xf /opt/agent-security/inbox/$name -C /opt/agent-security/current"`,
        '  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }',
        '}',
        '$receipt=@("source=$name","installedAt=$(Get-Date -Format o)") -join "`n"',
        'Set-Content -Path (Join-Path $destRoot "install-receipt.txt") -Value $receipt',
        'Write-Output "installed"',
      ].join('; '),
    ],
  }
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

function escapePowershellString(value: string) {
  return value.replace(/'/g, "''")
}
